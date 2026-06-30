import type { H3Event } from 'h3';
import { getAuthContext } from './sessionContext';
import { readMultipartRequest } from './formData';

const TRACKING_PLACEHOLDER_MED = 'รอเภสัชกรบันทึกรายการยา — อยู่ในกรอบติดตามอาการ 3 วัน';

let trackingSchemaReady = false;

async function ensureTrackingColumns(sql: ReturnType<typeof useDb>) {
    if (trackingSchemaReady) return;
    trackingSchemaReady = true;
    const alters = [
        `ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS tracking_status VARCHAR(32) NULL`,
        `ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS tracking_completed_at TIMESTAMPTZ NULL`,
        `ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS last_followup_at TIMESTAMPTZ NULL`,
        `ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS auto_created SMALLINT NOT NULL DEFAULT 0`,
        `ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS id_consult_request INT NULL`,
    ];
    for (const stmt of alters) {
        try {
            await sql.unsafe(stmt);
        } catch {
            /* column may already exist with compatible type */
        }
    }
}

function invalidateConsultCaches(idPharma: number, idAccount: number) {
    clearBffCachePrefix(`active-consult:${idPharma}:${idAccount}`);
    clearBffCache(`list-my-patients:${idPharma}`);
}

/** เริ่มกรอบติดตามอาการ 3 วันใน Supabase หลังจบรอบให้คำปรึกษา */
export async function ensureConsultTrackingRecord(
    sql: ReturnType<typeof useDb>,
    idPharma: number,
    idAccount: number,
    consultId: number,
): Promise<number> {
    if (idPharma <= 0 || idAccount <= 0 || consultId <= 0) return 0;

    await ensureTrackingColumns(sql);

    const existing = await sql`
        SELECT id, tracking_status, med_details
        FROM prescriptions
        WHERE id_account = ${idAccount}
          AND id_pharma = ${idPharma}
          AND id_consult_request = ${consultId}
        ORDER BY id DESC
        LIMIT 1
    `;

    if (existing[0]) {
        const rxId = Number(existing[0].id);
        if (String(existing[0].tracking_status || '') !== 'completed') {
            await sql`
                UPDATE prescriptions SET
                    tracking_status = 'active',
                    last_followup_at = COALESCE(last_followup_at, NOW()),
                    med_details = CASE
                        WHEN COALESCE(med_details, '') = '' THEN ${TRACKING_PLACEHOLDER_MED}
                        ELSE med_details
                    END,
                    auto_created = CASE
                        WHEN COALESCE(med_details, '') = '' THEN 1
                        ELSE auto_created
                    END
                WHERE id = ${rxId}
            `;
        }
        invalidateConsultCaches(idPharma, idAccount);
        return rxId;
    }

    const accRows = await sql`
        SELECT firstname, lastname, username_account
        FROM account
        WHERE id_account = ${idAccount}
        LIMIT 1
    `;
    const acc = accRows[0];
    let patientName = `${acc?.firstname || ''} ${acc?.lastname || ''}`.trim();
    if (!patientName) {
        patientName = String(acc?.username_account || '').trim() || `ผู้ป่วย #${idAccount}`;
    }

    const phRows = await sql`
        SELECT firstname_pharma, lastname_pharma
        FROM pharmacist_account
        WHERE id_pharma = ${idPharma}
        LIMIT 1
    `;
    const ph = phRows[0];
    const phName = `${ph?.firstname_pharma || ''} ${ph?.lastname_pharma || ''}`.trim();
    const doctorName = phName ? `ภก. ${phName}` : null;
    const customerCode = `CT-${String(idAccount).padStart(7, '0')}`;

    const inserted = await sql`
        INSERT INTO prescriptions (
            customer_code, id_account, id_pharma, id_consult_request,
            patient_name, doctor_name, med_details,
            tracking_status, auto_created, last_followup_at, created_at
        ) VALUES (
            ${customerCode}, ${idAccount}, ${idPharma}, ${consultId},
            ${patientName}, ${doctorName},
            ${TRACKING_PLACEHOLDER_MED},
            'active', 1, NOW(), NOW()
        )
        RETURNING id
    `;

    const rxId = Number(inserted[0]?.id || 0);
    invalidateConsultCaches(idPharma, idAccount);
    return rxId;
}

