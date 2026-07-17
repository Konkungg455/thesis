/**
 * แก้ที่อยู่ร้านที่ road ซ้ำกับตำบล/อำเภอ (เช่น บางใหญ่ บางใหญ่ บางใหญ่)
 * ใช้: npm run db:fix-store-addresses
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

/** ถนนจริงตามตำบล — ไม่เกิน 10 ตัวอักษร */
const ROAD_BY_SUBDISTRICT = {
    'บางใหญ่': 'ราชวิถี',
    'คลองเกลือ': 'แจ้งวัฒนะ',
    'บางพูด': 'ไทยน้อย',
    'ปากเกร็ด': 'นครอินทร์',
};

function normalize(value) {
    return String(value ?? '').trim();
}

const sql = postgres(url, { ssl: 'require', prepare: false, connect_timeout: 20 });

try {
    const rows = await sql`
        SELECT a.id_store_accounts AS id, d.store_name, d.house_no, d.road,
               d.sub_district, d.district, d.province, d.zipcode
        FROM phamacy_store_accounts a
        JOIN phamacy_store_details d ON d.id_store_accounts = a.id_store_accounts
        WHERE COALESCE(a.is_deleted, 0) = 0
        ORDER BY a.id_store_accounts
    `;

    const updated = [];
    for (const row of rows) {
        const sub = normalize(row.sub_district);
        const road = normalize(row.road);
        const district = normalize(row.district);
        const suggested = ROAD_BY_SUBDISTRICT[sub];
        const roadDupSub = road && sub && road === sub;
        const tripleDup = road === sub && sub === district;
        const needsFix = suggested && (roadDupSub || tripleDup || !road);

        if (!needsFix) continue;

        await sql`
            UPDATE phamacy_store_details
            SET road = ${suggested}
            WHERE id_store_accounts = ${row.id}
        `;
        updated.push({
            id: row.id,
            store_name: row.store_name,
            before: [row.house_no, road, sub, district, row.province, row.zipcode].filter(Boolean).join(' '),
            after: [row.house_no, suggested, sub, district, row.province, row.zipcode].filter(Boolean).join(' '),
        });
    }

    console.log(JSON.stringify({
        status: 'success',
        message: `แก้ที่อยู่ร้าน ${updated.length} รายการ`,
        updated,
    }, null, 2));
} catch (err) {
    console.error(JSON.stringify({ status: 'error', message: err.message }, null, 2));
    process.exit(1);
} finally {
    await sql.end({ timeout: 3 });
}
