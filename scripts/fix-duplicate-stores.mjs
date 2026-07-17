/**
 * แก้ข้อมูลร้านยา:
 * - ลบร้านซ้ำ "เภสัชกรเมืองทอง" (soft-delete #15, ย้ายเภสัชกรไป #14)
 * - ตั้งชื่อร้าน #61 และ #64 ที่ยังไม่มี store_name
 * ใช้: node scripts/fix-duplicate-stores.mjs
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

const KEEP_MUANGTHONG_ID = 14;
const REMOVE_MUANGTHONG_ID = 15;
const STORE_NAME = 'เภสัชกรเมืองทอง';

const STORE_RENAMES = [
    {
        id: 61,
        store_name: 'เทเลบอท ฟาร์มาซี',
        house_no: '-',
        road: 'แจ้งวัฒนะ',
        sub_district: 'บ้านใหม่',
        district: 'ปากเกร็ด',
        province: 'นนทบุรี',
        zipcode: '11120',
    },
    {
        id: 64,
        store_name: 'เทเลบอท ฟาร์มาซี สาขา 2',
        house_no: '-',
        road: 'แจ้งวัฒนะ',
        sub_district: 'บ้านใหม่',
        district: 'ปากเกร็ด',
        province: 'นนทบุรี',
        zipcode: '11120',
    },
];

const sql = postgres(url, { ssl: 'require', prepare: false, connect_timeout: 20 });

try {
    const dupes = await sql`
        SELECT a.id_store_accounts AS id, d.store_name
        FROM phamacy_store_accounts a
        JOIN phamacy_store_details d ON d.id_store_accounts = a.id_store_accounts
        WHERE TRIM(d.store_name) = ${STORE_NAME}
          AND COALESCE(a.is_deleted, 0) = 0
        ORDER BY a.id_store_accounts
    `;
    console.log('เภสัชกรเมืองทอง ก่อนแก้:', dupes);

    const moved = await sql`
        UPDATE pharmacist_account
        SET id_store = ${KEEP_MUANGTHONG_ID},
            store_name = ${STORE_NAME}
        WHERE id_store = ${REMOVE_MUANGTHONG_ID}
        RETURNING id_pharma, username_pharma
    `;
    console.log('ย้ายเภสัชกรจาก #15 → #14:', moved);

    const removed = await sql`
        UPDATE phamacy_store_accounts
        SET is_deleted = 1,
            deleted_at = NOW(),
            deleted_by = NULL,
            deleted_by_role = 'admin'
        WHERE id_store_accounts = ${REMOVE_MUANGTHONG_ID}
          AND COALESCE(is_deleted, 0) = 0
        RETURNING id_store_accounts
    `;
    console.log('soft-delete ร้านซ้ำ #15:', removed);

    for (const store of STORE_RENAMES) {
        const account = await sql`
            SELECT id_store_accounts, personal_phone, personal_email, COALESCE(is_deleted,0) AS is_deleted
            FROM phamacy_store_accounts
            WHERE id_store_accounts = ${store.id}
            LIMIT 1
        `;
        if (!account.length || Number(account[0].is_deleted) === 1) {
            console.warn(`ข้าม #${store.id} — ไม่พบหรือถูกลบแล้ว`);
            continue;
        }

        const existing = await sql`
            SELECT id_store_details FROM phamacy_store_details
            WHERE id_store_accounts = ${store.id}
            LIMIT 1
        `;

        const phone = String(account[0].personal_phone || '');
        const email = String(account[0].personal_email || '');

        if (existing.length) {
            await sql`
                UPDATE phamacy_store_details SET
                    store_name = ${store.store_name},
                    house_no = ${store.house_no},
                    road = ${store.road},
                    sub_district = ${store.sub_district},
                    district = ${store.district},
                    province = ${store.province},
                    zipcode = ${store.zipcode},
                    store_phone = COALESCE(NULLIF(store_phone, ''), ${phone}),
                    store_email = COALESCE(NULLIF(store_email, ''), ${email})
                WHERE id_store_accounts = ${store.id}
            `;
            console.log(`อัปเดตชื่อ #${store.id} → ${store.store_name}`);
        } else {
            await sql`
                INSERT INTO phamacy_store_details (
                    id_store_accounts, store_name, house_no, road, sub_district,
                    district, province, zipcode, store_phone, store_email
                ) VALUES (
                    ${store.id}, ${store.store_name}, ${store.house_no}, ${store.road},
                    ${store.sub_district}, ${store.district}, ${store.province},
                    ${store.zipcode}, ${phone}, ${email}
                )
            `;
            console.log(`สร้างรายละเอียด #${store.id} → ${store.store_name}`);
        }
    }

    const afterDupes = await sql`
        SELECT TRIM(d.store_name) AS store_name, COUNT(*)::int AS cnt,
               array_agg(a.id_store_accounts ORDER BY a.id_store_accounts) AS ids
        FROM phamacy_store_accounts a
        JOIN phamacy_store_details d ON d.id_store_accounts = a.id_store_accounts
        WHERE TRIM(COALESCE(d.store_name,'')) <> ''
          AND COALESCE(a.is_deleted,0) = 0
        GROUP BY TRIM(d.store_name)
        HAVING COUNT(*) > 1
        ORDER BY cnt DESC
    `;

    const renamed = await sql`
        SELECT a.id_store_accounts AS id, d.store_name
        FROM phamacy_store_accounts a
        LEFT JOIN phamacy_store_details d ON d.id_store_accounts = a.id_store_accounts
        WHERE a.id_store_accounts IN (14, 15, 61, 64)
        ORDER BY a.id_store_accounts
    `;

    console.log('\n=== สรุป ===');
    console.log(JSON.stringify({ duplicate_names_remaining: afterDupes, stores: renamed }, null, 2));
} catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
} finally {
    await sql.end({ timeout: 3 });
}
