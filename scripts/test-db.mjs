import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');
const env = Object.fromEntries(
    readFileSync(envPath, 'utf8')
        .split(/\r?\n/)
        .filter((l) => l && !l.startsWith('#') && l.includes('='))
        .map((l) => {
            const i = l.indexOf('=');
            return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
        }),
);

const url = env.DATABASE_URL;
if (!url) {
    console.error('DATABASE_URL missing in .env');
    process.exit(1);
}

const sql = postgres(url, { ssl: 'require', prepare: false, connect_timeout: 15 });
try {
    await sql`SELECT 1 AS ok`;
    const [{ n: total }] = await sql`SELECT COUNT(*)::int AS n FROM pharmacist_account`;
    const [{ n: verified }] = await sql`SELECT COUNT(*)::int AS n FROM pharmacist_account WHERE status_verify = 1`;
    console.log(JSON.stringify({ status: 'ok', pharmacists_total: total, pharmacists_verified: verified }, null, 2));
} catch (err) {
    console.error(JSON.stringify({ status: 'error', message: err.message, code: err.code }, null, 2));
    process.exit(1);
} finally {
    await sql.end({ timeout: 2 });
}
