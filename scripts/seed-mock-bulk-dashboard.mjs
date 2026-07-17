/**
 * เติม mock ข้อมูล dashboard ชุดใหญ่ (idempotent ด้วยอีเมล mock.bulk.*)
 * - เภสัชกร 100 คน
 * - ผู้ใช้บริการ 100 คน
 * - ร้านยาพาร์ทเนอร์ 15 ร้าน (Google Maps URL / พิกัดไม่ซ้ำกับร้านเดิม)
 * - ติดตามใบสรุปรายการยา PDF 70 ใบ (กระจายวัน/เวลา + อาการจาก 32 อาการ)
 * - การให้บริการวันนี้ 50 รายการ (เภสัช+ผู้ใช้คนละคน)
 *
 * ใช้: npm run db:seed-mock-bulk
 */
import postgres from 'postgres';
import { randomBytes } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import argon2 from 'argon2';
import { pickSymptom32 } from './lib/symptoms32.mjs';
import { ensureMockPrescriptionSymptom } from './lib/mockPrescriptionSymptoms.mjs';

const PHARMA_COUNT = 100;
const USER_COUNT = 100;
const STORE_COUNT = 15;
const TRACKING_COUNT = 70;
const SERVICE_TODAY_COUNT = 50;

const DEMO_PASSWORD = 'Demo@1234';
const DEMO_SALT = 'mock-bulk';
const DEMO_PASSWORD_HASH = 'not-for-login';
const PHARMA_DEMO_SALT = 'mock-bulk-ph';
const DEFAULT_PROFILE_IMAGE = 'default.png';
const DEFAULT_STORE_LICENSE = 'default-store-license.png';
const MARKER = 'mock.bulk.';

const DEFAULT_SCHEDULE = [
    { day: 'Mon', open: '08:00:00', close: '20:00:00', is_open: 1 },
    { day: 'Tue', open: '08:00:00', close: '20:00:00', is_open: 1 },
    { day: 'Wed', open: '08:00:00', close: '20:00:00', is_open: 1 },
    { day: 'Thu', open: '08:00:00', close: '20:00:00', is_open: 1 },
    { day: 'Fri', open: '08:00:00', close: '20:00:00', is_open: 1 },
    { day: 'Sat', open: '09:00:00', close: '18:00:00', is_open: 1 },
    { day: 'Sun', open: '09:00:00', close: '17:00:00', is_open: 1 },
];

const FIRST_NAMES = [
    'สมชาย', 'วิภา', 'อนุชา', 'พิมพ์ใจ', 'กมล', 'ธนกฤต', 'ศิริพร', 'ประเสริฐ', 'นลิน', 'วีรภัทร',
    'รัตนา', 'ชาญชัย', 'มณีรัตน์', 'พงศกร', 'อรทัย', 'สุภาพร', 'เกียรติศักดิ์', 'ปวีณา', 'วรเมธ', 'จิราพร',
    'อดิศักดิ์', 'กนกวรรณ', 'ภูมิพัฒน์', 'สุดารัตน์', 'ธีรพงษ์', 'นภัสสร', 'ชลธิชา', 'พิชัย', 'อารีย์', 'วสันต์',
];
const LAST_NAMES = [
    'ใจดี', 'รักสุขภาพ', 'มีสุข', 'สบายดี', 'แสงทอง', 'วงศ์ไทย', 'ขำใจ', 'สุขใจ', 'พาใจ', 'มั่นใจ',
    'สุขสันต์', 'วิริยะ', 'งามดี', 'ชูชาติ', 'แจ่มใส', 'มั่นคง', 'รุ่งเรือง', 'ศรีสุข', 'บุญมี', 'สดใส',
    'ทองคำ', 'แสงจันทร์', 'ชัยชนะ', 'ใจงาม', 'พงษ์เพชร', 'วัฒนา', 'สกุลไทย', 'เจริญสุข', 'มหาชัย', 'อินทร์แก้ว',
];

const MEDICINES = [
    'พาราเซตามอล 500 มก.', 'ยาแก้ไอ ดีมิลด์', 'ยาแก้แพ้ ซีเทอรีซีน', 'ยาลดไข้ ไอบูโพรเฟน',
    'ยาลดกรด ออมเพราโซล', 'ยาแก้ท้องเสีย สมุนไพร', 'วิตามินซี ชนิดเม็ด', 'ยาหยอดตา คูล',
    'ยาทาแผล โพลิวินีล', 'ยาแก้ปวดเม็ด สเปรย์',
];

