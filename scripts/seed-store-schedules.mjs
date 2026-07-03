/**
 * เติมตารางเวลาเปิด-ปิด mockup ให้ร้านยาที่ยังไม่มี store_schedule
 * ใช้: npm run db:seed-store-schedules
 */
import postgres from 'postgres';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
    const envPath = resolve(root, '.env');
    if (!existsSync(envPath)) return;
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^([^#=]+)=(.*)$/);
        if (!m) continue;
        const key = m[1].trim();
        if (!process.env[key]) process.env[key] = m[2].trim().replace(/^["']|["']$/g, '');
    }
}

loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
    console.error('ต้องมี DATABASE_URL ใน .env');
    process.exit(1);
}

const DEFAULT_SCHEDULE = [
    { day: 'Mon', open: '08:00:00', close: '20:00:00', is_open: 1 },
    { day: 'Tue', open: '08:00:00', close: '20:00:00', is_open: 1 },
    { day: 'Wed', open: '08:00:00', close: '20:00:00', is_open: 1 },
    { day: 'Thu', open: '08:00:00', close: '20:00:00', is_open: 1 },
    { day: 'Fri', open: '08:00:00', close: '20:00:00', is_open: 1 },
    { day: 'Sat', open: '09:00:00', close: '18:00:00', is_open: 1 },
    { day: 'Sun', open: '09:00:00', close: '17:00:00', is_open: 1 },
];

const VARIANTS = [
    DEFAULT_SCHEDULE,
    [
        { day: 'Mon', open: '08:30:00', close: '19:30:00', is_open: 1 },
        { day: 'Tue', open: '08:30:00', close: '19:30:00', is_open: 1 },
        { day: 'Wed', open: '08:30:00', close: '19:30:00', is_open: 1 },
        { day: 'Thu', open: '08:30:00', close: '19:30:00', is_open: 1 },
        { day: 'Fri', open: '08:30:00', close: '19:30:00', is_open: 1 },
        { day: 'Sat', open: '09:00:00', close: '17:00:00', is_open: 1 },
        { day: 'Sun', open: '00:00:00', close: '00:00:00', is_open: 0 },
    ],
    [
        { day: 'Mon', open: '07:30:00', close: '21:00:00', is_open: 1 },
        { day: 'Tue', open: '07:30:00', close: '21:00:00', is_open: 1 },
        { day: 'Wed', open: '07:30:00', close: '21:00:00', is_open: 1 },
        { day: 'Thu', open: '07:30:00', close: '21:00:00', is_open: 1 },
        { day: 'Fri', open: '07:30:00', close: '21:00:00', is_open: 1 },
        { day: 'Sat', open: '08:00:00', close: '20:00:00', is_open: 1 },
        { day: 'Sun', open: '08:00:00', close: '18:00:00', is_open: 1 },
    ],
];

function scheduleForStore(storeId) {
    return VARIANTS[Number(storeId) % VARIANTS.length];
}

const sql = postgres(url, { ssl: 'require', prepare: false, connect_timeout: 20 });

try {
    const stores = await sql`
        SELECT a.id_store_accounts AS id, a.personal_email, d.store_name
        FROM phamacy_store_accounts a
        LEFT JOIN phamacy_store_details d ON d.id_store_accounts = a.id_store_accounts
        WHERE COALESCE(a.is_deleted, 0) = 0
        ORDER BY a.id_store_accounts
    `;

    let inserted = 0;
    let skipped = 0;

    for (const store of stores) {
        const storeId = Number(store.id);
        const [{ n: existing }] = await sql`
            SELECT COUNT(*)::int AS n FROM store_schedule WHERE id_store = ${storeId}
        `;
        if (existing > 0) {
            skipped += 1;
            continue;
        }

        const rows = scheduleForStore(storeId);
        for (const row of rows) {
            await sql`
                INSERT INTO store_schedule (id_store, day_of_week, open_time, close_time, is_open)
                VALUES (${storeId}, ${row.day}, ${row.open}, ${row.close}, ${row.is_open})
            `;
        }
        inserted += 1;
        console.log(`OK store #${storeId} ${store.store_name || store.personal_email} — ${rows.filter((r) => r.is_open).length} วันเปิด`);
    }

    const [{ n: totalRows }] = await sql`SELECT COUNT(*)::int AS n FROM store_schedule`;
    console.log(JSON.stringify({
        status: 'ok',
        stores_seeded: inserted,
        stores_skipped: skipped,
        schedule_rows_total: totalRows,
    }, null, 2));
} catch (err) {
    console.error(JSON.stringify({ status: 'error', message: err.message }, null, 2));
    process.exit(1);
} finally {
    await sql.end({ timeout: 3 });
}
