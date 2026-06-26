import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const envText = readFileSync('.env', 'utf8');
const match = envText.match(/^DATABASE_URL=(.+)$/m);
const url = match?.[1]?.trim();

if (!url) {
    console.error('DATABASE_URL not found in .env');
    process.exit(1);
}

const sql = postgres(url, { ssl: 'require', prepare: false });

try {
    const rows = await sql`select current_database() as db, count(*)::int as chat_rows from chat_history`;
    console.log(JSON.stringify({ status: 'success', ...rows[0] }));
} catch (err) {
    console.error(JSON.stringify({ status: 'error', message: err.message }));
    process.exit(1);
} finally {
    await sql.end();
}
