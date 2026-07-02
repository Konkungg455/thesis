/**
 * ลดรายการติดตามอาการคนไข้ (tracking_status = active) ให้เหลือ N รายการ
 * ใช้: npm run db:trim-tracking
 *      npm run db:trim-tracking -- --pharma=1
 *      npm run db:trim-tracking -- --pharma-name="สมชาย รักงาม"
 *      npm run db:trim-tracking -- --pharma=1 --keep=1
 *      npm run db:trim-tracking -- --pharma-name="สมชาย รักงาม" --patient-name="นนทพัทธ์ เผือกประพันธุ์" --keep=1
 */
import postgres from 'postgres';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_KEEP = 1;

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
    const out = { pharmaId: 0, pharmaName: '', patientName: '', accountId: 0, keep: DEFAULT_KEEP };
    for (const arg of process.argv.slice(2)) {
        const idMatch = arg.match(/^--pharma=(\d+)$/);
        if (idMatch) out.pharmaId = Number(idMatch[1]);
        const nameMatch = arg.match(/^--pharma-name=(.+)$/);
        if (nameMatch) out.pharmaName = decodeURIComponent(nameMatch[1]).trim();
        const patientMatch = arg.match(/^--patient-name=(.+)$/);
        if (patientMatch) out.patientName = decodeURIComponent(patientMatch[1]).trim();
        const accountMatch = arg.match(/^--account=(\d+)$/);
        if (accountMatch) out.accountId = Number(accountMatch[1]);
        const keepMatch = arg.match(/^--keep=(\d+)$/);
        if (keepMatch) out.keep = Math.max(0, Number(keepMatch[1]) || DEFAULT_KEEP);
    }
    if (!out.pharmaId && process.env.TRIM_PHARMA_ID) {
        out.pharmaId = Number(process.env.TRIM_PHARMA_ID) || 0;
    }
    return out;
}

loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
    console.error('ต้องมี DATABASE_URL ใน .env');
    process.exit(1);
}

const { pharmaId: argPharmaId, pharmaName, patientName, accountId: argAccountId, keep: KEEP } = parseArgs();
const sql = postgres(url, { ssl: 'require', prepare: false, connect_timeout: 20 });

