/**
 * ตั้งรายการ /tracking ของเภสัชกร: 40 รายการ
 * - นนทพัทธ์ เผือกประพันธุ์ 1 รายการ active (กำลังติดตาม)
 * - อีก 39 รายการ completed + เขียนใบสั่งยาแล้ว
 *
 * ใช้: npm run db:setup-pharma-tracking -- --pharma-name="นายสมชาย รักงาม"
 */
import postgres from 'postgres';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const TRACKING_COUNT = 40;
const COMPLETED_COUNT = 39;
const ACTIVE_PATIENT = 'นนทพัทธ์ เผือกประพันธุ์';
const ACTIVE_ACCOUNT = 1;
const BLOCKED_PATIENT_PATTERN = '%อยากเทค%';
const BLOCKED_ACCOUNT = 2;

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
    const out = { pharmaId: 0, pharmaName: '' };
    for (const arg of process.argv.slice(2)) {
        const idMatch = arg.match(/^--pharma=(\d+)$/);
        if (idMatch) out.pharmaId = Number(idMatch[1]);
        const nameMatch = arg.match(/^--pharma-name=(.+)$/);
        if (nameMatch) out.pharmaName = decodeURIComponent(nameMatch[1]).trim();
    }
    return out;
}

loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
    console.error('ต้องมี DATABASE_URL ใน .env');
    process.exit(1);
}

const { pharmaId: argPharmaId, pharmaName } = parseArgs();
const sql = postgres(url, { ssl: 'require', prepare: false, connect_timeout: 20 });

