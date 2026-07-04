/**
 * ตั้งประวัติใบสั่งยา (/history) ของเภสัชกรให้มี N รายการที่แสดงได้จริง (auto_created = 0)
 * ใช้: npm run db:seed-pharma-history -- --pharma-name="นายสมชาย รักงาม" --count=40
 */
import postgres from 'postgres';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAccountIdByPatientName } from './lib/resolvePatientAccount.mjs';

const DEFAULT_COUNT = 40;

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
];

const DUMMY_PATIENTS = [
    'สมชาย ใจดี', 'วิภา รักสุขภาพ', 'อนุชา มีสุข', 'พิมพ์ใจ สบายดี', 'กมล แสงทอง',
    'ธนกฤต วงศ์ไทย', 'ศิริพร ขำใจ', 'ประเสริฐ สุขใจ', 'นลิน พาใจ', 'วีรภัทร มั่นใจ',
    'รัตนา สุขสันต์', 'ชาญชัย วิริยะ', 'มณีรัตน์ งามดี', 'พงศกร ชูชาติ', 'อรทัย แจ่มใส',
    'สุภาพร มั่นคง', 'เกียรติศักดิ์ รุ่งเรือง', 'ปวีณา ศรีสุข', 'วรเมธ บุญมี', 'จิราพร สดใส',
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

function parseArgs() {
    const out = { pharmaId: 0, pharmaName: '', count: DEFAULT_COUNT };
    for (const arg of process.argv.slice(2)) {
        const idMatch = arg.match(/^--pharma=(\d+)$/);
        if (idMatch) out.pharmaId = Number(idMatch[1]);
        const nameMatch = arg.match(/^--pharma-name=(.+)$/);
        if (nameMatch) out.pharmaName = decodeURIComponent(nameMatch[1]).trim();
        const countMatch = arg.match(/^--count=(\d+)$/);
        if (countMatch) out.count = Math.max(1, Number(countMatch[1]) || DEFAULT_COUNT);
    }
    return out;
}

function formatThaiDate(d) {
    const pad = (n) => String(n).padStart(2, '0');
    const buddhistYear = d.getFullYear() + 543;
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${buddhistYear} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildSpreadDates(count) {
    const now = new Date();
    const slots = [];

    for (let day = 0; day < 7; day++) {
        for (let slot = 0; slot < 3; slot++) {
            const d = new Date(now);
            d.setDate(now.getDate() - day);
            d.setHours(8 + slot * 4 + (day % 2), (slot * 17 + day * 11) % 60, 0, 0);
            slots.push(d);
        }
    }

    for (let day = 8; day <= 30; day++) {
        const d = new Date(now);
        d.setDate(now.getDate() - day);
        d.setHours(10 + (day % 7), (day * 13) % 60, 0, 0);
        slots.push(d);
    }

    for (let month = 1; month <= 12; month++) {
        for (let j = 0; j < 5; j++) {
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

    return slots.slice(0, count);
}

loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
    console.error('ต้องมี DATABASE_URL ใน .env');
    process.exit(1);
}

const { pharmaId: argPharmaId, pharmaName, count: TARGET } = parseArgs();
const sql = postgres(url, { ssl: 'require', prepare: false, connect_timeout: 20 });

try {
    let targetPharmaId = argPharmaId;
    let pharmacist = null;

    if (!targetPharmaId && pharmaName) {
        const parts = pharmaName.split(/\s+/).filter(Boolean);
        const first = parts[0] || '';
        const last = parts.slice(1).join(' ') || parts[0] || '';
        const found = await sql`
            SELECT id_pharma, firstname_pharma, lastname_pharma, store_name
            FROM pharmacist_account
            WHERE firstname_pharma ILIKE ${'%' + first + '%'}
              AND lastname_pharma ILIKE ${'%' + last + '%'}
            ORDER BY id_pharma
            LIMIT 1
        `;
        if (!found[0]) throw new Error(`ไม่พบเภสัชกรชื่อ "${pharmaName}"`);
        pharmacist = found[0];
        targetPharmaId = Number(found[0].id_pharma);
    } else if (targetPharmaId > 0) {
        const found = await sql`
            SELECT id_pharma, firstname_pharma, lastname_pharma, store_name
            FROM pharmacist_account WHERE id_pharma = ${targetPharmaId} LIMIT 1
        `;
        pharmacist = found[0] || null;
    } else {
        throw new Error('ระบุ --pharma=ID หรือ --pharma-name="ชื่อ นามสกุล"');
    }

    const pharmacistLabel = pharmacist
        ? `ภก. ${pharmacist.firstname_pharma || ''} ${pharmacist.lastname_pharma || ''}`.trim()
        : `เภสัช #${targetPharmaId}`;
    const clinic = String(pharmacist?.store_name || 'ร้านยา Telepharmacy').trim();
    const doctor = pharmacistLabel;

    const [{ n: beforeTotal }] = await sql`
        SELECT COUNT(*)::int AS n FROM prescriptions WHERE id_pharma = ${targetPharmaId}
    `;
    const [{ n: beforeHistory }] = await sql`
        SELECT COUNT(*)::int AS n FROM prescriptions
        WHERE id_pharma = ${targetPharmaId} AND COALESCE(auto_created, 0) != 1
    `;

    const removedPlaceholders = await sql`
        DELETE FROM prescriptions
        WHERE id_pharma = ${targetPharmaId}
          AND COALESCE(auto_created, 0) = 1
        RETURNING id
    `;

    const trimmed = await sql`
        WITH ranked AS (
            SELECT id,
                   ROW_NUMBER() OVER (
                       ORDER BY created_at DESC NULLS LAST, id DESC
                   ) AS rn
            FROM prescriptions
            WHERE id_pharma = ${targetPharmaId}
              AND COALESCE(auto_created, 0) != 1
        )
        DELETE FROM prescriptions p
        USING ranked r
        WHERE p.id = r.id AND r.rn > ${TARGET}
        RETURNING p.id
    `;

    const [{ n: afterTrim }] = await sql`
        SELECT COUNT(*)::int AS n FROM prescriptions
        WHERE id_pharma = ${targetPharmaId} AND COALESCE(auto_created, 0) != 1
    `;

    const need = Math.max(0, TARGET - afterTrim);
    const dates = buildSpreadDates(need);
    const inserted = [];

    for (let i = 0; i < need; i++) {
        const d = dates[i];
        const patient = DUMMY_PATIENTS[i % DUMMY_PATIENTS.length];
        const med = MEDICINES[i % MEDICINES.length];
        const price = (55 + (i * 41) % 420).toFixed(2);
        const docNo = `RX-${targetPharmaId}-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(i + 1).padStart(3, '0')}`;
        const patientAccountId = await resolveAccountIdByPatientName(sql, patient);

        const [row] = await sql`
            INSERT INTO prescriptions (
                customer_code, id_account, id_pharma, clinic_name, clinic_website,
                doc_no, patient_name, prescription_date,
                hn_no, df_value, med_details, med_qty, med_price, total_amount,
                doctor_name, created_at, tracking_status, auto_created
            ) VALUES (
                ${`RX-${String(i + 1).padStart(4, '0')}`},
                ${patientAccountId},
                ${targetPharmaId},
                ${clinic},
                'Telebot-pharmacy',
                ${docNo},
                ${patient},
                ${formatThaiDate(d)},
                ${`HN-${String(1000 + i)}`},
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
            RETURNING id, patient_name, prescription_date, created_at
        `;
        inserted.push(row);
    }

    const [{ n: afterTotal }] = await sql`
        SELECT COUNT(*)::int AS n FROM prescriptions WHERE id_pharma = ${targetPharmaId}
    `;
    const [{ n: afterHistory }] = await sql`
        SELECT COUNT(*)::int AS n FROM prescriptions
        WHERE id_pharma = ${targetPharmaId} AND COALESCE(auto_created, 0) != 1
    `;
    const [{ n: week7 }] = await sql`
        SELECT COUNT(*)::int AS n FROM prescriptions
        WHERE id_pharma = ${targetPharmaId}
          AND created_at >= NOW() - INTERVAL '7 days'
          AND COALESCE(auto_created, 0) != 1
    `;

    console.log(JSON.stringify({
        status: 'success',
        message: `${pharmacistLabel}: /history แสดงได้ ${afterHistory} รายการ (เป้าหมาย ${TARGET})`,
        pharmacist: pharmacistLabel,
        id_pharma: targetPharmaId,
        target: TARGET,
        before_total: beforeTotal,
        before_history_visible: beforeHistory,
        removed_placeholders: removedPlaceholders.length,
        trimmed_excess: trimmed.length,
        inserted: inserted.length,
        after_total: afterTotal,
        after_history_visible: afterHistory,
        last_7_days_history: week7,
    }, null, 2));
} catch (err) {
    console.error(JSON.stringify({ status: 'error', message: err.message }, null, 2));
    process.exit(1);
} finally {
    await sql.end({ timeout: 3 });
}
