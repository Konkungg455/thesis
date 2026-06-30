import postgres from 'postgres';

let sql: ReturnType<typeof postgres> | null = null;

export function isDbConfigured(): boolean {
    return Boolean(String(process.env.DATABASE_URL || '').trim());
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
            max: isServerless ? 1 : 4,
            connect_timeout: isServerless ? 10 : 5,
            idle_timeout: 20,
            max_lifetime: 60 * 10,
        });
    }

    return sql;
}

export async function dbQuery<T>(fn: (sql: ReturnType<typeof postgres>) => Promise<T>): Promise<T | null> {
    if (!isDbConfigured()) {
        return null;
    }

    try {
        return await fn(useDb());
    } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (code === '42P01' || code === '42703') {
            return null;
        }
        throw err;
    }
}

/** ทดสอบ connection จริง — ใช้ใน /api/deploy/health */
export async function pingDb(): Promise<{ ok: boolean; error?: string; pharmacists_verified?: number }> {
    if (!isDbConfigured()) {
        return { ok: false, error: 'DATABASE_URL missing' };
    }

    try {
        const rows = await useDb()`SELECT COUNT(*)::int AS n FROM pharmacist_account WHERE status_verify = 1`;
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
