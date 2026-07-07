/**
 * สร้างบัญชี/ที่อยู่ผู้ป่วย dummy + ผูก prescriptions.id_account
 * ใช้: npm run db:seed-prescription-patient-links
 */
import postgres from 'postgres';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAccountIdByPatientName } from './lib/resolvePatientAccount.mjs';

const DEMO_PASSWORD = 'not-for-login';
const DEMO_SALT = 'demo';

const ADDRESS_TEMPLATES = [
    { house_no: '99/1', road: 'ซอยรามคำแหง 24', sub_district: 'หัวหมาก', district: 'บางกะปิ', province: 'กรุงเทพมหานคร', zipcode: '10240' },
    { house_no: '12', road: 'ถนนสุขุมวิท', sub_district: 'คลองตัน', district: 'คลองเตย', province: 'กรุงเทพมหานคร', zipcode: '10110' },
    { house_no: '45', road: 'ถนนพระราม 9', sub_district: 'ห้วยขวาง', district: 'ห้วยขวาง', province: 'กรุงเทพมหานคร', zipcode: '10310' },
    { house_no: '78', road: 'ถนนจรัญสนิทวงศ์', sub_district: 'บางขุนศรี', district: 'บางกอกน้อย', province: 'กรุงเทพมหานคร', zipcode: '10700' },
    { house_no: '33/2', road: 'ซอยลาดพร้าว 80', sub_district: 'ลาดพร้าว', district: 'ลาดพร้าว', province: 'กรุงเทพมหานคร', zipcode: '10230' },
    { house_no: '16/1', road: 'ถนนพหลโยธิน', sub_district: 'อินทประมูล', district: 'โพธิ์ทอง', province: 'อ่างทอง', zipcode: '14120' },
    { house_no: '128/4', road: 'ถนนลาดพร้าว ซอย 101', sub_district: 'ลาดพร้าว', district: 'ลาดพร้าว', province: 'กรุงเทพมหานคร', zipcode: '10230' },
    { house_no: '88', road: 'ถนนบางนา-ตราด กม.3', sub_district: 'บางนาเหนือ', district: 'บางนา', province: 'กรุงเทพมหานคร', zipcode: '10260' },
    { house_no: '55/3', road: 'ถนนงามวงศ์วาน', sub_district: 'ทุ่งสองห้อง', district: 'หลักสี่', province: 'กรุงเทพมหานคร', zipcode: '10210' },
    { house_no: '7', road: 'ถนนรัชดาภิเษก', sub_district: 'ดินแดง', district: 'ดินแดง', province: 'กรุงเทพมหานคร', zipcode: '10400' },
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

function splitPatientName(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return null;
    return { first: parts[0], last: parts.slice(1).join(' ') || parts[0] };
}

function slugifyName(first, last) {
    return `${first}_${last}`.toLowerCase().replace(/[^\w\u0E00-\u0E7F]+/g, '_').replace(/^_|_$/g, '');
}

async function ensureAddress(sql, idAccount, templateIndex) {
    const addr = ADDRESS_TEMPLATES[templateIndex % ADDRESS_TEMPLATES.length];
    const existing = await sql`
        SELECT id_address FROM account_address WHERE id_account = ${idAccount} LIMIT 1
    `;
    if (existing[0]) return false;

    await sql`
        INSERT INTO account_address
            (id_account, house_no, road, sub_district, district, province, zipcode)
        VALUES
            (${idAccount}, ${addr.house_no}, ${addr.road}, ${addr.sub_district},
             ${addr.district}, ${addr.province}, ${addr.zipcode})
        ON CONFLICT (id_account) DO NOTHING
    `;
    return true;
}

async function ensurePatientAccount(sql, patientName, index) {
    const parsed = splitPatientName(patientName);
    if (!parsed) return null;

    let accountId = await resolveAccountIdByPatientName(sql, patientName);
    if (accountId) {
        await ensureAddress(sql, accountId, accountId);
        return accountId;
    }

    const slug = slugifyName(parsed.first, parsed.last);
    const email = `demo.patient.${slug}@telebot-pharmacy.test`;
    const username = `demo_patient_${String(index + 1).padStart(2, '0')}`;
    const phone = `08${String(1000000 + index).slice(-8)}`;

    const byEmail = await sql`
        SELECT id_account FROM account WHERE email_account = ${email} LIMIT 1
    `;
    if (byEmail[0]) {
        accountId = Number(byEmail[0].id_account);
        await sql`
            UPDATE account SET
                firstname = ${parsed.first},
                lastname = ${parsed.last},
                phone_number = COALESCE(NULLIF(TRIM(phone_number), ''), ${phone}),
                images_account = COALESCE(NULLIF(TRIM(images_account), ''), 'default.png'),
                is_deleted = 0
            WHERE id_account = ${accountId}
        `;
    } else {
        const inserted = await sql`
            INSERT INTO account (
                username_account, email_account, password_account, salt_account,
                firstname, lastname, images_account, gender, old, height, weight, phone_number
            ) VALUES (
                ${username}, ${email}, ${DEMO_PASSWORD}, ${DEMO_SALT},
                ${parsed.first}, ${parsed.last}, 'default.png',
                'ไม่ระบุ', 28, 165, 60, ${phone}
            )
            RETURNING id_account
        `;
        accountId = Number(inserted[0]?.id_account);
    }

    if (!accountId) return null;
    await ensureAddress(sql, accountId, index);
    return accountId;
}

loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
    console.error('ต้องมี DATABASE_URL ใน .env');
    process.exit(1);
}

