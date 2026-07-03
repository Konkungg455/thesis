export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_LOCK_MINUTES = 5;

const ROLE_LABELS: Record<string, string> = {
    user: 'ผู้ใช้งาน',
    pharmacist: 'เภสัชกร',
    store: 'เจ้าของร้าน',
    admin: 'ผู้ดูแลระบบ',
};

function labelForRole(role: string): string {
    return ROLE_LABELS[role] || role;
}

function minutesUntil(until: Date): number {
    const ms = until.getTime() - Date.now();
    return Math.max(1, Math.ceil(ms / 60_000));
}

let tableReady = false;

async function ensureLoginLockoutTable() {
    if (tableReady || !isDbConfigured()) return;
    await dbQuery(async (sql) => {
        await sql`
            CREATE TABLE IF NOT EXISTS login_lockout (
                role VARCHAR(20) NOT NULL,
                email VARCHAR(255) NOT NULL,
                failed_attempts INT NOT NULL DEFAULT 0,
                locked_until TIMESTAMPTZ NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (role, email)
            )
        `;
    });
    tableReady = true;
}

type LockoutRow = {
    failed_attempts: number;
    locked_until: Date | string | null;
};

async function getLockoutRow(role: string, email: string): Promise<LockoutRow | null> {
    await ensureLoginLockoutTable();
    const rows = await dbQuery(async (sql) => sql`
        SELECT failed_attempts, locked_until
        FROM login_lockout
        WHERE role = ${role} AND email = ${email}
        LIMIT 1
    `);
    return (rows?.[0] as LockoutRow | undefined) || null;
}

async function resetLockout(role: string, email: string) {
    await dbQuery(async (sql) => sql`
        DELETE FROM login_lockout WHERE role = ${role} AND email = ${email}
    `);
}

export async function clearLoginLockout(role: string, email: string) {
    if (!isDbConfigured()) return;
    await resetLockout(role, email);
}

export type LoginLockResponse = {
    status: 'locked';
    message: string;
    locked_minutes: number;
};

export async function checkLoginLockout(role: string, email: string): Promise<LoginLockResponse | null> {
    if (!isDbConfigured()) return null;

    const row = await getLockoutRow(role, email);
    if (!row?.locked_until) return null;

    const until = new Date(row.locked_until);
    if (Number.isNaN(until.getTime()) || until.getTime() <= Date.now()) {
        await resetLockout(role, email);
        return null;
    }

    const minutes = minutesUntil(until);
    return {
        status: 'locked',
        message: `ล็อกอินผิดเกินจำนวนที่กำหนด — บัญชี${labelForRole(role)}ถูกระงับชั่วคราว กรุณาลองใหม่ในอีก ${minutes} นาที`,
        locked_minutes: minutes,
    };
}

export async function recordLoginFailure(
    role: string,
    email: string,
    baseMessage: string,
): Promise<LoginLockResponse | { status: 'error'; message: string; attempts_left: number }> {
    if (!isDbConfigured()) {
        return { status: 'error', message: baseMessage, attempts_left: LOGIN_MAX_ATTEMPTS - 1 };
    }

    await ensureLoginLockoutTable();

    const existing = await getLockoutRow(role, email);
    const prevAttempts = Number(existing?.failed_attempts || 0);
    const newAttempts = prevAttempts + 1;

    if (newAttempts >= LOGIN_MAX_ATTEMPTS) {
        const lockSql = `
            INSERT INTO login_lockout (role, email, failed_attempts, locked_until, updated_at)
            VALUES ($1, $2, $3, NOW() + INTERVAL '${LOGIN_LOCK_MINUTES} minutes', NOW())
            ON CONFLICT (role, email) DO UPDATE SET
                failed_attempts = $3,
                locked_until = NOW() + INTERVAL '${LOGIN_LOCK_MINUTES} minutes',
                updated_at = NOW()
        `;
        await dbQuery(async (sql) => sql.unsafe(lockSql, [role, email, LOGIN_MAX_ATTEMPTS]));
        return {
            status: 'locked',
            message: `ล็อกอินผิดเกินจำนวนที่กำหนด — บัญชี${labelForRole(role)}ถูกระงับชั่วคราว ${LOGIN_LOCK_MINUTES} นาที กรุณาลองใหม่ภายหลัง`,
            locked_minutes: LOGIN_LOCK_MINUTES,
        };
    }

    await dbQuery(async (sql) => sql`
        INSERT INTO login_lockout (role, email, failed_attempts, locked_until, updated_at)
        VALUES (${role}, ${email}, ${newAttempts}, NULL, NOW())
        ON CONFLICT (role, email) DO UPDATE SET
            failed_attempts = ${newAttempts},
            locked_until = NULL,
            updated_at = NOW()
    `);

    const attemptsLeft = LOGIN_MAX_ATTEMPTS - newAttempts;
    return {
        status: 'error',
        message: `${baseMessage} — เหลืออีก ${attemptsLeft} ครั้งก่อนบัญชี${labelForRole(role)}ถูกระงับ ${LOGIN_LOCK_MINUTES} นาที`,
        attempts_left: attemptsLeft,
    };
}
