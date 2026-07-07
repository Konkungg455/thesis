/**
 * ลดใบสรุปรายการยาของเภสัชกรคนใดคนหนึ่งให้เหลือ N รายการ (เก็บล่าสุด)
 * ใช้: npm run db:trim-pharma-rx -- --pharma=1
 *      npm run db:trim-pharma-rx -- --pharma-name="สมชาย รักงาม" --keep=40
 */
import postgres from 'postgres';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_KEEP = 40;

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
    const out = { pharmaId: 0, pharmaName: '', keep: DEFAULT_KEEP };
    for (const arg of process.argv.slice(2)) {
        const idMatch = arg.match(/^--pharma=(\d+)$/);
        if (idMatch) out.pharmaId = Number(idMatch[1]);
        const nameMatch = arg.match(/^--pharma-name=(.+)$/);
        if (nameMatch) out.pharmaName = decodeURIComponent(nameMatch[1]).trim();
        const keepMatch = arg.match(/^--keep=(\d+)$/);
        if (keepMatch) out.keep = Math.max(1, Number(keepMatch[1]) || DEFAULT_KEEP);
    }
    return out;
}

loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
    console.error('ต้องมี DATABASE_URL ใน .env');
    process.exit(1);
}

const { pharmaId: argPharmaId, pharmaName, keep: KEEP } = parseArgs();
const sql = postgres(url, { ssl: 'require', prepare: false, connect_timeout: 20 });

try {
    let targetPharmaId = argPharmaId;
    let pharmacistLabel = '';

    if (!targetPharmaId && pharmaName) {
        const parts = pharmaName.split(/\s+/).filter(Boolean);
        const first = parts[0] || '';
        const last = parts.slice(1).join(' ') || parts[0] || '';
        const found = await sql`
            SELECT id_pharma, firstname_pharma, lastname_pharma
            FROM pharmacist_account
            WHERE firstname_pharma ILIKE ${'%' + first + '%'}
              AND lastname_pharma ILIKE ${'%' + last + '%'}
            ORDER BY id_pharma
            LIMIT 1
        `;
        if (!found[0]) throw new Error(`ไม่พบเภสัชกรชื่อ "${pharmaName}"`);
        targetPharmaId = Number(found[0].id_pharma);
        pharmacistLabel = `ภก. ${found[0].firstname_pharma || ''} ${found[0].lastname_pharma || ''}`.trim();
    } else if (targetPharmaId > 0) {
        const found = await sql`
            SELECT firstname_pharma, lastname_pharma
            FROM pharmacist_account WHERE id_pharma = ${targetPharmaId} LIMIT 1
        `;
        pharmacistLabel = found[0]
            ? `ภก. ${found[0].firstname_pharma || ''} ${found[0].lastname_pharma || ''}`.trim()
            : `เภสัช #${targetPharmaId}`;
    } else {
        throw new Error('ระบุ --pharma=ID หรือ --pharma-name="ชื่อ นามสกุล"');
    }

    const [{ n: before }] = await sql`
        SELECT COUNT(*)::int AS n FROM prescriptions WHERE id_pharma = ${targetPharmaId}
    `;

    const deleted = await sql`
        WITH ranked AS (
            SELECT id,
                   ROW_NUMBER() OVER (
                       ORDER BY COALESCE(auto_created, 0) ASC,
                                created_at DESC NULLS LAST,
                                id DESC
                   ) AS rn
            FROM prescriptions
            WHERE id_pharma = ${targetPharmaId}
        )
        DELETE FROM prescriptions p
        USING ranked r
        WHERE p.id = r.id AND r.rn > ${KEEP}
        RETURNING p.id, p.patient_name, p.prescription_date, p.created_at
    `;

    const [{ n: after }] = await sql`
        SELECT COUNT(*)::int AS n FROM prescriptions WHERE id_pharma = ${targetPharmaId}
    `;

    const [{ n: week7 }] = await sql`
        SELECT COUNT(*)::int AS n FROM prescriptions
        WHERE id_pharma = ${targetPharmaId}
          AND created_at >= NOW() - INTERVAL '7 days'
    `;

    const remaining = await sql`
        SELECT id, patient_name, prescription_date, created_at, tracking_status
        FROM prescriptions
        WHERE id_pharma = ${targetPharmaId}
        ORDER BY created_at DESC NULLS LAST, id DESC
        LIMIT 5
    `;

    console.log(JSON.stringify({
        status: 'success',
        message: `${pharmacistLabel}: ใบสรุปรายการยา ${before} → ${after} รายการ (ลบ ${deleted.length})`,
        pharmacist: pharmacistLabel,
        id_pharma: targetPharmaId,
        keep: KEEP,
        before,
        after,
        deleted_count: deleted.length,
        last_7_days: week7,
        sample_remaining: remaining,
    }, null, 2));
} catch (err) {
    console.error(JSON.stringify({ status: 'error', message: err.message }, null, 2));
    process.exit(1);
} finally {
    await sql.end({ timeout: 3 });
}
