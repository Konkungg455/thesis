import postgres from 'postgres';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(resolve(root, '.env'))) {
    for (const line of readFileSync(resolve(root, '.env'), 'utf8').split(/\r?\n/)) {
        const m = line.match(/^([^#=]+)=(.*)$/);
        if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
    }
}

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false });
const rows = await sql`
    SELECT p.id_pharma, p.firstname_pharma, p.lastname_pharma,
           p.id_store, p.store_name AS p_store, d.store_name AS d_store
    FROM pharmacist_account p
    LEFT JOIN phamacy_store_details d ON d.id_store_accounts = p.id_store
    WHERE p.firstname_pharma LIKE ${'%สมศักดิ์%'}
    LIMIT 5
`;
console.log(JSON.stringify(rows, null, 2));
const missing = await sql`
    SELECT COUNT(*)::int AS n FROM pharmacist_account p
    WHERE (p.id_store IS NULL OR p.id_store = 0 OR TRIM(COALESCE(p.store_name,'')) = '')
      AND NOT EXISTS (
        SELECT 1 FROM phamacy_store_details d
        WHERE d.id_store_accounts = p.id_store AND TRIM(COALESCE(d.store_name,'')) <> ''
      )
`;
console.log('missing_store_name:', missing[0]);
await sql.end();
