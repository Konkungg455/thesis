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
            connect_timeout: 5,
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
