import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
}

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false, max: 1 });
const pharma = await sql`SELECT DISTINCT images_pharma FROM pharmacist_account WHERE images_pharma IS NOT NULL AND images_pharma <> '' LIMIT 20`;
const account = await sql`SELECT DISTINCT images_account FROM account WHERE images_account IS NOT NULL AND images_account <> '' LIMIT 20`;
console.log('pharma:', pharma.map((r) => r.images_pharma));
console.log('account:', account.map((r) => r.images_account));
await sql.end();
