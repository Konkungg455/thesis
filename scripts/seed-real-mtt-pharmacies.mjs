/**
 * อัปเดตร้านยา mock ที่เหลือ → ร้านยาจริงแถวเมืองทองธานี/ปากเกร็ด/เลยเมืองทอง
 * ข้อมูลจาก สปสช. + เอ็กซ์ต้า พลัส (พิกัด Google Maps จริง)
 * ไม่แตะร้าน ID 58, 59, 60
 * ใช้: npm run db:seed-real-mtt-pharmacies
 */
import postgres from 'postgres';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKIP_STORE_IDS = [58, 59, 60];

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');
const dataPath = resolve(dirname(fileURLToPath(import.meta.url)), 'data/real-mtt-pharmacies.json');

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
if (!pharmacies.length) {
    console.error('ไม่มีข้อมูลร้านยาใน', dataPath);
    process.exit(1);
}

const names = pharmacies.map((p) => p.store_name);
const dupNames = names.filter((n, i) => names.indexOf(n) !== i);
if (dupNames.length) {
    console.error('พบชื่อร้านซ้ำในไฟล์ข้อมูล:', [...new Set(dupNames)].join(', '));
    process.exit(1);
}

const sql = postgres(url, { ssl: 'require', prepare: false, connect_timeout: 20 });

try {
    const stores = await sql`
        SELECT a.id_store_accounts AS id, d.store_name
        FROM phamacy_store_accounts a
        LEFT JOIN phamacy_store_details d ON d.id_store_accounts = a.id_store_accounts
        WHERE COALESCE(a.is_deleted, 0) = 0
          AND a.id_store_accounts NOT IN ${sql(SKIP_STORE_IDS)}
        ORDER BY a.id_store_accounts
    `;

    if (pharmacies.length < stores.length) {
        console.error(
            `ร้านยาในไฟล์ (${pharmacies.length}) น้อยกว่าจำนวนร้านที่ต้องอัปเดต (${stores.length}) — ต้องไม่ซ้ำชื่อ`
        );
        process.exit(1);
    }

    const updated = [];
    for (let i = 0; i < stores.length; i += 1) {
        const store = stores[i];
        const p = pharmacies[i];

        await sql`
            UPDATE phamacy_store_details SET
                store_name = ${p.store_name},
                house_no = ${p.house_no},
                road = ${p.road},
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
            old_name: store.store_name,
            new_name: p.store_name,
            area: `${p.sub_district}, ${p.district}`,
            latitude: p.latitude,
            longitude: p.longitude,
        });
        console.log(`OK #${store.id} → ${p.store_name}`);
    }

    console.log(JSON.stringify({
        status: 'ok',
        skipped_ids: SKIP_STORE_IDS,
        pharmacy_pool: pharmacies.length,
        updated_count: updated.length,
        source: 'NHSO + Exta Plus verified pharmacies (Google Maps coords)',
        stores: updated,
    }, null, 2));
} catch (err) {
    console.error(JSON.stringify({ status: 'error', message: err.message }, null, 2));
    process.exit(1);
} finally {
    await sql.end({ timeout: 3 });
}
