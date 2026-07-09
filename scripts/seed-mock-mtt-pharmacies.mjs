/**
 * เติม mock ร้านขายยา 3 ร้าน (เมืองทองธานี) จากลิงก์ Google Maps จริง
 * ใช้: npm run db:seed-mock-mtt-pharmacies
 */
import postgres from 'postgres';
import { randomBytes } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import argon2 from 'argon2';

const DEMO_PASSWORD = 'Demo@1234';
const DEFAULT_PROFILE_IMAGE = 'default.png';
const DEFAULT_STORE_LICENSE = 'default-store-license.png';

const DEFAULT_SCHEDULE = [
    { day: 'Mon', open: '08:00:00', close: '20:00:00', is_open: 1 },
    { day: 'Tue', open: '08:00:00', close: '20:00:00', is_open: 1 },
    { day: 'Wed', open: '08:00:00', close: '20:00:00', is_open: 1 },
    { day: 'Thu', open: '08:00:00', close: '20:00:00', is_open: 1 },
    { day: 'Fri', open: '08:00:00', close: '20:00:00', is_open: 1 },
    { day: 'Sat', open: '09:00:00', close: '18:00:00', is_open: 1 },
    { day: 'Sun', open: '09:00:00', close: '17:00:00', is_open: 1 },
];

/** ร้านจริงจาก Google Maps — พิกัดดึงจาก maps.app.goo.gl */
const MOCK_STORES = [
    {
        username: 'mock_owner_popular',
        firstname: 'ปิยะ',
        lastname: 'ป๊อปปูล่า',
        phone: '0819001001',
        email: 'mock.popular.mtt@telebot-pharmacy.test',
        details: {
            store_name: 'ร้านยาป๊อปปูล่าฟาร์ม่า',
            house_no: '99/12',
            road: 'แจ้งวัฒนะ',
            sub_district: 'บ้านใหม่',
            district: 'ปากเกร็ด',
            province: 'นนทบุรี',
            zipcode: '11120',
            store_phone: '029620001',
            store_email: 'popular.mtt@telebot-pharmacy.test',
            google_maps_url: 'https://maps.app.goo.gl/SorjaDoHiY4aKv266',
            latitude: 13.9108594,
            longitude: 100.5528642,
        },
    },
    {
        username: 'mock_owner_bestchoice',
        firstname: 'สุชาดา',
        lastname: 'เบสท์ช้อยส์',
        phone: '0819001002',
        email: 'mock.bestchoice.mtt@telebot-pharmacy.test',
        details: {
            store_name: 'ร้านขายยา เบสท์ช้อยส์ ฟาร์มาซี เมืองทองธานี',
            house_no: '88/5',
            road: 'แจ้งวัฒนะ',
            sub_district: 'บ้านใหม่',
            district: 'ปากเกร็ด',
            province: 'นนทบุรี',
            zipcode: '11120',
            store_phone: '029620002',
            store_email: 'bestchoice.mtt@telebot-pharmacy.test',
            google_maps_url: 'https://maps.app.goo.gl/qjzQRJ7ni3fs5Zb5A',
            latitude: 13.9106353,
            longitude: 100.552453,
        },
    },
    {
        username: 'mock_owner_zenwa',
        firstname: 'วรรณา',
        lastname: 'เซนวา',
        phone: '0819001003',
        email: 'mock.zenwa.mtt@telebot-pharmacy.test',
        details: {
            store_name: 'ร้านขายยา Zenwa Pharmacy',
            house_no: '120/3',
            road: 'แจ้งวัฒนะ',
            sub_district: 'บ้านใหม่',
            district: 'ปากเกร็ด',
            province: 'นนทบุรี',
            zipcode: '11120',
            store_phone: '029620003',
            store_email: 'zenwa.mtt@telebot-pharmacy.test',
            google_maps_url: 'https://maps.app.goo.gl/gFHFnfbMziELPpyC6',
            latitude: 13.9127466,
            longitude: 100.5526082,
        },
    },
];

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');

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

async function hashPassword(password, salt) {
    return argon2.hash(password + salt, { type: argon2.argon2id });
}

