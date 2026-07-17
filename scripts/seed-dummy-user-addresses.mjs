/**
 * เติมที่อยู่จัดส่งให้ผู้ใช้ mock ที่ยังไม่มี / ว่าง
 * ใช้: npm run db:seed-dummy-user-addresses
 */
import postgres from 'postgres';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ADDRESS_TEMPLATES = [
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

function isBlank(value) {
    const v = String(value ?? '').trim();
    return !v || v === '-';
}

function needsAddress(user) {
    if (!user.id_address) return true;
    return isBlank(user.house_no)
        || isBlank(user.sub_district)
        || isBlank(user.province)
        || isBlank(user.zipcode);
}

loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
    console.error('ต้องมี DATABASE_URL ใน .env');
    process.exit(1);
}

const sql = postgres(url, { ssl: 'require', prepare: false, connect_timeout: 20 });

try {
    const users = await sql`
        SELECT a.id_account, a.username_account, a.email_account, a.firstname, a.lastname,
               addr.id_address, addr.house_no, addr.road, addr.sub_district,
               addr.district, addr.province, addr.zipcode
        FROM account a
        LEFT JOIN account_address addr ON addr.id_account = a.id_account
        WHERE COALESCE(a.is_deleted, 0) = 0
          AND (
              a.email_account LIKE '%@telebot-pharmacy.test'
              OR a.email_account LIKE '%@example.test'
              OR a.username_account LIKE 'demo_%'
              OR a.username_account LIKE 'dummy_%'
              OR a.username_account LIKE 'mock.bulk%'
              OR a.email_account LIKE 'mock.bulk.%'
          )
        ORDER BY a.id_account ASC
    `;

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const samples = [];

    for (let i = 0; i < users.length; i++) {
        const user = users[i];
        const addr = ADDRESS_TEMPLATES[i % ADDRESS_TEMPLATES.length];

        if (!needsAddress(user)) {
            skipped += 1;
            continue;
        }

        const hadAddress = Boolean(user.id_address);

        await sql`
            INSERT INTO account_address
                (id_account, house_no, road, sub_district, district, province, zipcode)
            VALUES
                (${user.id_account}, ${addr.house_no}, ${addr.road}, ${addr.sub_district},
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

        if (hadAddress) updated += 1;
        else inserted += 1;

        if (samples.length < 5) {
            samples.push({
                id: user.id_account,
                name: `${user.firstname || ''} ${user.lastname || ''}`.trim(),
                address: `${addr.house_no} ${addr.road} ${addr.sub_district} ${addr.district} ${addr.province} ${addr.zipcode}`,
            });
        }
    }

    const [{ n: withAddress }] = await sql`
        SELECT COUNT(*)::int AS n
        FROM account a
        INNER JOIN account_address addr ON addr.id_account = a.id_account
        WHERE COALESCE(a.is_deleted, 0) = 0
          AND TRIM(COALESCE(addr.house_no, '')) <> ''
          AND TRIM(COALESCE(addr.province, '')) <> ''
          AND (
              a.email_account LIKE '%@telebot-pharmacy.test'
              OR a.email_account LIKE '%@example.test'
              OR a.username_account LIKE 'demo_%'
              OR a.username_account LIKE 'dummy_%'
              OR a.username_account LIKE 'mock.bulk%'
              OR a.email_account LIKE 'mock.bulk.%'
          )
    `;

    console.log(JSON.stringify({
        status: 'success',
        message: `เติมที่อยู่ mock user: เพิ่ม ${inserted} · อัปเดต ${updated} · ข้าม (ครบแล้ว) ${skipped} · รวมมีที่อยู่ ${withAddress} คน`,
        dummy_users_total: users.length,
        inserted,
        updated,
        skipped,
        with_address: withAddress,
        samples,
    }, null, 2));
} catch (err) {
    console.error(JSON.stringify({ status: 'error', message: err.message }, null, 2));
    process.exit(1);
} finally {
    await sql.end({ timeout: 3 });
}