/** 15 ร้าน mock — ชื่อสไตล์ร้านขายยาจริงๆ (พิกัดไม่ซ้ำร้านเดิม) */
const PARTNER_STORES = [
    { store_name: 'ร้านขายยาหมีน้อย', house_no: '17/3', road: 'บอนด์สตรีท', sub_district: 'บ้านใหม่', district: 'ปากเกร็ด', province: 'นนทบุรี', zipcode: '11120', latitude: 13.9162847, longitude: 100.5473912 },
    { store_name: 'ร้านยาพี่โอ๊ต ฟาร์ม', house_no: '42/8', road: 'บอนด์สตรีท', sub_district: 'บ้านใหม่', district: 'ปากเกร็ด', province: 'นนทบุรี', zipcode: '11120', latitude: 13.9175631, longitude: 100.5487264 },
    { store_name: 'ร้านขายยาเช้าดี', house_no: '156/2', road: 'แจ้งวัฒนะ', sub_district: 'บ้านใหม่', district: 'ปากเกร็ด', province: 'นนทบุรี', zipcode: '11120', latitude: 13.9198743, longitude: 100.5542186 },
    { store_name: 'ร้านยาคุณหมอใจดี', house_no: '203/5', road: 'แจ้งวัฒนะ', sub_district: 'บ้านใหม่', district: 'ปากเกร็ด', province: 'นนทบุรี', zipcode: '11120', latitude: 13.9210458, longitude: 100.5559637 },
    { store_name: 'ร้านขายยาเมืองทอง', house_no: '88/11', road: 'เมืองทอง', sub_district: 'บ้านใหม่', district: 'ปากเกร็ด', province: 'นนทบุรี', zipcode: '11120', latitude: 13.9235176, longitude: 100.5493821 },
    { store_name: 'ร้านยาแสนสุข เภสัช', house_no: '120/6', road: 'เมืองทอง', sub_district: 'บ้านใหม่', district: 'ปากเกร็ด', province: 'นนทบุรี', zipcode: '11120', latitude: 13.9246892, longitude: 100.5510473 },
    { store_name: 'ร้านขายยาปากเกร็ด', house_no: '55/4', road: 'นครอินทร์', sub_district: 'ปากเกร็ด', district: 'ปากเกร็ด', province: 'นนทบุรี', zipcode: '11120', latitude: 13.9123784, longitude: 100.4982635 },
    { store_name: 'ร้านยาดอกไม้ฟ้า', house_no: '77/9', road: 'นครอินทร์', sub_district: 'ปากเกร็ด', district: 'ปากเกร็ด', province: 'นนทบุรี', zipcode: '11120', latitude: 13.9138426, longitude: 100.4998714 },
    { store_name: 'ร้านขายยาป๋าแป๋ง', house_no: '301/7', road: 'แจ้งวัฒนะ', sub_district: 'บางตลาด', district: 'ปากเกร็ด', province: 'นนทบุรี', zipcode: '11120', latitude: 13.9072158, longitude: 100.5587429 },
    { store_name: 'ร้านยาชิลล์ ฟาร์มาซี', house_no: '415/2', road: 'แจ้งวัฒนะ', sub_district: 'บางตลาด', district: 'ปากเกร็ด', province: 'นนทบุรี', zipcode: '11120', latitude: 13.9056831, longitude: 100.5603187 },
    { store_name: 'ร้านขายยาเฮลตี้ แคร์', house_no: '12/1', road: 'ไทยน้อย', sub_district: 'บางพูด', district: 'ปากเกร็ด', province: 'นนทบุรี', zipcode: '11120', latitude: 13.9261843, longitude: 100.4927368 },
    { store_name: 'ร้านยาเจ้าของยิ้มแย้ม', house_no: '34/6', road: 'ไทยน้อย', sub_district: 'บางพูด', district: 'ปากเกร็ด', province: 'นนทบุรี', zipcode: '11120', latitude: 13.9279567, longitude: 100.4945182 },
    { store_name: 'ร้านขายยาใกล้บ้าน', house_no: '9/3', road: 'แจ้งวัฒนะ', sub_district: 'คลองเกลือ', district: 'ปากเกร็ด', province: 'นนทบุรี', zipcode: '11120', latitude: 13.9084726, longitude: 100.5632841 },
    { store_name: 'ร้านยาบ้านสุขใจ', house_no: '21/8', road: 'แจ้งวัฒนะ', sub_district: 'คลองเกลือ', district: 'ปากเกร็ด', province: 'นนทบุรี', zipcode: '11120', latitude: 13.9098364, longitude: 100.5650173 },
    { store_name: 'ร้านขายยาแฮปปี้', house_no: '66/2', road: 'ราชวิถี', sub_district: 'บางใหญ่', district: 'บางใหญ่', province: 'นนทบุรี', zipcode: '11140', latitude: 13.8782641, longitude: 100.4415826 },
];

