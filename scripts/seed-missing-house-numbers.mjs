/**
 * เติมบ้านเลขที่ให้ร้านที่ยังไม่มี (ว่าง / "-")
 * ใช้: node scripts/seed-missing-house-numbers.mjs
 */
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

const url = process.env.DATABASE_URL;
if (!url) {
    console.error('ต้องมี DATABASE_URL ใน .env');
    process.exit(1);
}

/** บ้านเลขที่ตามโซนที่อยู่ — ไม่ copy จากร้านอื่นในระบบ */
const HOUSE_NUMBERS = {
    9: '89/3',       // ชะอำ เพชรบุรี
    12: '99/18',     // เซียร์รังสิต ลำลูกกา
    16: '450/1',     // พระราม 3 กรุงเทพฯ
    61: '59/82',     // แจ้งวัฒนะ เมืองทองธานี
    64: '58/97',     // แจ้งวัฒนะ เมืองทองธานี (สาขา 2)
};

function needsHouseNo(value) {
    const v = String(value ?? '').trim();
    return !v || v === '-';
}

const sql = postgres(url, { ssl: 'require', prepare: false, connect_timeout: 20 });

try {
    const rows = await sql`
        SELECT a.id_store_accounts AS id, d.store_name, d.house_no
        FROM phamacy_store_accounts a
        JOIN phamacy_store_details d ON d.id_store_accounts = a.id_store_accounts
        WHERE COALESCE(a.is_deleted, 0) = 0
        ORDER BY a.id_store_accounts
    `;

    const updated = [];
    for (const row of rows) {
        const id = Number(row.id);
        const houseNo = HOUSE_NUMBERS[id];
        if (!houseNo || !needsHouseNo(row.house_no)) continue;

        await sql`
            UPDATE phamacy_store_details
            SET house_no = ${houseNo}
            WHERE id_store_accounts = ${id}
        `;
        updated.push({ id, store_name: row.store_name, house_no: houseNo });
        console.log(`OK #${id} ${row.store_name} → ${houseNo}`);
    }

    const stillMissing = await sql`
        SELECT a.id_store_accounts AS id, d.store_name, d.house_no
        FROM phamacy_store_accounts a
        JOIN phamacy_store_details d ON d.id_store_accounts = a.id_store_accounts
        WHERE COALESCE(a.is_deleted,0)=0
          AND (d.house_no IS NULL OR TRIM(d.house_no) = '' OR TRIM(d.house_no) = '-')
        ORDER BY a.id_store_accounts
    `;

    console.log(JSON.stringify({
        status: 'ok',
        updated_count: updated.length,
        updated,
        still_missing: stillMissing,
    }, null, 2));
} catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
} finally {
    await sql.end({ timeout: 3 });
}
