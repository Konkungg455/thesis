/**
 * ใส่อาการจาก 32 อาการให้ mock prescriptions (MOCK-BULK-TRK-*)
 * ใช้: npm run db:seed-mock-prescription-symptoms
 */
import postgres from 'postgres';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickSymptom32, SYMPTOMS_32 } from './lib/symptoms32.mjs';
import { ensureMockPrescriptionSymptom } from './lib/mockPrescriptionSymptoms.mjs';

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

function parseDocIndex(docNo) {
    const m = String(docNo || '').match(/MOCK-BULK-TRK-(\d+)/i);
    return m ? Number(m[1]) - 1 : 0;
}

const sql = postgres(url, { ssl: 'require', prepare: false, connect_timeout: 30 });

try {
    const rows = await sql`
        SELECT id, doc_no, id_account, id_pharma, created_at
        FROM prescriptions
        WHERE doc_no LIKE 'MOCK-BULK-TRK-%'
          AND COALESCE(id_account, 0) > 0
          AND COALESCE(id_pharma, 0) > 0
        ORDER BY doc_no ASC
    `;

    if (!rows.length) {
        console.log(JSON.stringify({
            status: 'success',
            message: 'ไม่พบ mock prescriptions — รัน npm run db:seed-mock-bulk ก่อน',
            linked: 0,
        }, null, 2));
        process.exit(0);
    }

    const usedSymptoms = new Set();
    const samples = [];

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const symptomName = pickSymptom32(parseDocIndex(row.doc_no));
        usedSymptoms.add(symptomName);

        await ensureMockPrescriptionSymptom(sql, {
            prescriptionId: Number(row.id),
            userId: Number(row.id_account),
            pharmaId: Number(row.id_pharma),
            symptomName,
            createdAt: row.created_at,
            marker: row.doc_no,
        });

        if (samples.length < 8) {
            samples.push({ doc_no: row.doc_no, symptom_name: symptomName });
        }
    }

    console.log(JSON.stringify({
        status: 'success',
        message: `ผูกอาการ 32 อาการให้ mock prescriptions ${rows.length} ใบ · ครอบคลุม ${usedSymptoms.size}/${SYMPTOMS_32.length} อาการ`,
        linked: rows.length,
        unique_symptoms: usedSymptoms.size,
        symptoms_total: SYMPTOMS_32.length,
        samples,
    }, null, 2));
} catch (err) {
    console.error(JSON.stringify({ status: 'error', message: err.message }, null, 2));
    process.exit(1);
} finally {
    await sql.end({ timeout: 3 });
}
