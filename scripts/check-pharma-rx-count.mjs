import postgres from 'postgres';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');
if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^([^#=]+)=(.*)$/);
        if (m && !process.env[m[1].trim()]) {
            process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
        }
    }
}

const pharmaId = Number(process.argv[2] || 1);
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false });
try {
    const [counts] = await sql`
        SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE COALESCE(auto_created, 0) = 1)::int AS auto_created,
            COUNT(*) FILTER (WHERE COALESCE(auto_created, 0) != 1)::int AS history_visible
        FROM prescriptions
        WHERE id_pharma = ${pharmaId}
    `;
    console.log(JSON.stringify(counts, null, 2));
} finally {
    await sql.end({ timeout: 3 });
}