try {
    let targetPharmaId = argPharmaId;
    let pharmacistLabel = '';
    let clinic = 'ร้านยา Telepharmacy';
    let doctor = '';

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
        targetPharmaId = Number(found[0].id_pharma);
        pharmacistLabel = `ภก. ${found[0].firstname_pharma || ''} ${found[0].lastname_pharma || ''}`.trim();
        clinic = String(found[0].store_name || clinic).trim();
        doctor = pharmacistLabel;
    } else if (targetPharmaId > 0) {
        const found = await sql`
            SELECT firstname_pharma, lastname_pharma, store_name
            FROM pharmacist_account WHERE id_pharma = ${targetPharmaId} LIMIT 1
        `;
        if (found[0]) {
            pharmacistLabel = `ภก. ${found[0].firstname_pharma || ''} ${found[0].lastname_pharma || ''}`.trim();
            clinic = String(found[0].store_name || clinic).trim();
            doctor = pharmacistLabel;
        }
    } else {
        throw new Error('ระบุ --pharma=ID หรือ --pharma-name="ชื่อ นามสกุล"');
    }

    const removedBlocked = await sql`
        DELETE FROM prescriptions
        WHERE id_pharma = ${targetPharmaId}
          AND (
              COALESCE(auto_created, 0) = 1
              OR patient_name ILIKE ${BLOCKED_PATIENT_PATTERN}
              OR id_account = ${BLOCKED_ACCOUNT}
              OR patient_name ILIKE '%นนทพัทธ์%'
              OR id_account = ${ACTIVE_ACCOUNT}
          )
        RETURNING id, patient_name
    `;

    const seedArgs = [
        'run', 'db:seed-pharma-history', '--',
        `--pharma=${targetPharmaId}`,
        `--count=${COMPLETED_COUNT}`,
    ];
    const seedResult = spawnSync('npm', seedArgs, { cwd: root, shell: true, encoding: 'utf8' });
    if (seedResult.status !== 0) {
        throw new Error(`seed-pharma-history failed: ${seedResult.stderr || seedResult.stdout}`);
    }

    await sql`
        DELETE FROM prescriptions
        WHERE id_pharma = ${targetPharmaId}
          AND COALESCE(auto_created, 0) = 1
    `;

    await sql`
        DELETE FROM prescriptions
        WHERE id_pharma = ${targetPharmaId}
          AND (
              patient_name ILIKE ${BLOCKED_PATIENT_PATTERN}
              OR id_account = ${BLOCKED_ACCOUNT}
          )
    `;

    await sql`
        UPDATE prescriptions
        SET tracking_status = 'completed',
            tracking_completed_at = COALESCE(tracking_completed_at, NOW()),
            auto_created = 0
        WHERE id_pharma = ${targetPharmaId}
          AND COALESCE(TRIM(med_details), '') <> ''
    `;

    const [activeRow] = await sql`
        INSERT INTO prescriptions (
            customer_code, id_account, id_pharma, clinic_name, clinic_website,
            patient_name, doctor_name, created_at, tracking_status, auto_created,
            last_followup_at
        ) VALUES (
            'TRK-0001',
            ${ACTIVE_ACCOUNT},
            ${targetPharmaId},
            ${clinic},
            'Telebot-pharmacy',
            ${ACTIVE_PATIENT},
            ${doctor},
            NOW() - INTERVAL '6 hours',
            'active',
            1,
            NOW()
        )
        RETURNING id, patient_name, tracking_status, auto_created
    `;

    const [{ n: total }] = await sql`
        SELECT COUNT(*)::int AS n FROM prescriptions WHERE id_pharma = ${targetPharmaId}
    `;
    const [{ n: trackingList }] = await sql`
        SELECT COUNT(*)::int AS n FROM prescriptions
        WHERE id_pharma = ${targetPharmaId}
          AND (
            (COALESCE(tracking_status, 'active') = 'active'
             AND (COALESCE(TRIM(med_details), '') <> '' OR COALESCE(auto_created, 0) = 1))
            OR (tracking_status = 'completed'
                AND COALESCE(TRIM(med_details), '') <> ''
                AND COALESCE(auto_created, 0) = 0)
          )
    `;
    const [{ n: activeN }] = await sql`
        SELECT COUNT(*)::int AS n FROM prescriptions
        WHERE id_pharma = ${targetPharmaId}
          AND COALESCE(tracking_status, 'active') = 'active'
          AND (COALESCE(TRIM(med_details), '') <> '' OR COALESCE(auto_created, 0) = 1)
    `;
    const [{ n: completedN }] = await sql`
        SELECT COUNT(*)::int AS n FROM prescriptions
        WHERE id_pharma = ${targetPharmaId}
          AND tracking_status = 'completed'
          AND COALESCE(TRIM(med_details), '') <> ''
          AND COALESCE(auto_created, 0) = 0
    `;

    const [{ n: nontapatOnTracking }] = await sql`
        SELECT COUNT(*)::int AS n FROM prescriptions
        WHERE id_pharma = ${targetPharmaId}
          AND (patient_name ILIKE '%นนทพัทธ์%' OR id_account = ${ACTIVE_ACCOUNT})
          AND (
            (COALESCE(tracking_status, 'active') = 'active'
             AND (COALESCE(TRIM(med_details), '') <> '' OR COALESCE(auto_created, 0) = 1))
            OR (tracking_status = 'completed'
                AND COALESCE(TRIM(med_details), '') <> ''
                AND COALESCE(auto_created, 0) = 0)
          )
    `;
    const [{ n: blockedOnTracking }] = await sql`
        SELECT COUNT(*)::int AS n FROM prescriptions
        WHERE id_pharma = ${targetPharmaId}
          AND (patient_name ILIKE ${BLOCKED_PATIENT_PATTERN} OR id_account = ${BLOCKED_ACCOUNT})
    `;

    console.log(JSON.stringify({
        status: 'success',
        message: `${pharmacistLabel}: /tracking แสดงได้ ${trackingList} รายการ (${activeN} กำลังติดตาม, ${completedN} เสร็จ+มีใบสั่งยา) · นนทพัทธ์ ${nontapatOnTracking} · ไม่มีอยากเทค`,
        pharmacist: pharmacistLabel,
        id_pharma: targetPharmaId,
        removed_blocked: removedBlocked.length,
        nontapat_on_tracking: nontapatOnTracking,
        blocked_patients_remaining: blockedOnTracking,
        total_prescriptions: total,
        tracking_list_count: trackingList,
        active_tracking: activeN,
        completed_with_rx: completedN,
        active_patient: activeRow,
    }, null, 2));
} catch (err) {
    console.error(JSON.stringify({ status: 'error', message: err.message }, null, 2));
    process.exit(1);
} finally {
    await sql.end({ timeout: 3 });
}
