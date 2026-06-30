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
]);

function isTransientDbError(err: unknown): boolean {
    const code = (err as { code?: string })?.code;
    const message = String((err as Error)?.message || err);
    if (code && TRANSIENT_DB_CODES.has(code)) return true;
    return /timeout|connection|terminated|closed|pool/i.test(message);
}

export function isDbConfigured(): boolean {
    return Boolean(String(process.env.DATABASE_URL || '').trim());
}

export async function resetDbConnection(): Promise<void> {
    if (!sql) return;
    try {
        await sql.end({ timeout: 2 });
    } catch {
        /* ignore */
    }
    sql = null;
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
        sql = postgres(String(process.env.DATABASE_URL), {
            ssl: 'require',
            prepare: false,
            fetch_types: false,
            max: isServerless ? 2 : 4,
            connect_timeout: isServerless ? 20 : 5,
            idle_timeout: isServerless ? 15 : 20,
            max_lifetime: 60 * 5,
        });
    }

    return sql;
}

export async function dbQuery<T>(fn: (sql: ReturnType<typeof postgres>) => Promise<T>): Promise<T | null> {
    if (!isDbConfigured()) {
        return null;
    }

    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            return await fn(useDb());
        } catch (err: unknown) {
            const code = (err as { code?: string })?.code;
            if (code === '42P01' || code === '42703') {
                return null;
            }
            if (attempt < 2 && isTransientDbError(err)) {
                await resetDbConnection();
                continue;
            }
            throw err;
        }
    }

    return null;
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
        const rows = await withTimeout(
            useDb()`SELECT COUNT(*)::int AS n FROM pharmacist_account WHERE status_verify = 1`,
            timeoutMs,
            'DB ping',
        );
        return { ok: true, pharmacists_verified: Number(rows[0]?.n ?? 0) };
    } catch (err: unknown) {
        if (isTransientDbError(err)) {
            await resetDbConnection();
        }
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