/** เงื่อนไขเดียวกับหน้า /tracking */
const trackableBase = sql`
    COALESCE(tracking_status, 'active') = 'active'
    AND (
        COALESCE(TRIM(med_details), '') <> ''
        OR COALESCE(auto_created, 0) = 1
    )
`;

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
        if (!found[0]) {
            throw new Error(`ไม่พบเภสัชกรชื่อ "${pharmaName}"`);
        }
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
    }

    const scopeFilter = targetPharmaId > 0
        ? sql`AND id_pharma = ${targetPharmaId}`
        : sql``;

    let targetAccountId = argAccountId;
    let patientLabel = patientName;
    if (!targetAccountId && patientName) {
        const parts = patientName.split(/\s+/).filter(Boolean);
        const first = parts[0] || '';
        const last = parts.slice(1).join(' ') || '';
        const foundPatient = await sql`
            SELECT id_account, firstname, lastname
            FROM account
            WHERE firstname ILIKE ${'%' + first + '%'}
              AND (${last === ''} OR lastname ILIKE ${'%' + last + '%'})
            ORDER BY id_account
            LIMIT 1
        `;
        if (foundPatient[0]) {
            targetAccountId = Number(foundPatient[0].id_account);
            patientLabel = `${foundPatient[0].firstname || ''} ${foundPatient[0].lastname || ''}`.trim() || patientName;
        }
    } else if (targetAccountId > 0 && !patientLabel) {
        const foundPatient = await sql`
            SELECT firstname, lastname FROM account WHERE id_account = ${targetAccountId} LIMIT 1
        `;
        if (foundPatient[0]) {
            patientLabel = `${foundPatient[0].firstname || ''} ${foundPatient[0].lastname || ''}`.trim();
        }
    }

    const patientScopeFilter = (targetAccountId > 0 || patientName)
        ? sql`AND (
            ${targetAccountId > 0 ? sql`id_account = ${targetAccountId}` : sql`FALSE`}
            ${targetAccountId > 0 && patientName ? sql` OR ` : sql``}
            ${patientName ? sql`patient_name ILIKE ${'%' + (patientName.split(/\s+/)[0] || patientName) + '%'}` : sql`FALSE`}
        )`
        : sql``;

    const [{ n: before }] = await sql`
        SELECT COUNT(*)::int AS n FROM prescriptions
        WHERE ${trackableBase}
        ${scopeFilter}
    `;

    let completed = [];
    if (targetPharmaId > 0) {
        completed = await sql`
            UPDATE prescriptions
            SET tracking_status = 'completed',
                tracking_completed_at = COALESCE(tracking_completed_at, NOW())
            WHERE id_pharma = ${targetPharmaId}
              AND COALESCE(tracking_status, 'active') = 'active'
              AND (
                  COALESCE(TRIM(med_details), '') <> ''
                  OR COALESCE(auto_created, 0) = 1
              )
            RETURNING id, patient_name, id_pharma, id_account
        `;
    } else {
        completed = await sql`
            WITH ranked AS (
                SELECT id,
                       patient_name,
                       id_pharma,
                       id_account,
                       ROW_NUMBER() OVER (
                           ORDER BY COALESCE(last_followup_at, created_at) DESC NULLS LAST, id DESC
                       ) AS rn
                FROM prescriptions
                WHERE ${trackableBase}
                ${scopeFilter}
            )
            UPDATE prescriptions p
            SET tracking_status = 'completed',
                tracking_completed_at = COALESCE(tracking_completed_at, NOW())
            FROM ranked r
            WHERE p.id = r.id
              AND r.rn > ${KEEP}
            RETURNING p.id, p.patient_name, p.id_pharma, p.id_account
        `;
    }

    const [{ n: after }] = await sql`
        SELECT COUNT(*)::int AS n FROM prescriptions
        WHERE ${trackableBase}
        ${scopeFilter}
    `;

    let activated = [];
    if (KEEP > 0 && targetPharmaId > 0) {
        activated = await sql`
            WITH candidates AS (
                SELECT id
                FROM prescriptions
                WHERE id_pharma = ${targetPharmaId}
                  AND (
                    ${patientName || targetAccountId > 0
        ? sql`(
            ${targetAccountId > 0 ? sql`id_account = ${targetAccountId}` : sql`FALSE`}
            ${targetAccountId > 0 && patientName ? sql` OR ` : sql``}
            ${patientName ? sql`patient_name ILIKE ${'%' + (patientName.split(/\s+/).filter(Boolean)[0] || patientName) + '%'}` : sql`FALSE`}
        )`
        : sql`COALESCE(TRIM(med_details), '') <> ''`}
                  )
                ORDER BY
                    CASE WHEN COALESCE(tracking_status, 'active') = 'active' THEN 0 ELSE 1 END,
                    CASE WHEN COALESCE(TRIM(med_details), '') <> '' THEN 0 ELSE 1 END,
                    created_at DESC NULLS LAST,
                    id DESC
                LIMIT ${KEEP}
            )
            UPDATE prescriptions p
            SET tracking_status = 'active',
                tracking_completed_at = NULL,
                auto_created = CASE
                    WHEN COALESCE(TRIM(p.med_details), '') <> '' THEN 0
                    ELSE COALESCE(p.auto_created, 1)
                END,
                patient_name = COALESCE(
                    NULLIF(TRIM(p.patient_name), ''),
                    ${patientLabel || 'ผู้ป่วย'}
                ),
                id_account = CASE
                    WHEN ${targetAccountId > 0} THEN COALESCE(NULLIF(p.id_account, 0), ${targetAccountId})
                    ELSE p.id_account
                END,
                last_followup_at = COALESCE(p.last_followup_at, NOW()),
                created_at = GREATEST(
                    COALESCE(p.created_at, NOW()),
                    NOW() - INTERVAL '1 day'
                )
            FROM candidates c
            WHERE p.id = c.id
            RETURNING p.id, p.patient_name, p.id_pharma, p.id_account, p.created_at, p.auto_created
        `;
    } else if (KEEP > 0 && after < KEEP) {
        const need = KEEP - after;
        activated = await sql`
            WITH candidates AS (
                SELECT id
                FROM prescriptions
                WHERE COALESCE(TRIM(med_details), '') <> ''
                ORDER BY created_at DESC NULLS LAST, id DESC
                LIMIT ${need}
            )
            UPDATE prescriptions p
            SET tracking_status = 'active',
                tracking_completed_at = NULL,
                auto_created = 0,
                last_followup_at = COALESCE(p.last_followup_at, NOW()),
                created_at = GREATEST(
                    COALESCE(p.created_at, NOW()),
                    NOW() - INTERVAL '1 day'
                )
            FROM candidates c
            WHERE p.id = c.id
            RETURNING p.id, p.patient_name, p.id_pharma, p.id_account, p.created_at
        `;
    }

    const [{ n: finalActive }] = await sql`
        SELECT COUNT(*)::int AS n FROM prescriptions
        WHERE ${trackableBase}
        ${scopeFilter}
    `;

    let finalTrimmed = [];
    if (targetPharmaId > 0 && KEEP >= 0 && finalActive > KEEP) {
        finalTrimmed = await sql`
            WITH ranked AS (
                SELECT id,
                       ROW_NUMBER() OVER (
                           ORDER BY
                               ${patientName || targetAccountId > 0
        ? sql`CASE WHEN (
            ${targetAccountId > 0 ? sql`id_account = ${targetAccountId}` : sql`FALSE`}
            ${targetAccountId > 0 && patientName ? sql` OR ` : sql``}
            ${patientName ? sql`patient_name ILIKE ${'%' + (patientName.split(/\s+/).filter(Boolean)[0] || patientName) + '%'}` : sql`FALSE`}
        ) THEN 0 ELSE 1 END,`
        : sql``}
                               COALESCE(last_followup_at, created_at) DESC NULLS LAST,
                               id DESC
                       ) AS rn
                FROM prescriptions
                WHERE ${trackableBase}
                  AND id_pharma = ${targetPharmaId}
            )
            UPDATE prescriptions p
            SET tracking_status = 'completed',
                tracking_completed_at = COALESCE(tracking_completed_at, NOW())
            FROM ranked r
            WHERE p.id = r.id
              AND r.rn > ${KEEP}
            RETURNING p.id, p.patient_name
        `;
    }

    const [{ n: activeAfterFinalTrim }] = await sql`
        SELECT COUNT(*)::int AS n FROM prescriptions
        WHERE ${trackableBase}
        ${scopeFilter}
    `;

    const remaining = await sql`
        SELECT id, patient_name, id_pharma, id_account,
               tracking_status, last_followup_at, created_at
        FROM prescriptions
        WHERE ${trackableBase}
        ${scopeFilter}
        ORDER BY COALESCE(last_followup_at, created_at) DESC NULLS LAST, id DESC
    `;

    const scopeText = targetPharmaId > 0
        ? (pharmacistLabel || `เภสัช #${targetPharmaId}`)
        : 'ทั้งระบบ';

    console.log(JSON.stringify({
        status: 'success',
        message: `ติดตามอาการ active (${scopeText}): ${before} → ${activeAfterFinalTrim} รายการ (ปิด ${completed.length}, เปิดใหม่ ${activated.length}, ตัดซ้ำ ${finalTrimmed.length})`,
        scope: scopeText,
        id_pharma: targetPharmaId || null,
        patient: patientLabel || null,
        id_account: targetAccountId || null,
        keep: KEEP,
        active_before: before,
        active_after: activeAfterFinalTrim,
        completed: completed.map((r) => ({
            id: r.id,
            patient: r.patient_name,
            id_pharma: r.id_pharma,
            id_account: r.id_account,
        })),
        activated: activated.map((r) => ({
            id: r.id,
            patient: r.patient_name,
            created_at: r.created_at,
        })),
        remaining,
    }, null, 2));
} catch (err) {
    console.error(JSON.stringify({ status: 'error', message: err.message }, null, 2));
    process.exit(1);
} finally {
    await sql.end({ timeout: 3 });
}
