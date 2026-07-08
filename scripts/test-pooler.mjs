import postgres from 'postgres';

const url = process.argv[2];
if (!url) {
    console.error('Usage: node scripts/test-pooler.mjs "postgresql://..."');
    process.exit(1);
}

const sql = postgres(url, { ssl: 'require', prepare: false, max: 1, connect_timeout: 15 });
try {
    const r = await sql`SELECT 1 as ok`;
    console.log('OK', r);
} catch (e) {
    console.error('FAIL', e.message);
    process.exit(1);
} finally {
    await sql.end();
}
