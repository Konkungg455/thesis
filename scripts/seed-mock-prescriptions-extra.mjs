/**
 * เพิ่มใบสรุปรายการยา mock 20 ใบ — ผู้ใช้คนละคน + เภสัชคนละคน
 * ใช้: npm run db:seed-mock-prescriptions-extra
 */
import postgres from 'postgres';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickSymptom32 } from './lib/symptoms32.mjs';
import { ensureMockPrescriptionSymptom } from './lib/mockPrescriptionSymptoms.mjs';

const EXTRA_COUNT = 20;
const START_NO = 51; // MOCK-BULK-TRK-051 … 070
const PAIR_OFFSET = 50; // ใช้ mock user/pharma ลำดับที่ 51–70

const MEDICINES = [
    'พาราเซตามอล 500 มก.', 'ยาแก้ไอ ดีมิลด์', 'ยาแก้แพ้ ซีเทอรีซีน', 'ยาลดไข้ ไอบูโพรเฟน',
    'ยาลดกรด ออมเพราโซล', 'ยาแก้ท้องเสีย สมุนไพร', 'วิตามินซี ชนิดเม็ด', 'ยาหยอดตา คูล',
    'ยาทาแผล โพลิวินีล', 'ยาแก้ปวดเม็ด สเปรย์',
];

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

function pad3(n) {
    return String(n).padStart(3, '0');
}

function formatThaiDate(d) {
    const pad = (n) => String(n).padStart(2, '0');
    const buddhistYear = d.getFullYear() + 543;
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${buddhistYear} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildSpreadDates(count, startIndex = 0) {
    const now = new Date();
    const slots = [];
    for (let day = 0; day < 21; day++) {
        for (let slot = 0; slot < 3; slot++) {
            const d = new Date(now);
            d.setDate(now.getDate() - day);
            d.setHours(8 + slot * 4 + ((day + startIndex) % 3), ((slot * 23 + day * 11 + startIndex) % 60), 0, 0);
            slots.push(d);
        }
    }
    slots.sort((a, b) => b.getTime() - a.getTime());
    return slots.slice(0, count);
}

const sql = postgres(url, { ssl: 'require', prepare: false, connect_timeout: 30 });

try {
    const users = await sql`
        SELECT id_account FROM account
        WHERE email_account LIKE 'mock.bulk.user.%@telebot-pharmacy.test'
          AND COALESCE(is_deleted, 0) = 0
        ORDER BY id_account ASC
    `;
    const pharmas = await sql`
        SELECT id_pharma FROM pharmacist_account
        WHERE email_pharma LIKE 'mock.bulk.pharma.%@telebot-pharmacy.test'
          AND COALESCE(status_verify, 0) = 1
        ORDER BY id_pharma ASC
    `;

    if (users.length < PAIR_OFFSET + EXTRA_COUNT || pharmas.length < PAIR_OFFSET + EXTRA_COUNT) {
        console.error(JSON.stringify({
            status: 'error',
            message: `ต้องมี mock user/pharma อย่างน้อย ${PAIR_OFFSET + EXTRA_COUNT} คน — รัน npm run db:seed-mock-bulk ก่อน`,
            users: users.length,
            pharmas: pharmas.length,
        }, null, 2));
        process.exit(1);
    }

    const dates = buildSpreadDates(EXTRA_COUNT, START_NO);
    let inserted = 0;
    let updated = 0;
    const rows = [];

    for (let i = 0; i < EXTRA_COUNT; i++) {
        const seq = START_NO + i;
        const n = pad3(seq);
        const docNo = `MOCK-BULK-TRK-${n}`;
        const customerCode = `MOCK-TRK-${n}`;
        const userId = users[PAIR_OFFSET + i].id_account;
        const pharmaId = pharmas[PAIR_OFFSET + i].id_pharma;
        const d = dates[i];
        const med = MEDICINES[i % MEDICINES.length];
        const price = (68 + (i * 37) % 380).toFixed(2);
        const trackingStatus = i % 4 === 0 ? 'active' : 'completed';
        const autoCreated = trackingStatus === 'active' ? 1 : 0;

        const [userRow] = await sql`
            SELECT firstname, lastname FROM account WHERE id_account = ${userId} LIMIT 1
        `;
        const [pharmaRow] = await sql`
            SELECT firstname_pharma, lastname_pharma, store_name
            FROM pharmacist_account WHERE id_pharma = ${pharmaId} LIMIT 1
        `;
        const patientName = `${userRow?.firstname || ''} ${userRow?.lastname || ''}`.trim();
        const doctor = `ภก. ${pharmaRow?.firstname_pharma || ''} ${pharmaRow?.lastname_pharma || ''}`.trim();
        const clinic = String(pharmaRow?.store_name || 'ร้านยา Telepharmacy').trim();

        const symptomName = pickSymptom32(seq - 1);

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
        }

        rows.push({
            doc_no: docNo,
            patient: patientName,
            pharmacist: doctor,
            clinic,
            medicine: med,
            symptom_name: symptomName,
            status: trackingStatus,
        });
    }

    const [{ n: totalMock }] = await sql`
        SELECT COUNT(*)::int AS n FROM prescriptions
        WHERE doc_no LIKE 'MOCK-BULK-TRK-%'
    `;

    console.log(JSON.stringify({
        status: 'success',
        message: `เพิ่มใบสรุปรายการยา mock ${EXTRA_COUNT} ใบ (ผู้ใช้+เภสัชคนละคน) · ใหม่ ${inserted} · อัปเดต ${updated}`,
        inserted,
        updated,
        total_mock_tracking: totalMock,
        range: `MOCK-BULK-TRK-${pad3(START_NO)} … MOCK-BULK-TRK-${pad3(START_NO + EXTRA_COUNT - 1)}`,
        samples: rows.slice(0, 5),
    }, null, 2));
} catch (err) {
    console.error(JSON.stringify({ status: 'error', message: err.message }, null, 2));
    process.exit(1);
} finally {
    await sql.end({ timeout: 3 });
}