const sql = postgres(url, { ssl: 'require', prepare: false, connect_timeout: 20 });

try {
    const patientNames = await sql`
        SELECT DISTINCT TRIM(patient_name) AS patient_name
        FROM prescriptions
        WHERE COALESCE(TRIM(patient_name), '') <> ''
        ORDER BY TRIM(patient_name) ASC
    `;

    let accountsCreated = 0;
    let addressesAdded = 0;
    let linked = 0;
    const nameToAccount = new Map();

    for (let i = 0; i < patientNames.length; i++) {
        const patientName = String(patientNames[i].patient_name || '').trim();
        const beforeId = await resolveAccountIdByPatientName(sql, patientName);
        const accountId = await ensurePatientAccount(sql, patientName, i);
        if (!accountId) continue;

        if (!beforeId) accountsCreated += 1;
        nameToAccount.set(patientName, accountId);

        const updated = await sql`
            UPDATE prescriptions
            SET id_account = ${accountId}
            WHERE TRIM(patient_name) = ${patientName}
              AND (id_account IS NULL OR id_account <> ${accountId})
            RETURNING id
        `;
        linked += updated.length;
    }

    const [{ n: withAddress }] = await sql`
        SELECT COUNT(*)::int AS n
        FROM prescriptions p
        INNER JOIN account_address addr ON addr.id_account = p.id_account
        WHERE COALESCE(TRIM(p.patient_name), '') <> ''
    `;

    const [{ n: withoutAddress }] = await sql`
        SELECT COUNT(*)::int AS n
        FROM prescriptions p
        LEFT JOIN account_address addr ON addr.id_account = p.id_account
        WHERE COALESCE(TRIM(p.patient_name), '') <> ''
          AND addr.id_address IS NULL
    `;

    console.log(JSON.stringify({
        status: 'success',
        message: `ผู้ป่วยในใบสรุปรายการยา ${patientNames.length} ชื่อ · สร้างบัญชีใหม่ ${accountsCreated} · ผูกใบสรุปรายการยา ${linked} รายการ · มีที่อยู่ ${withAddress} · ยังไม่มีที่อยู่ ${withoutAddress}`,
        patient_names_total: patientNames.length,
        accounts_created: accountsCreated,
        prescriptions_linked: linked,
        prescriptions_with_address: withAddress,
        prescriptions_without_address: withoutAddress,
        patients: [...nameToAccount.entries()].map(([name, id]) => ({ patient_name: name, id_account: id })),
    }, null, 2));
} catch (err) {
    console.error(JSON.stringify({ status: 'error', message: err.message }, null, 2));
    process.exit(1);
} finally {
    await sql.end({ timeout: 3 });
}