/** ที่อยู่จัดส่ง mock ผู้ใช้ — หลากหลาย ไม่ซ้ำถนน=ตำบล */
const MOCK_USER_ADDRESSES = [
    { house_no: '99/1', road: 'ซอยรามคำแหง 24', sub_district: 'หัวหมาก', district: 'บางกะปิ', province: 'กรุงเทพมหานคร', zipcode: '10240' },
    { house_no: '12', road: 'ถนนสุขุมวิท', sub_district: 'คลองตัน', district: 'คลองเตย', province: 'กรุงเทพมหานคร', zipcode: '10110' },
    { house_no: '45', road: 'ถนนพระราม 9', sub_district: 'ห้วยขวาง', district: 'ห้วยขวาง', province: 'กรุงเทพมหานคร', zipcode: '10310' },
    { house_no: '78', road: 'ถนนจรัญสนิทวงศ์', sub_district: 'บางขุนศรี', district: 'บางกอกน้อย', province: 'กรุงเทพมหานคร', zipcode: '10700' },
    { house_no: '33/2', road: 'ซอยลาดพร้าว 80', sub_district: 'ลาดพร้าว', district: 'ลาดพร้าว', province: 'กรุงเทพมหานคร', zipcode: '10230' },
    { house_no: '128/4', road: 'ถ.ลาดพร้าว 101', sub_district: 'ลาดพร้าว', district: 'ลาดพร้าว', province: 'กรุงเทพมหานคร', zipcode: '10230' },
    { house_no: '88', road: 'ถ.บางนา-ตราด', sub_district: 'บางนาเหนือ', district: 'บางนา', province: 'กรุงเทพมหานคร', zipcode: '10260' },
    { house_no: '55/3', road: 'ถ.งามวงศ์วาน', sub_district: 'ทุ่งสองห้อง', district: 'หลักสี่', province: 'กรุงเทพมหานคร', zipcode: '10210' },
    { house_no: '17/3', road: 'บอนด์สตรีท', sub_district: 'บ้านใหม่', district: 'ปากเกร็ด', province: 'นนทบุรี', zipcode: '11120' },
    { house_no: '66/2', road: 'ราชวิถี', sub_district: 'บางใหญ่', district: 'บางใหญ่', province: 'นนทบุรี', zipcode: '11140' },
    { house_no: '21/8', road: 'แจ้งวัฒนะ', sub_district: 'คลองเกลือ', district: 'ปากเกร็ด', province: 'นนทบุรี', zipcode: '11120' },
    { house_no: '34/6', road: 'ไทยน้อย', sub_district: 'บางพูด', district: 'ปากเกร็ด', province: 'นนทบุรี', zipcode: '11120' },
    { house_no: '156/2', road: 'แจ้งวัฒนะ', sub_district: 'บ้านใหม่', district: 'ปากเกร็ด', province: 'นนทบุรี', zipcode: '11120' },
    { house_no: '7/11', road: 'ถ.พัฒนาการ', sub_district: 'สวนหลวง', district: 'สวนหลวง', province: 'กรุงเทพมหานคร', zipcode: '10250' },
    { house_no: '24', road: 'ถ.นวมินทร์', sub_district: 'นวมินทร์', district: 'บึงกุ่ม', province: 'กรุงเทพมหานคร', zipcode: '10230' },
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

function buildWorkTime(days, start, end) {
    return days.map((day) => `${day} (${start}-${end})`).join(', ');
}

const FULLTIME_OPEN = '09:00';
const FULLTIME_CLOSE = '18:00';
const FULLTIME_COUNT = 5;

function buildMockPharmaWorkTime(index) {
    if (index < FULLTIME_COUNT) {
        return `Everyday (${FULLTIME_OPEN}-${FULLTIME_CLOSE})`;
    }
    const patterns = [
        { days: ['Monday'], start: '09:00', end: '18:00' },
        { days: ['Wednesday'], start: '08:30', end: '17:00' },
        { days: ['Friday'], start: '10:00', end: '16:00' },
        { days: ['Saturday'], start: '09:00', end: '15:00' },
        { days: ['Tuesday', 'Thursday'], start: '09:00', end: '18:00' },
        { days: ['Monday', 'Wednesday'], start: '08:00', end: '17:00' },
        { days: ['Wednesday', 'Friday'], start: '09:00', end: '18:00' },
        { days: ['Tuesday', 'Saturday'], start: '08:30', end: '17:30' },
        { days: ['Monday', 'Wednesday', 'Friday'], start: '09:00', end: '18:00' },
        { days: ['Tuesday', 'Thursday', 'Saturday'], start: '08:30', end: '17:30' },
        { days: ['Monday', 'Tuesday'], start: '09:00', end: '18:00' },
        { days: ['Thursday', 'Friday', 'Sunday'], start: '09:00', end: '17:00' },
    ];
    const pattern = patterns[(index - FULLTIME_COUNT) % patterns.length];
    return buildWorkTime(pattern.days, pattern.start, pattern.end);
}

function pad3(n) {
    return String(n).padStart(3, '0');
}

function pickName(i) {
    return {
        first: FIRST_NAMES[i % FIRST_NAMES.length],
        last: LAST_NAMES[(i + Math.floor(i / FIRST_NAMES.length)) % LAST_NAMES.length],
    };
}

function googleMapsUrl(lat, lng) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function formatThaiDate(d) {
    const pad = (n) => String(n).padStart(2, '0');
    const buddhistYear = d.getFullYear() + 543;
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${buddhistYear} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildSpreadDates(count) {
    const now = new Date();
    const slots = [];
    for (let day = 0; day < 14; day++) {
        for (let slot = 0; slot < 4; slot++) {
            const d = new Date(now);
            d.setDate(now.getDate() - day);
            d.setHours(7 + slot * 3 + (day % 3), (slot * 19 + day * 13) % 60, 0, 0);
            slots.push(d);
        }
    }
    for (let day = 15; day <= 60; day++) {
        const d = new Date(now);
        d.setDate(now.getDate() - day);
        d.setHours(9 + (day % 8), (day * 17) % 60, 0, 0);
        slots.push(d);
    }
    slots.sort((a, b) => b.getTime() - a.getTime());
    return slots.slice(0, count);
}

function serviceSlot(hour, minute) {
    return { hour, minute };
}

function bkkServiceDateSql(hour, minute) {
    return sql`(
        date_trunc('day', NOW() AT TIME ZONE 'Asia/Bangkok')
        + ${hour} * INTERVAL '1 hour'
        + ${minute} * INTERVAL '1 minute'
    )`;
}

async function hashPassword(password, salt) {
    return argon2.hash(password + salt, { type: argon2.argon2id });
}

function coordKey(lat, lng) {
    return `${Number(lat).toFixed(7)},${Number(lng).toFixed(7)}`;
}

async function loadExistingCoords(sql) {
    const rows = await sql`
        SELECT d.latitude, d.longitude, d.google_maps_url
        FROM phamacy_store_details d
        JOIN phamacy_store_accounts a ON a.id_store_accounts = d.id_store_accounts
        WHERE d.latitude IS NOT NULL
          AND d.longitude IS NOT NULL
          AND COALESCE(a.personal_email, '') NOT LIKE ${MARKER + 'store.%'}
    `;
    const keys = new Set();
    const urls = new Set();
    for (const r of rows) {
        keys.add(coordKey(r.latitude, r.longitude));
        if (r.google_maps_url) urls.add(String(r.google_maps_url).trim());
    }
    return { keys, urls };
}

async function upsertPartnerStore(sql, index, storeDef) {
    const n = pad3(index + 1);
    const email = `${MARKER}store.${n}@telebot-pharmacy.test`;
    const username = `${MARKER.replace('.', '_')}store_${n}`;
    const owner = pickName(index + 50);
    const mapsUrl = googleMapsUrl(storeDef.latitude, storeDef.longitude);

    const existing = await sql`
        SELECT id_store_accounts FROM phamacy_store_accounts
        WHERE personal_email = ${email}
        LIMIT 1
    `;

    let storeId;
    if (existing.length) {
        storeId = existing[0].id_store_accounts;
        await sql`
            UPDATE phamacy_store_accounts SET
                username = ${username},
                firstname = ${owner.first},
                lastname = ${owner.last},
                personal_phone = ${`0829${String(100000 + index).slice(-6)}`},
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
                ${username}, ${hash}, ${salt}, ${owner.first}, ${owner.last},
                ${`0829${String(100000 + index).slice(-6)}`}, ${email}, ${DEFAULT_STORE_LICENSE}, ${DEFAULT_PROFILE_IMAGE},
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

    const detailPayload = {
        store_name: storeDef.store_name,
        house_no: storeDef.house_no,
        road: storeDef.road,
        sub_district: storeDef.sub_district,
        district: storeDef.district,
        province: storeDef.province,
        zipcode: storeDef.zipcode,
        store_phone: `0296${String(30000 + index).slice(-5)}`,
        store_email: `${MARKER}shop.${n}@telebot-pharmacy.test`,
        google_maps_url: mapsUrl,
        latitude: storeDef.latitude,
        longitude: storeDef.longitude,
    };

    if (hasDetails.length) {
        await sql`
            UPDATE phamacy_store_details SET
                store_name = ${detailPayload.store_name},
                house_no = ${detailPayload.house_no},
                road = ${detailPayload.road},
                sub_district = ${detailPayload.sub_district},
                district = ${detailPayload.district},
                province = ${detailPayload.province},
                zipcode = ${detailPayload.zipcode},
                store_phone = ${detailPayload.store_phone},
                store_email = ${detailPayload.store_email},
                google_maps_url = ${detailPayload.google_maps_url},
                latitude = ${detailPayload.latitude},
                longitude = ${detailPayload.longitude}
            WHERE id_store_accounts = ${storeId}
        `;
    } else {
        await sql`
            INSERT INTO phamacy_store_details (
                id_store_accounts, store_name, house_no, road, sub_district, district,
                province, zipcode, store_phone, store_email, google_maps_url,
                latitude, longitude
            ) VALUES (
                ${storeId}, ${detailPayload.store_name}, ${detailPayload.house_no}, ${detailPayload.road},
                ${detailPayload.sub_district}, ${detailPayload.district}, ${detailPayload.province},
                ${detailPayload.zipcode}, ${detailPayload.store_phone}, ${detailPayload.store_email},
                ${detailPayload.google_maps_url}, ${detailPayload.latitude}, ${detailPayload.longitude}
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

    return { id: storeId, ...detailPayload, email };
}

async function syncSerialSequence(sql, table, column) {
    await sql.unsafe(`
        SELECT setval(
            pg_get_serial_sequence('${table}', '${column}'),
            GREATEST(COALESCE((SELECT MAX(${column}) FROM ${table}), 1), 1)
        )
    `);
}

async function upsertMockUserAddress(sql, accountId, index) {
    const addr = MOCK_USER_ADDRESSES[index % MOCK_USER_ADDRESSES.length];
    await sql`
        INSERT INTO account_address
            (id_account, house_no, road, sub_district, district, province, zipcode)
        VALUES
            (${accountId}, ${addr.house_no}, ${addr.road}, ${addr.sub_district},
             ${addr.district}, ${addr.province}, ${addr.zipcode})
        ON CONFLICT (id_account) DO UPDATE SET
            house_no = EXCLUDED.house_no,
            road = EXCLUDED.road,
            sub_district = EXCLUDED.sub_district,
            district = EXCLUDED.district,
            province = EXCLUDED.province,
            zipcode = EXCLUDED.zipcode,
            updated_at = NOW()
    `;
}

async function upsertMockUser(sql, index) {
    const n = pad3(index + 1);
    const email = `${MARKER}user.${n}@telebot-pharmacy.test`;
    const username = `${MARKER.replace('.', '_')}user_${n}`;
    const name = pickName(index);

    const existing = await sql`
        SELECT id_account FROM account WHERE email_account = ${email} LIMIT 1
    `;

    if (existing[0]) {
        const id = Number(existing[0].id_account);
        await sql`
            UPDATE account SET
                username_account = ${username},
                firstname = ${name.first},
                lastname = ${name.last},
                images_account = COALESCE(NULLIF(TRIM(images_account), ''), 'default.png'),
                phone_number = ${`0818${String(200000 + index).slice(-6)}`},
                is_deleted = 0
            WHERE id_account = ${id}
        `;
        await upsertMockUserAddress(sql, id, index);
        return id;
    }

    const [row] = await sql`
        INSERT INTO account (
            username_account, email_account, password_account, salt_account,
            firstname, lastname, images_account, gender, old, height, weight, phone_number
        ) VALUES (
            ${username}, ${email}, ${DEMO_PASSWORD_HASH}, ${DEMO_SALT},
            ${name.first}, ${name.last}, 'default.png',
            ${index % 2 === 0 ? 'ชาย' : 'หญิง'}, ${25 + (index % 40)}, 165, 58,
            ${`0818${String(200000 + index).slice(-6)}`}
        )
        RETURNING id_account
    `;
    const id = Number(row.id_account);
    await upsertMockUserAddress(sql, id, index);
    return id;
}

async function upsertMockPharmacist(sql, index, storeIds) {
    const n = pad3(index + 1);
    const email = `${MARKER}pharma.${n}@telebot-pharmacy.test`;
    const username = `${MARKER.replace('.', '_')}pharma_${n}`;
    const name = pickName(index + 17);
    const storeId = storeIds[index % storeIds.length];
    const storeRow = await sql`
        SELECT d.store_name FROM phamacy_store_details d
        WHERE d.id_store_accounts = ${storeId} LIMIT 1
    `;
    const storeName = String(storeRow[0]?.store_name || 'ร้านยาพาร์ทเนอร์').trim();
    const workTime = buildMockPharmaWorkTime(index);

    const existing = await sql`
        SELECT id_pharma FROM pharmacist_account
        WHERE email_pharma = ${email} OR username_pharma = ${username}
        LIMIT 1
    `;

    if (existing[0]) {
        await sql`
            UPDATE pharmacist_account SET
                username_pharma = ${username},
                firstname_pharma = ${name.first},
                lastname_pharma = ${name.last},
                phone_pharma = ${`0817${String(300000 + index).slice(-6)}`},
                id_store = ${storeId},
                store_name = ${storeName},
                work_time = ${workTime},
                status_verify = 1,
                images_pharma = COALESCE(NULLIF(TRIM(images_pharma), ''), 'default.png')
            WHERE id_pharma = ${existing[0].id_pharma}
        `;
        return Number(existing[0].id_pharma);
    }

    const salt = PHARMA_DEMO_SALT;
    const hash = DEMO_PASSWORD_HASH;
    const [row] = await sql`
        INSERT INTO pharmacist_account (
            username_pharma, email_pharma, password_pharma, salt_pharma,
            firstname_pharma, lastname_pharma, gender_pharma, age_pharma,
            height_pharma, weight_pharma, phone_pharma, work_time, license_image,
            id_store, store_name, images_pharma, status_verify
        ) VALUES (
            ${username}, ${email}, ${hash}, ${salt},
            ${name.first}, ${name.last},
            ${index % 2 === 0 ? 'ชาย' : 'หญิง'}, ${28 + (index % 25)},
            170, 65,
            ${`0817${String(300000 + index).slice(-6)}`},
            ${workTime},
            'default-license.png',
            ${storeId}, ${storeName}, 'default.png', 1
        )
        RETURNING id_pharma
    `;
    return Number(row.id_pharma);
}

async function seedTrackingPrescriptions(sql, userIds, pharmaIds) {
    const dates = buildSpreadDates(TRACKING_COUNT);
    let inserted = 0;
    let updated = 0;
    let symptomsLinked = 0;

    for (let i = 0; i < TRACKING_COUNT; i++) {
        const n = pad3(i + 1);
        const docNo = `MOCK-BULK-TRK-${n}`;
        const customerCode = `MOCK-TRK-${n}`;
        const d = dates[i];
        const userId = i >= 50 ? userIds[i] : userIds[i % userIds.length];
        const pharmaId = i >= 50 ? pharmaIds[i] : pharmaIds[(i * 3 + 7) % pharmaIds.length];
        const med = MEDICINES[i % MEDICINES.length];
        const price = (55 + (i * 41) % 420).toFixed(2);
        const trackingStatus = i % 5 === 0 ? 'active' : 'completed';
        const autoCreated = trackingStatus === 'active' && i % 10 === 0 ? 1 : 0;

        const userRow = await sql`
            SELECT firstname, lastname FROM account WHERE id_account = ${userId} LIMIT 1
        `;
        const pharmaRow = await sql`
            SELECT firstname_pharma, lastname_pharma, store_name
            FROM pharmacist_account WHERE id_pharma = ${pharmaId} LIMIT 1
        `;
        const patientName = `${userRow[0]?.firstname || ''} ${userRow[0]?.lastname || ''}`.trim();
        const doctor = `ภก. ${pharmaRow[0]?.firstname_pharma || ''} ${pharmaRow[0]?.lastname_pharma || ''}`.trim();
        const clinic = String(pharmaRow[0]?.store_name || 'ร้านยา Telepharmacy').trim();

        const symptomName = pickSymptom32(i);

        const existing = await sql`
            SELECT id FROM prescriptions WHERE doc_no = ${docNo} LIMIT 1
        `;

        let prescriptionId = Number(existing[0]?.id || 0);

        if (existing[0]) {
            await sql`
                UPDATE prescriptions SET
                    id_account = ${userId},
                    id_pharma = ${pharmaId},
                    patient_name = ${patientName},
                    med_details = ${med},
                    med_qty = '1|',
                    med_price = ${price},
                    total_amount = ${price},
                    doctor_name = ${doctor},
                    clinic_name = ${clinic},
                    prescription_date = ${formatThaiDate(d)},
                    created_at = ${d.toISOString()},
                    tracking_status = ${trackingStatus},
                    auto_created = ${autoCreated},
                    tracking_completed_at = CASE
                        WHEN ${trackingStatus} = 'completed' THEN COALESCE(tracking_completed_at, ${d.toISOString()})
                        ELSE NULL
                    END,
                    last_followup_at = CASE
                        WHEN ${trackingStatus} = 'active' THEN ${d.toISOString()}
                        ELSE last_followup_at
                    END
                WHERE id = ${existing[0].id}
            `;
            updated += 1;
        } else {
            const [insertedRow] = await sql`
                INSERT INTO prescriptions (
                    customer_code, id_account, id_pharma, clinic_name, clinic_website,
                    doc_no, patient_name, prescription_date,
                    hn_no, df_value, med_details, med_qty, med_price, total_amount,
                    doctor_name, created_at, tracking_status, auto_created,
                    tracking_completed_at, last_followup_at
                ) VALUES (
                    ${customerCode},
                    ${userId},
                    ${pharmaId},
                    ${clinic},
                    'Telebot-pharmacy',
                    ${docNo},
                    ${patientName},
                    ${formatThaiDate(d)},
                    NULL,
                    ${docNo},
                    ${med},
                    '1|',
                    ${price},
                    ${price},
                    ${doctor},
                    ${d.toISOString()},
                    ${trackingStatus},
                    ${autoCreated},
                    ${trackingStatus === 'completed' ? d.toISOString() : null},
                    ${trackingStatus === 'active' ? d.toISOString() : null}
                )
                RETURNING id
            `;
            prescriptionId = Number(insertedRow?.id || 0);
            inserted += 1;
        }

        if (prescriptionId > 0) {
            await ensureMockPrescriptionSymptom(sql, {
                prescriptionId,
                userId,
                pharmaId,
                symptomName,
                createdAt: d,
                marker: docNo,
            });
            symptomsLinked += 1;
        }
    }

    return { inserted, updated, symptomsLinked };
}

async function seedTodayServices(sql, userIds, pharmaIds) {
    const methods = ['chat', 'video', 'voice'];
    const statuses = ['completed', 'completed', 'completed', 'in_progress', 'pending'];
    let consultCreated = 0;
    let consultUpdated = 0;
    let usageCreated = 0;
    let usageUpdated = 0;

    const removedUsage = await sql`
        DELETE FROM service_usage
        WHERE service_code LIKE 'MOCK-BULK-SRV-%'
        RETURNING id_consult_request
    `;
    const orphanConsultIds = [...new Set(
        removedUsage
            .map((row) => Number(row.id_consult_request || 0))
            .filter((id) => id > 0),
    )];
    if (orphanConsultIds.length) {
        await sql`
            DELETE FROM consult_requests
            WHERE id IN ${sql(orphanConsultIds)}
              AND NOT EXISTS (
                  SELECT 1 FROM service_usage su WHERE su.id_consult_request = consult_requests.id
              )
        `;
    }

    for (let i = 0; i < SERVICE_TODAY_COUNT; i++) {
        const n = pad3(i + 1);
        const serviceCode = `MOCK-BULK-SRV-${n}`;
        const userId = userIds[i];
        const pharmaId = pharmaIds[i];
        const { hour, minute } = serviceSlot(
            8 + Math.floor((i * 17) / 60),
            (i * 17) % 60,
        );
        const serviceDateSql = bkkServiceDateSql(hour, minute);
        const method = methods[i % methods.length];
        const rawStatus = statuses[i % statuses.length];
        const consultStatus = rawStatus === 'completed' ? 'completed'
            : rawStatus === 'in_progress' ? 'accepted'
                : rawStatus === 'pending' ? 'waiting' : 'cancelled';

        const userRow = await sql`
            SELECT firstname, lastname, username_account FROM account WHERE id_account = ${userId} LIMIT 1
        `;
        const pharmaRow = await sql`
            SELECT firstname_pharma, lastname_pharma, username_pharma
            FROM pharmacist_account WHERE id_pharma = ${pharmaId} LIMIT 1
        `;
        const userName = `${userRow[0]?.firstname || ''} ${userRow[0]?.lastname || ''}`.trim()
            || String(userRow[0]?.username_account || '');
        const pharmaName = `${pharmaRow[0]?.firstname_pharma || ''} ${pharmaRow[0]?.lastname_pharma || ''}`.trim()
            || String(pharmaRow[0]?.username_pharma || '');

        const existingUsage = await sql`
            SELECT id_service_usage, id_consult_request FROM service_usage
            WHERE service_code = ${serviceCode}
            LIMIT 1
        `;

        let consultId = Number(existingUsage[0]?.id_consult_request || 0);

        if (consultId > 0) {
            await sql`
                UPDATE consult_requests SET
                    id_account = ${userId},
                    id_pharma = ${pharmaId},
                    status = ${consultStatus},
                    consult_method = ${method},
                    booking_type = 'now',
                    privilege = 'normal',
                    created_at = ${serviceDateSql}
                WHERE id = ${consultId}
            `;
            consultUpdated += 1;
        } else {
            const [consultRow] = await sql`
                INSERT INTO consult_requests (
                    id_account, id_pharma, status, created_at,
                    privilege, consult_method, booking_type, delivery_prepaid
                ) VALUES (
                    ${userId}, ${pharmaId}, ${consultStatus}, ${serviceDateSql},
                    'normal', ${method}, 'now', 0
                )
                RETURNING id
            `;
            consultId = Number(consultRow.id);
            consultCreated += 1;
        }

        const completedAtSql = rawStatus === 'completed'
            ? sql`(${serviceDateSql}) + INTERVAL '35 minutes'`
            : null;

        const usageByConsult = await sql`
            SELECT id_service_usage FROM service_usage
            WHERE id_consult_request = ${consultId}
            LIMIT 1
        `;

        if (existingUsage[0] || usageByConsult[0]) {
            const usageId = Number(existingUsage[0]?.id_service_usage || usageByConsult[0]?.id_service_usage);
            await sql`
                UPDATE service_usage SET
                    service_code = ${serviceCode},
                    id_consult_request = ${consultId},
                    id_account = ${userId},
                    id_pharma = ${pharmaId},
                    user_name = ${userName},
                    pharmacist_name = ${pharmaName},
                    service_type = 'normal',
                    service_format = ${method === 'in_store' ? 'in_store' : 'online'},
                    service_status = ${rawStatus},
                    consult_method = ${method},
                    booking_type = 'now',
                    delivery_prepaid = 0,
                    raw_status = ${consultStatus},
                    note = 'mock bulk dashboard',
                    service_date = ${serviceDateSql},
                    completed_at = ${completedAtSql},
                    updated_at = NOW()
                WHERE id_service_usage = ${usageId}
            `;
            usageUpdated += 1;
        } else {
            await sql`
                INSERT INTO service_usage (
                    service_code, id_consult_request, id_account, id_pharma,
                    user_name, pharmacist_name, service_type, service_format,
                    service_status, consult_method, booking_type, delivery_prepaid,
                    raw_status, note, service_date, completed_at, created_at, updated_at
                ) VALUES (
                    ${serviceCode},
                    ${consultId},
                    ${userId},
                    ${pharmaId},
                    ${userName},
                    ${pharmaName},
                    'normal',
                    ${method === 'in_store' ? 'in_store' : 'online'},
                    ${rawStatus},
                    ${method},
                    'now',
                    0,
                    ${consultStatus},
                    'mock bulk dashboard',
                    ${serviceDateSql},
                    ${completedAtSql},
                    ${serviceDateSql},
                    NOW()
                )
            `;
            usageCreated += 1;
        }
    }

    return { consultCreated, consultUpdated, usageCreated, usageUpdated };
}

loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
    console.error('ต้องมี DATABASE_URL ใน .env');
    process.exit(1);
}

const sql = postgres(url, { ssl: 'require', prepare: false, connect_timeout: 30 });

try {
    const { keys: existingCoordKeys, urls: existingUrls } = await loadExistingCoords(sql);

    for (const s of PARTNER_STORES) {
        const key = coordKey(s.latitude, s.longitude);
        const mapsUrl = googleMapsUrl(s.latitude, s.longitude);
        if (existingCoordKeys.has(key)) {
            throw new Error(`พิกัดซ้ำกับร้านเดิม: ${key} (${s.store_name})`);
        }
        if (existingUrls.has(mapsUrl)) {
            throw new Error(`Google Maps URL ซ้ำ: ${mapsUrl}`);
        }
    }

    for (const [table, column] of [
        ['account', 'id_account'],
        ['pharmacist_account', 'id_pharma'],
        ['phamacy_store_accounts', 'id_store_accounts'],
        ['consult_requests', 'id'],
        ['prescriptions', 'id'],
        ['service_usage', 'id_service_usage'],
    ]) {
        await syncSerialSequence(sql, table, column);
    }

    const storeResults = [];
    for (let i = 0; i < STORE_COUNT; i++) {
        storeResults.push(await upsertPartnerStore(sql, i, PARTNER_STORES[i]));
    }
    const storeIds = storeResults.map((s) => s.id);

    const userIds = [];
    for (let i = 0; i < USER_COUNT; i++) {
        userIds.push(await upsertMockUser(sql, i));
    }

    const pharmaIds = [];
    for (let i = 0; i < PHARMA_COUNT; i++) {
        pharmaIds.push(await upsertMockPharmacist(sql, i, storeIds));
    }

    const tracking = await seedTrackingPrescriptions(sql, userIds, pharmaIds);
    const services = await seedTodayServices(sql, userIds.slice(0, SERVICE_TODAY_COUNT), pharmaIds.slice(0, SERVICE_TODAY_COUNT));

    const [{ n: mockUsers }] = await sql`
        SELECT COUNT(*)::int AS n FROM account
        WHERE email_account LIKE ${MARKER + 'user.%'}
          AND COALESCE(is_deleted, 0) = 0
    `;
    const [{ n: mockPharmas }] = await sql`
        SELECT COUNT(*)::int AS n FROM pharmacist_account
        WHERE email_pharma LIKE ${MARKER + 'pharma.%'}
    `;
    const [{ n: mockStores }] = await sql`
        SELECT COUNT(*)::int AS n FROM phamacy_store_accounts
        WHERE personal_email LIKE ${MARKER + 'store.%'}
          AND COALESCE(is_deleted, 0) = 0
    `;
    const [{ n: mockTracking }] = await sql`
        SELECT COUNT(*)::int AS n FROM prescriptions
        WHERE doc_no LIKE 'MOCK-BULK-TRK-%'
    `;
    const [{ n: mockTodayServices }] = await sql`
        SELECT COUNT(*)::int AS n FROM service_usage
        WHERE service_code LIKE 'MOCK-BULK-SRV-%'
          AND service_date::date = (NOW() AT TIME ZONE 'Asia/Bangkok')::date
    `;

    console.log(JSON.stringify({
        status: 'success',
        message: `mock bulk: เภสัช ${mockPharmas} · ผู้ใช้ ${mockUsers} · ร้าน ${mockStores} · ติดตาม PDF ${mockTracking} · บริการวันนี้ ${mockTodayServices}`,
        stores: storeResults.map((s) => ({ id: s.id, name: s.store_name, maps: s.google_maps_url })),
        tracking,
        services,
        totals: {
            mock_pharmacists: mockPharmas,
            mock_users: mockUsers,
            mock_stores: mockStores,
            mock_tracking_prescriptions: mockTracking,
            mock_today_services: mockTodayServices,
        },
        demo_password_stores_pharmacists: DEMO_PASSWORD,
    }, null, 2));
} catch (err) {
    console.error(JSON.stringify({ status: 'error', message: err.message, stack: err.stack }, null, 2));
    process.exit(1);
} finally {
    await sql.end({ timeout: 5 });
}
