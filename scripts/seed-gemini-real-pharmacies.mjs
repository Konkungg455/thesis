/**
 * อัปเดตร้าน mock 17 ร้าน (ID 7–23) จากลิงก์ Google Maps จริงที่ Gemini คัดมา
 * ข้อมูล: scripts/data/gemini-real-pharmacies.json
 * ไม่แตะร้าน ID 58, 59, 60
 * ใช้: npm run db:seed-gemini-real-pharmacies
 */
import postgres from 'postgres';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TARGET_STORE_IDS = Array.from({ length: 17 }, (_, i) => i + 7);
const SKIP_STORE_IDS = [58, 59, 60]; // ร้าน mock เมืองทอง 3 ร้าน — ห้ามแก้

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');
const dataPath = resolve(dirname(fileURLToPath(import.meta.url)), 'data/gemini-real-pharmacies.json');

function loadEnv() {
    if (!existsSync(envPath)) return;
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^([^#=]+)=(.*)$/);
        if (!m) continue;
        const key = m[1].trim();
        if (!process.env[key]) {
            process.env[key] = m[2].trim().replace(/^["']|["']$/g, '');
        }
    }
}

loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
    console.error('ต้องมี DATABASE_URL ใน .env');
    process.exit(1);
}

const pharmacies = JSON.parse(readFileSync(dataPath, 'utf8'));
if (pharmacies.length !== TARGET_STORE_IDS.length) {
    console.error(`ต้องมีข้อมูล ${TARGET_STORE_IDS.length} ร้าน แต่พบ ${pharmacies.length} รายการ`);
    process.exit(1);
}

const sql = postgres(url, { ssl: 'require', prepare: false, connect_timeout: 20 });

try {
    const stores = await sql`
        SELECT a.id_store_accounts AS id, d.store_name
        FROM phamacy_store_accounts a
        LEFT JOIN phamacy_store_details d ON d.id_store_accounts = a.id_store_accounts
        WHERE COALESCE(a.is_deleted, 0) = 0
          AND a.id_store_accounts IN ${sql(TARGET_STORE_IDS)}
        ORDER BY a.id_store_accounts
    `;

    if (stores.length !== TARGET_STORE_IDS.length) {
        console.error(`พบร้าน ${stores.length}/${TARGET_STORE_IDS.length} ใน DB`);
        process.exit(1);
    }

    const updated = [];
    for (let i = 0; i < stores.length; i += 1) {
        const store = stores[i];
        const p = pharmacies[i];
        const road = String(p.road || '').slice(0, 10);

        await sql`
            UPDATE phamacy_store_details SET
                store_name = ${p.store_name},
                house_no = ${p.house_no},
                road = ${road},
                sub_district = ${p.sub_district},
                district = ${p.district},
                province = ${p.province},
                zipcode = ${p.zipcode},
                store_phone = ${p.store_phone || ''},
                google_maps_url = ${p.google_maps_url},
                latitude = ${p.latitude},
                longitude = ${p.longitude}
            WHERE id_store_accounts = ${store.id}
        `;

        await sql`
            UPDATE pharmacist_account
            SET store_name = ${p.store_name}
            WHERE id_store = ${store.id}
        `;

        updated.push({
            id: store.id,
            list_no: p.list_no,
            old_name: store.store_name,
            new_name: p.store_name,
            google_maps_url: p.google_maps_url,
            latitude: p.latitude,
            longitude: p.longitude,
        });
        console.log(`OK #${store.id} → ${p.store_name}`);
    }

    console.log(JSON.stringify({
        status: 'ok',
        target_store_ids: TARGET_STORE_IDS,
        skipped_ids: SKIP_STORE_IDS,
        updated_count: updated.length,
        source: 'Gemini curated Google Maps pharmacies',
        stores: updated,
    }, null, 2));
} catch (err) {
    console.error(JSON.stringify({ status: 'error', message: err.message }, null, 2));
    process.exit(1);
} finally {
    await sql.end({ timeout: 3 });
}
