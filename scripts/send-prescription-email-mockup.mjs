/**
 * ส่งอีเมล mockup ใบสรุปรายการยา (PDF + QR ถ้ามี)
 * ใช้: node scripts/send-prescription-email-mockup.mjs [email] [prescriptionId]
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const envPath = join(root, '.env');
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
}

const to = process.argv[2] || 'konkon488@gmail.com';
const rxIdArg = Number(process.argv[3] || 0);

const MOCK_MED_DETAILS = [
    'ยาลดกรด อะลูมินา-แมกนีเซีย ชนิดเม็ด',
    'ยาลดกรด อะลูมินา-แมกนีเซีย ชนิดน้ำ',
    'ยาเม็ดแก้ท้องอืด ท้องเฟ้อ โซดามินท์',
].join('\n');

const MOCK_MED_QTY = [
    '1|เม็ด',
    '2|ขวด',
    '3|เม็ด',
].join('\n');

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false });
const jiti = createJiti(import.meta.url, {
    interopDefault: true,
    alias: {
        '#shared/utils/prescriptionMed': join(root, 'shared/utils/prescriptionMed.ts'),
        '~/utils/mediaStorage': join(root, 'app/utils/mediaStorage.ts'),
    },
});
const { sendPrescriptionEmailInternal } = jiti('../server/utils/prescription/email.ts');

let rxId = rxIdArg;
if (!rxId) {
    const rows = await sql`
        SELECT id, doc_no, patient_name, med_details
        FROM prescriptions
        WHERE COALESCE(TRIM(med_details), '') <> ''
          AND COALESCE(auto_created, 0) = 0
        ORDER BY id DESC
        LIMIT 1
    `;
    rxId = Number(rows[0]?.id || 0);
    if (rows[0]) {
        console.log(`Using prescription id=${rxId} doc_no=${rows[0].doc_no} patient=${rows[0].patient_name}`);
    }
}

if (!rxId) {
    console.error('No prescription id found');
    await sql.end();
    process.exit(1);
}

await sql`
    UPDATE prescriptions
    SET med_details = ${MOCK_MED_DETAILS},
        med_qty = ${MOCK_MED_QTY}
    WHERE id = ${rxId}
`;
console.log('Applied mock medication list for email preview');

console.log(`Sending ใบสรุปรายการยา mockup email to: ${to}`);
const res = await sendPrescriptionEmailInternal(sql, rxId, to);
console.log(JSON.stringify(res, null, 2));
await sql.end();
process.exit(res.ok ? 0 : 1);
