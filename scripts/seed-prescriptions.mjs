/**
 * ลดใบสรุปรายการยาของ นนทพัทธ์ เหลือ ~25 รายการ แล้วเพิ่ม dummy 100 รายการกระจายวัน/เดือน
 * ใช้: npm run db:seed-prescriptions
 */
import postgres from 'postgres';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAccountIdByPatientName } from './lib/resolvePatientAccount.mjs';

const KEEP_NONTAPAT = 25;
const DUMMY_COUNT = 100;
const TARGET_ACCOUNT = 1;
const TARGET_NAME = 'นนทพัทธ์';

const MEDICINES = [
    'พาราเซตามอล 500 มก.',
    'ยาแก้ไอ ดีมิลด์',
    'ยาแก้แพ้ ซีเทอรีซีน',
    'ยาลดไข้ ไอบูโพรเฟน',
    'ยาลดกรด ออมเพราโซล',
    'ยาแก้ท้องเสีย สมุนไพร',
    'วิตามินซี ชนิดเม็ด',
    'ยาหยอดตา คูล',
    'ยาทาแผล โพลิวินีล',
    'ยาแก้ปวดเม็ด สเปรย์',
    'ยาขับเสมหะ แก้วมังกร',
    'ยาแก้แสบท้อง แมกนีเซีย',
    'ยาหยอดจมูก เกลือแร่',
    'ยาทาผื่นคัน สเตียรอยด์อ่อน',
    'ยาเสริมภูมิคุ้มกัน สังกะสี',
];