async function upsertStore(sql, store) {
    const d = store.details;
    const existing = await sql`
        SELECT id_store_accounts FROM phamacy_store_accounts
        WHERE personal_email = ${store.email}
        LIMIT 1
    `;

    let storeId;
    if (existing.length) {
        storeId = existing[0].id_store_accounts;
        await sql`
            UPDATE phamacy_store_accounts SET
                username = ${store.username},
                firstname = ${store.firstname},
                lastname = ${store.lastname},
                personal_phone = ${store.phone},
                profile_store_account = ${DEFAULT_PROFILE_IMAGE},
                license_file = ${DEFAULT_STORE_LICENSE},
                status = 1,
                admin_status = 'approved',
                admin_reviewed_at = NOW(),
                is_deleted = 0
            WHERE id_store_accounts = ${storeId}
        `;
    } else {
        const salt = randomBytes(16).toString('hex');
        const hash = await hashPassword(DEMO_PASSWORD, salt);
        const [row] = await sql`
            INSERT INTO phamacy_store_accounts (
                username, password, salt_store, firstname, lastname,
                personal_phone, personal_email, license_file, profile_store_account,
                status, admin_status, admin_reviewed_at
            ) VALUES (
                ${store.username}, ${hash}, ${salt}, ${store.firstname}, ${store.lastname},
                ${store.phone}, ${store.email}, ${DEFAULT_STORE_LICENSE}, ${DEFAULT_PROFILE_IMAGE},
                1, 'approved', NOW()
            )
            RETURNING id_store_accounts
        `;
        storeId = row.id_store_accounts;
    }

    const hasDetails = await sql`
        SELECT id_store_details FROM phamacy_store_details
        WHERE id_store_accounts = ${storeId}
        LIMIT 1
    `;

    if (hasDetails.length) {
        await sql`
            UPDATE phamacy_store_details SET
                store_name = ${d.store_name},
                house_no = ${d.house_no},
                road = ${d.road},
                sub_district = ${d.sub_district},
                district = ${d.district},
                province = ${d.province},
                zipcode = ${d.zipcode},
                store_phone = ${d.store_phone},
                store_email = ${d.store_email},
                google_maps_url = ${d.google_maps_url},
                latitude = ${d.latitude},
                longitude = ${d.longitude}
            WHERE id_store_accounts = ${storeId}
        `;
    } else {
        await sql`
            INSERT INTO phamacy_store_details (
                id_store_accounts, store_name, house_no, road, sub_district, district,
                province, zipcode, store_phone, store_email, google_maps_url,
                latitude, longitude
            ) VALUES (
                ${storeId}, ${d.store_name}, ${d.house_no}, ${d.road}, ${d.sub_district}, ${d.district},
                ${d.province}, ${d.zipcode}, ${d.store_phone}, ${d.store_email}, ${d.google_maps_url},
                ${d.latitude}, ${d.longitude}
            )
        `;
    }

    for (const row of DEFAULT_SCHEDULE) {
        const existingSchedule = await sql`
            SELECT id FROM store_schedule
            WHERE id_store = ${storeId} AND day_of_week = ${row.day}
            LIMIT 1
        `;
        if (existingSchedule.length) {
            await sql`
                UPDATE store_schedule SET
                    open_time = ${row.open},
                    close_time = ${row.close},
                    is_open = ${row.is_open}
                WHERE id_store = ${storeId} AND day_of_week = ${row.day}
            `;
        } else {
            await sql`
                INSERT INTO store_schedule (id_store, day_of_week, open_time, close_time, is_open)
                VALUES (${storeId}, ${row.day}, ${row.open}, ${row.close}, ${row.is_open})
            `;
        }
    }

    return {
        id: storeId,
        store_name: d.store_name,
        email: store.email,
        latitude: d.latitude,
        longitude: d.longitude,
        google_maps_url: d.google_maps_url,
    };
}

const sql = postgres(url, { ssl: 'require', prepare: false, connect_timeout: 20 });

try {
    const results = [];
    for (const store of MOCK_STORES) {
        const row = await upsertStore(sql, store);
        results.push(row);
        console.log(`OK #${row.id} ${row.store_name}`);
    }

    console.log(JSON.stringify({
        status: 'ok',
        password: DEMO_PASSWORD,
        stores: results,
    }, null, 2));
} catch (err) {
    console.error(JSON.stringify({ status: 'error', message: err.message }, null, 2));
    process.exit(1);
} finally {
    await sql.end({ timeout: 3 });
}
