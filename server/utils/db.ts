import postgres from 'postgres';

let sql: ReturnType<typeof postgres> | null = null;
let sqlUrl: string | null = null;
let lastDbError: string | null = null;
let consecutiveQueryTimeouts = 0;

const TRANSIENT_DB_CODES = new Set([
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EAI_AGAIN',
    '53300',
    '57P01',
    '08006',
    '08003',
    'XX000',
    'CONNECTION_DESTROYED',
    'CONNECTION_ENDED',
]);

/** จำกัด concurrent query — ไม่ serialize ทั้งก้อน */
let activeQueries = 0;
const waitQueue: Array<() => void> = [];

function isServerlessRuntime(): boolean {
    return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

function maxConcurrentQueries(): number {
    // serverless ใช้ max:1 connection — ห้ามยิง query ซ้อนเกิน 1 กัน connection ค้าง/timeout แล้ว reset
    if (isServerlessRuntime()) return 1;
    return usesSupabasePooler() ? 4 : 8;
}

function defaultQueryTimeoutMs(): number {
    return isServerlessRuntime() ? 30_000 : 35_000;
}

async function acquireDbSlot(): Promise<void> {
    if (activeQueries < maxConcurrentQueries()) {
        activeQueries += 1;
        return;
    }
    await new Promise<void>((resolve) => {
        waitQueue.push(() => {
            activeQueries += 1;
            resolve();
        });
    });
}

function releaseDbSlot(): void {
    activeQueries = Math.max(0, activeQueries - 1);
    const next = waitQueue.shift();
    if (next) next();
}

function rememberDbError(err: unknown): void {
    const e = err as { code?: string; message?: string };
    const message = e.message || String(err);
    lastDbError = e.code ? `${e.code}: ${message}` : message;
}

export function getLastDbError(): string | null {
    return lastDbError;
}

/** อ่าน URL จาก env หลายชื่อ (Vercel / Supabase integration) */
export function resolveDatabaseUrlRaw(): string {
    const candidates = [
        process.env.DATABASE_POOLER_URL,
        process.env.DATABASE_URL,
        process.env.POSTGRES_PRISMA_URL,
        process.env.POSTGRES_URL,
    ];
    for (const c of candidates) {
        const v = String(c || '').trim();
        if (v) return v;
    }
    return '';
}

function supabaseProjectRef(): string {
    const url = String(
        process.env.SUPABASE_URL
        || process.env.NUXT_PUBLIC_SUPABASE_URL
        || '',
    ).trim();
    const m = url.match(/https?:\/\/([^.]+)\.supabase\.co/i);
    return m?.[1] || '';
}

function poolerHost(): string {
    return String(
        process.env.SUPABASE_POOLER_HOST
        || process.env.SUPABASE_DB_POOLER_HOST
        || 'aws-1-ap-southeast-1.pooler.supabase.com',
    ).trim();
}

/**
 * บน Vercel/serverless: ถ้าใส่ direct db.xxx.supabase.co:5432 ให้สลับเป็น pooler 6543 อัตโนมัติ
 * (direct connection มักล้มบน serverless / IPv6)
 */
export function autoFixSupabaseUrlForRuntime(raw: string): string {
    let url = String(raw || '').trim();
    if (!url) return url;

    const isDirectDbHost = /@db\.[^/]+\.supabase\.co:5432/i.test(url)
        || (/\.supabase\.co:5432/i.test(url) && !/pooler\.supabase\.com/i.test(url));

    if (isServerlessRuntime() && isDirectDbHost) {
        try {
            const normalized = url.replace(/^postgresql:/i, 'postgres:');
            const u = new URL(normalized);
            const ref = supabaseProjectRef() || u.hostname.replace(/^db\./, '').replace(/\.supabase\.co$/, '');
            const password = u.password ? decodeURIComponent(u.password) : '';
            const user = u.username?.includes('.') ? u.username : `postgres.${ref}`;
            if (ref && password) {
                const host = poolerHost();
                url = `postgresql://${user}:${encodeURIComponent(password)}@${host}:6543/postgres`;
            }
        } catch {
            /* keep original */
        }
    }

    return url;
}

export function usesSupabasePooler(url?: string): boolean {
    return /pooler\.supabase\.com:6543/i.test(String(url || resolveDatabaseUrl() || ''));
}

function isQueryTimeoutError(err: unknown): boolean {
    return /DB query timeout after/i.test(String((err as Error)?.message || err));
}

/** ข้อผิดพลาดที่เกี่ยวกับ connection จริง — ต้อง reset pool */
function isConnectionError(err: unknown): boolean {
    const code = (err as { code?: string })?.code;
    const message = String((err as Error)?.message || err);
    if (isQueryTimeoutError(err)) return false;
    if (code && TRANSIENT_DB_CODES.has(code)) {
        // ETIMEDOUT จาก query ช้าอาจไม่ใช่ connection พัง — ลอง retry ก่อน reset
        if (code === 'ETIMEDOUT' && !/connect|connection|socket/i.test(message)) {
            return false;
        }
        return true;
    }
    return /ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|CONNECTION_DESTROYED|CONNECTION_ENDED|connection terminated|terminated unexpectedly|server closed the connection|broken pipe|57P01|53300|08006|08003|XX000/i.test(message);
}

function isRetryableDbError(err: unknown): boolean {
    return isConnectionError(err) || isQueryTimeoutError(err);
}

export function isDbConfigured(): boolean {
    return Boolean(resolveDatabaseUrlRaw());
}

/** Supabase pooler 6543 — ใส่ pgbouncer=true + sslmode=require อัตโนมัติ */
export function normalizeDatabaseUrl(raw?: string): string {
    let url = String(raw || resolveDatabaseUrlRaw() || '').trim();
    if (!url) return url;

    url = autoFixSupabaseUrlForRuntime(url);

    if (/pooler\.supabase\.com:6543/.test(url)) {
        if (!/[?&]pgbouncer=true/i.test(url)) {
            url = url.includes('?') ? `${url}&pgbouncer=true` : `${url}?pgbouncer=true`;
        }
    }

    if (/supabase\.(co|com)/i.test(url) && !/[?&]sslmode=/i.test(url)) {
        url = url.includes('?') ? `${url}&sslmode=require` : `${url}?sslmode=require`;
    }

    return url;
}

export function resolveDatabaseUrl(): string {
    return normalizeDatabaseUrl(resolveDatabaseUrlRaw());
}

export async function resetDbConnection(): Promise<void> {
    const old = sql;
    sql = null;
    sqlUrl = null;
    if (!old) return;
    try {
        await old.end({ timeout: 2 });
    } catch {
        /* ignore */
    }
}

function detachStaleDbClient(): void {
    if (!sql) return;
    const old = sql;
    sql = null;
    sqlUrl = null;
    void old.end({ timeout: 0 }).catch(() => {});
}

/** ลองใช้ connection เดิมก่อน — ลด reset ที่ไม่จำเป็นบน Vercel */
async function connectionStillAlive(): Promise<boolean> {
    if (!sql) return false;
    try {
        await withTimeout(sql`SELECT 1 AS ok`, 4_000, 'DB ping');
        return true;
    } catch {
        return false;
    }
}

async function recoverOrResetConnection(): Promise<void> {
    if (await connectionStillAlive()) return;
    await resetDbConnection();
}

export function useDb() {
    if (!isDbConfigured()) {
        throw createError({
            statusCode: 503,
            statusMessage: 'DATABASE_URL is not configured',
        });
    }

    const dbUrl = resolveDatabaseUrl();
    if (sql && sqlUrl && sqlUrl !== dbUrl) {
        detachStaleDbClient();
    }

    if (!sql) {
        const isServerless = isServerlessRuntime();
        const pooler = usesSupabasePooler(dbUrl);
        sqlUrl = dbUrl;
        sql = postgres(dbUrl, {
            ssl: 'require',
            prepare: false,
            fetch_types: false,
            max: isServerless ? 1 : (pooler ? 4 : 6),
            connect_timeout: isServerless ? 18 : 15,
            // pooler จัดการ connection ฝั่ง server — อย่าปิด client เร็วเกินไปภายใน warm lambda
            idle_timeout: isServerless ? (pooler ? 45 : 20) : (pooler ? 25 : 25),
            max_lifetime: isServerless ? (pooler ? 600 : 120) : (pooler ? 120 : 60 * 10),
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

    await acquireDbSlot();
    try {
        const baseTimeoutMs = options?.timeoutMs ?? defaultQueryTimeoutMs();
        const maxAttempts = usesSupabasePooler() ? 3 : 2;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const timeoutMs = baseTimeoutMs + (attempt * 5_000);
            try {
                const result = await withTimeout(fn(useDb()), timeoutMs, 'DB query');
                lastDbError = null;
                consecutiveQueryTimeouts = 0;
                return result;
            } catch (err: unknown) {
                rememberDbError(err);
                const code = (err as { code?: string })?.code;
                if (code === '42P01' || code === '42703') {
                    return null;
                }
                if (attempt < maxAttempts - 1 && isRetryableDbError(err)) {
                    if (isQueryTimeoutError(err)) {
                        consecutiveQueryTimeouts += 1;
                        // query ค้างบน connection เดียว (serverless) — reset เฉพาะเมื่อ timeout ซ้ำ
                        if (consecutiveQueryTimeouts >= 2 && isServerlessRuntime()) {
                            await resetDbConnection();
                            consecutiveQueryTimeouts = 0;
                        }
                    } else if (isConnectionError(err)) {
                        await recoverOrResetConnection();
                    }
                    await new Promise((r) => setTimeout(r, 150 * (2 ** attempt)));
                    continue;
                }
                throw err;
            }
        }

        return null;
    } finally {
        releaseDbSlot();
    }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<T>((_, reject) => {
        timer = setTimeout(
            () => reject(new Error(`${label} timeout after ${timeoutMs}ms`)),
            timeoutMs,
        );
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
        if (timer) clearTimeout(timer);
    });
}

/** ทดสอบ connection จริง — ใช้ใน /api/deploy/health */
export async function pingDb(timeoutMs = 18000): Promise<{ ok: boolean; error?: string; pharmacists_verified?: number; url_mode?: string }> {
    if (!isDbConfigured()) {
        return { ok: false, error: 'DATABASE_URL missing' };
    }

    const urlMode = usesSupabasePooler() ? 'pooler:6543' : 'direct/other';

    try {
        const rows = await dbQuery(async (sql) => sql`
            SELECT COUNT(*)::int AS n FROM pharmacist_account WHERE status_verify = 1
        `, { timeoutMs });
        if (!rows) {
            return { ok: false, error: lastDbError || 'DB query returned no rows', url_mode: urlMode };
        }
        return { ok: true, pharmacists_verified: Number(rows[0]?.n ?? 0), url_mode: urlMode };
    } catch (err: unknown) {
        rememberDbError(err);
        return { ok: false, error: lastDbError || String(err), url_mode: urlMode };
    }
}

export function dbUnavailableMessage(): string {
    if (!isDbConfigured()) {
        return 'DATABASE_URL ยังไม่ได้ตั้งค่า — ใส่ DATABASE_POOLER_URL (port 6543) ใน Vercel แล้ว Redeploy';
    }

    const raw = resolveDatabaseUrlRaw();
    const isDirectOnServerless = isServerlessRuntime()
        && /\.supabase\.co:5432/i.test(raw)
        && !/pooler\.supabase\.com:6543/i.test(raw);

    if (isDirectOnServerless) {
        return 'DATABASE_URL ใช้ direct port 5432 — บน Vercel ต้องใช้ pooler port 6543 (Supabase → Database → Connection pooling → Transaction)';
    }

    if (lastDbError) {
        if (/timeout/i.test(lastDbError)) {
            return `เชื่อมต่อ Supabase ช้าเกินไป (${lastDbError}) — ตรวจ pooler 6543 และ redeploy`;
        }
        if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED/i.test(lastDbError)) {
            return `เชื่อมต่อ Supabase ไม่ได้ (${lastDbError}) — ตรวจ DATABASE_URL ว่าเป็น pooler port 6543`;
        }
        return `เชื่อมต่อ Supabase PostgreSQL ไม่สำเร็จ (${lastDbError})`;
    }

    return 'เชื่อมต่อ Supabase PostgreSQL ไม่สำเร็จ — ใช้ pooler port 6543 ใน DATABASE_URL';
}