const DUMMY_PATIENTS = [
    'สมชาย ใจดี', 'วิภา รักสุขภาพ', 'อนุชา มีสุข', 'พิมพ์ใจ สบายดี', 'กมล แสงทอง',
    'ธนกฤต วงศ์ไทย', 'ศิริพร ขำใจ', 'ประเสริฐ สุขใจ', 'นลิน พาใจ', 'วีรภัทร มั่นใจ',
    'รัตนา สุขสันต์', 'ชาญชัย วิริยะ', 'มณีรัตน์ งามดี', 'พงศกร ชูชาติ', 'อรทัย แจ่มใส',
    'สุภาพร มั่นคง', 'เกียรติศักดิ์ รุ่งเรือง', 'ปวีณา ศรีสุข', 'วรเมธ บุญมี', 'จิราพร สดใส',
    'อดิศักดิ์ ทองคำ', 'กนกวรรณ แสงจันทร์', 'ภูมิพัฒน์ ชัยชนะ', 'สุดารัตน์ ใจงาม', 'ธีรพงษ์ สุขใจ',
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

function formatThaiDate(d) {
    const pad = (n) => String(n).padStart(2, '0');
    const buddhistYear = d.getFullYear() + 543;
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${buddhistYear} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** สร้าง 100 วันที่กระจายทั้ง 7 วันล่าสุด / 30 วัน / 12 เดือนย้อนหลัง */
function buildSpreadDates(count) {
    const now = new Date();
    const slots = [];

    // 7 วันล่าสุด — 3 รายการต่อวัน (21)
    for (let day = 0; day < 7; day++) {
        for (let slot = 0; slot < 3; slot++) {
            const d = new Date(now);
            d.setDate(now.getDate() - day);
            d.setHours(8 + slot * 4 + (day % 2), (slot * 17 + day * 11) % 60, 0, 0);
            slots.push(d);
        }
    }

    // 8–30 วันที่แล้ว — วันละ 1 รายการ (23)
    for (let day = 8; day <= 30; day++) {
        const d = new Date(now);
        d.setDate(now.getDate() - day);
        d.setHours(10 + (day % 7), (day * 13) % 60, 0, 0);
        slots.push(d);
    }

    // 12 เดือนย้อนหลัง — เดือนละ 5 รายการ วันต่างกัน (60) ใช้ 56 รายการ
    for (let month = 1; month <= 12; month++) {
        const perMonth = month <= 11 ? 5 : 1;
        for (let j = 0; j < perMonth; j++) {
            const dayOfMonth = Math.min(28, 2 + j * 5 + (month % 3));
            const d = new Date(
                now.getFullYear(),
                now.getMonth() - month,
                dayOfMonth,
                9 + j,
                (month * 7 + j * 11) % 60,
                0,
                0,
            );
            slots.push(d);
        }
    }

    slots.sort((a, b) => b.getTime() - a.getTime());
    return slots.slice(0, count);
}

loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
    console.error('ต้องมี DATABASE_URL ใน .env');
    process.exit(1);
}

const sql = postgres(url, { ssl: 'require', prepare: false, connect_timeout: 20 });

try {
    const removedDemo = await sql`
        DELETE FROM prescriptions WHERE doc_no LIKE 'DEMO-%' RETURNING id
    `;

    const [{ n: beforeNontapat }] = await sql`
        SELECT COUNT(*)::int AS n FROM prescriptions
        WHERE id_account = ${TARGET_ACCOUNT}
           OR patient_name ILIKE ${`%${TARGET_NAME}%`}
    `;

    const deleted = await sql`
        WITH ranked AS (
            SELECT id,
                   ROW_NUMBER() OVER (
                       ORDER BY
                           CASE WHEN COALESCE(TRIM(med_details), '') <> '' THEN 0 ELSE 1 END,
                           created_at DESC,
                           id DESC
                   ) AS rn
            FROM prescriptions
            WHERE id_account = ${TARGET_ACCOUNT}
               OR patient_name ILIKE ${`%${TARGET_NAME}%`}
        )
        DELETE FROM prescriptions p
        USING ranked r
        WHERE p.id = r.id AND r.rn > ${KEEP_NONTAPAT}
        RETURNING p.id
    `;

    const [{ n: afterNontapat }] = await sql`
        SELECT COUNT(*)::int AS n FROM prescriptions
        WHERE id_account = ${TARGET_ACCOUNT}
           OR patient_name ILIKE ${`%${TARGET_NAME}%`}
    `;

    const pharmas = await sql`
        SELECT id_pharma, firstname_pharma, lastname_pharma, store_name
        FROM pharmacist_account
        WHERE COALESCE(status_verify, 0) = 1
        ORDER BY id_pharma
    `;

    if (!pharmas.length) {
        throw new Error('ไม่พบเภสัชกรที่ verify แล้ว');
    }

    const dates = buildSpreadDates(DUMMY_COUNT);
    const inserted = [];

    for (let i = 0; i < DUMMY_COUNT; i++) {
        const d = dates[i];
        const pharma = pharmas[i % pharmas.length];
        const patient = DUMMY_PATIENTS[i % DUMMY_PATIENTS.length];
        const med = MEDICINES[i % MEDICINES.length];
        const price = (45 + (i * 37) % 456).toFixed(2);
        const docNo = `DEMO-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(i + 1).padStart(3, '0')}`;
        const doctor = `ภก. ${pharma.firstname_pharma || ''} ${pharma.lastname_pharma || ''}`.trim();
        const clinic = String(pharma.store_name || 'ร้านยา Telepharmacy').trim();
        const patientAccountId = await resolveAccountIdByPatientName(sql, patient);

        const [row] = await sql`
            INSERT INTO prescriptions (
                customer_code, id_account, id_pharma, clinic_name, clinic_website,
                doc_no, patient_name, prescription_date,
                hn_no, df_value, med_details, med_qty, med_price, total_amount,
                doctor_name, created_at, tracking_status, auto_created
            ) VALUES (
                ${`DEMO-${String(i + 1).padStart(4, '0')}`},
                ${patientAccountId},
                ${pharma.id_pharma},
                ${clinic},
                'Telebot-pharmacy',
                ${docNo},
                ${patient},
                ${formatThaiDate(d)},
                NULL,
                ${docNo},
                ${med},
                '1|',
                ${price},
                ${price},
                ${doctor},
                ${d.toISOString()},
                'completed',
                0
            )
            RETURNING id, patient_name, id_pharma, prescription_date, created_at
        `;
        inserted.push(row);
    }

    const [{ n: total }] = await sql`SELECT COUNT(*)::int AS n FROM prescriptions`;
    const [{ n: week7 }] = await sql`
        SELECT COUNT(*)::int AS n FROM prescriptions
        WHERE created_at >= NOW() - INTERVAL '7 days'
    `;
    const [{ n: month30 }] = await sql`
        SELECT COUNT(*)::int AS n FROM prescriptions
        WHERE created_at >= NOW() - INTERVAL '30 days'
    `;

    const monthBuckets = await sql`
        SELECT TO_CHAR(created_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM') AS ym, COUNT(*)::int AS n
        FROM prescriptions
        WHERE patient_name LIKE 'DEMO%' OR doc_no LIKE 'DEMO-%'
           OR customer_code LIKE 'DEMO-%'
        GROUP BY 1
        ORDER BY 1 DESC
        LIMIT 15
    `;

    console.log(JSON.stringify({
        status: 'success',
        message: `นนทพัทธ์: ${beforeNontapat} → ${afterNontapat} รายการ (ลบ ${deleted.length}) | เพิ่ม dummy ${inserted.length} รายการ`,
        demo_removed_before_seed: removedDemo.length,
        nontapat_before: beforeNontapat,
        nontapat_after: afterNontapat,
        nontapat_deleted: deleted.length,
        dummy_inserted: inserted.length,
        total_prescriptions: total,
        last_7_days: week7,
        last_30_days: month30,
        dummy_month_distribution: monthBuckets,
        sample_dummy: inserted.slice(0, 3),
    }, null, 2));
} catch (err) {
    console.error(JSON.stringify({ status: 'error', message: err.message }, null, 2));
    process.exit(1);
} finally {
    await sql.end({ timeout: 3 });
}