/** สร้างใบติดตามที่หายไปเมื่อ consult จบแล้วแต่ไม่มี prescriptions (เช่น ถูก auto-complete ตอนขอ consult ใหม่) */
export async function repairMissingTrackingForPharmacist(
    sql: ReturnType<typeof useDb>,
    idPharma: number,
    limit = 20,
): Promise<number> {
    if (idPharma <= 0) return 0;

    await ensureTrackingColumns(sql);

    const missing = await sql`
        SELECT cr.id AS consult_id, cr.id_account
        FROM consult_requests cr
        LEFT JOIN prescriptions p
          ON p.id_consult_request = cr.id AND p.id_pharma = cr.id_pharma
        WHERE cr.id_pharma = ${idPharma}
          AND cr.status = 'completed'
          AND COALESCE(cr.is_deleted, 0) = 0
          AND p.id IS NULL
          AND cr.created_at > NOW() - INTERVAL '60 days'
        ORDER BY cr.id DESC
        LIMIT ${limit}
    `;

    let repaired = 0;
    for (const row of missing) {
        const rxId = await ensureConsultTrackingRecord(
            sql,
            idPharma,
            Number(row.id_account),
            Number(row.consult_id),
        );
        if (rxId > 0) repaired += 1;
    }
    return repaired;
}

export async function handleCompleteTracking(event: H3Event) {
    const auth = getAuthContext(event);
    const pId = auth.id_pharma || 0;
    if (pId <= 0) {
        return { status: 'error', message: 'ต้องเข้าสู่ระบบเภสัชกร' };
    }

    const query = getQuery(event);
    const action = String(query.action || '').trim();
    const { fields } = await readMultipartRequest(event);
    const rxId = Number(fields.id || 0);

    if (rxId <= 0) {
        return { status: 'error', message: 'ไม่พบรหัสใบสั่งยา' };
    }

    const result = await dbQuery(async (sql) => {
        await ensureTrackingColumns(sql);

        const rows = await sql`
            SELECT id, id_account, id_pharma
            FROM prescriptions
            WHERE id = ${rxId} AND id_pharma = ${pId}
            LIMIT 1
        `;
        if (!rows[0]) {
            return { error: 'ไม่พบข้อมูลหรือไม่มีสิทธิ์' };
        }

        const uId = Number(rows[0].id_account || 0);

        if (action === 'reopen') {
            await sql`
                UPDATE prescriptions SET
                    tracking_status = 'active',
                    tracking_completed_at = NULL,
                    last_followup_at = NOW()
                WHERE id = ${rxId}
            `;
            invalidateConsultCaches(pId, uId);
            return { ok: true, reopened: true };
        }

        const updated = await sql`
            UPDATE prescriptions SET
                tracking_status = 'completed',
                tracking_completed_at = NOW()
            WHERE id = ${rxId}
            RETURNING tracking_completed_at
        `;
        invalidateConsultCaches(pId, uId);
        return {
            ok: true,
            completed_at: updated[0]?.tracking_completed_at || new Date().toISOString(),
        };
    });

    if (!result) {
        return { status: 'error', message: 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้' };
    }
    if ('error' in result) {
        return { status: 'error', message: result.error };
    }

    if (result.reopened) {
        return { status: 'success', message: 'เปิดติดตามอีกครั้งแล้ว' };
    }

    return {
        status: 'success',
        message: 'บันทึกเสร็จสิ้นการติดตามแล้ว',
        completed_at: result.completed_at,
    };
}
