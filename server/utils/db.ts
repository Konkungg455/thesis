import postgres from 'postgres';

let sql: ReturnType<typeof postgres> | null = null;

const TRANSIENT_DB_CODES = new Set([
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    '53300',
    '57P01',
    '08006',
    '08003',
    'XX000',
    'CONNECTION_DESTROYED',
    'CONNECTION_ENDED',
]);

/** คิว DB — กัน concurrent query ชนกันตอน pooler 6543 ตัด connection */
let dbQueue: Promise<unknown> = Promise.resolve();

function usesSupabasePooler(url?: string): boolean {
    return /pooler\.supabase\.com:6543/i.test(String(url || process.env.DATABASE_URL || ''));
}

function isTransientDbError(err: unknown): boolean {
    const code = (err as { code?: string })?.code;
    const message = String((err as Error)?.message || err);
    if (code && TRANSIENT_DB_CODES.has(code)) return true;
    return /timeout|connection|terminated|closed|pool|destroyed|ended|broken/i.test(message);
}

export function isDbConfigured(): boolean {
    return Boolean(String(process.env.DATABASE_URL || '').trim());
}

/** Supabase pooler 6543 — ใส่ pgbouncer=true อัตโนมัติถ้ายังไม่มี */
export function normalizeDatabaseUrl(raw?: string): string {
    const url = String(raw || process.env.DATABASE_URL || '').trim();
    if (!url) return url;
    if (!/pooler\.supabase\.com:6543/.test(url)) return url;
    if (/[?&]pgbouncer=true/i.test(url)) return url;
    return url.includes('?') ? `${url}&pgbouncer=true` : `${url}?pgbouncer=true`;
}

export async function resetDbConnection(): Promise<void> {
    const old = sql;
    sql = null;
    if (!old) return;
    try {
        await old.end({ timeout: 2 });
    } catch {
        /* ignore */
    }
}

function runDbExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = dbQueue.then(fn, fn);
    dbQueue = run.then(
        () => undefined,
        () => undefined,
    );
    return run;
}

export function useDb() {
    if (!isDbConfigured()) {
        throw createError({
            statusCode: 503,
            statusMessage: 'DATABASE_URL is not configured',
        });
    }

    if (!sql) {
        const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
        const isLocalDev = !isServerless;
        const dbUrl = normalizeDatabaseUrl();
        const pooler = usesSupabasePooler(dbUrl);
        // pooler 6543: transaction mode — connection สั้น, หมุนเร็ว, ไม่ใช้ prepared statements
        sql = postgres(dbUrl, {
            ssl: 'require',
            prepare: false,
            fetch_types: false,
            max: isServerless ? 1 : (pooler ? 2 : 4),
            connect_timeout: isServerless ? 25 : 15,
            idle_timeout: pooler ? (isLocalDev ? 20 : 10) : 20,
            max_lifetime: pooler ? (isLocalDev ? 120 : 60) : 60 * 10,
        });
    }

    return sql;
}

export async function dbQuery<T>(
    fn: (sql: ReturnType<typeof postgres>) => Promise<T>,
    options?: { timeoutMs?: number },
): Promise<T | null> {
    if (!isDbConfigured()) {
        return null;
    }

    return runDbExclusive(async () => {
        const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
        const timeoutMs = options?.timeoutMs ?? (isServerless ? 16_000 : 30_000);
        const maxAttempts = usesSupabasePooler() ? 5 : 4;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                return await withTimeout(fn(useDb()), timeoutMs, 'DB query');
            } catch (err: unknown) {
                const code = (err as { code?: string })?.code;
                if (code === '42P01' || code === '42703') {
                    return null;
                }
                if (attempt < maxAttempts - 1 && isTransientDbError(err)) {
                    await resetDbConnection();
                    await new Promise((r) => setTimeout(r, 150 * (attempt + 1) ** 2));
                    continue;
                }
                throw err;
            }
        }

        return null;
    });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => {
            setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs}ms`)), timeoutMs);
        }),
    ]);
}

/** ทดสอบ connection จริง — ใช้ใน /api/deploy/health */
export async function pingDb(timeoutMs = 12000): Promise<{ ok: boolean; error?: string; pharmacists_verified?: number }> {
    if (!isDbConfigured()) {
        return { ok: false, error: 'DATABASE_URL missing' };
    }

    try {
        const rows = await dbQuery(async (sql) => sql`
            SELECT COUNT(*)::int AS n FROM pharmacist_account WHERE status_verify = 1
        `, { timeoutMs });
        if (!rows) {
            return { ok: false, error: 'DB query returned no rows' };
        }
        return { ok: true, pharmacists_verified: Number(rows[0]?.n ?? 0) };
    } catch (err: unknown) {
        const e = err as { message?: string; code?: string };
        const message = e.message || String(err);
        return { ok: false, error: e.code ? `${e.code}: ${message}` : message };
    }
}

export function dbUnavailableMessage(): string {
    if (!isDbConfigured()) {
        return 'DATABASE_URL ยังไม่ได้ตั้งค่า — คัด import.env เป็น .env แล้ว restart (local) หรือ Import env บน Vercel แล้ว Redeploy';
    }
    return 'เชื่อมต่อ Supabase PostgreSQL ไม่สำเร็จ — ใช้ pooler port 6543 ใน DATABASE_URL';
}
