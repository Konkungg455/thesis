import type { H3Event } from 'h3';
import { getAuthContext } from './sessionContext';
import { readMultipartRequest } from './formData';
import { archiveAndClearChatBetween } from './consultArchives';
import { isConsultNotifyWorthy } from './storeNotifications';
import { ensureConsultTrackingRecord } from './consultTracking';
import { syncServiceUsageForConsult } from './serviceUsage';

let appointmentSchemaReady = false;

async function ensureAppointmentColumns(sql: ReturnType<typeof useDb>) {
    if (appointmentSchemaReady) return;
    appointmentSchemaReady = true;
    const alters = [
        `ALTER TABLE consult_requests ADD COLUMN IF NOT EXISTS appointment_date DATE NULL`,
        `ALTER TABLE consult_requests ADD COLUMN IF NOT EXISTS appointment_time VARCHAR(64) NULL`,
    ];
    for (const stmt of alters) {
        try {
            await sql.unsafe(stmt);
        } catch {
            /* column may already exist */
        }
    }
}

async function resolveServiceCode(
    sql: ReturnType<typeof useDb>,
    consultId: number,
): Promise<string> {
    if (consultId <= 0) return '';
    const rows = await sql`
        SELECT service_code FROM service_usage
        WHERE id_consult_request = ${consultId}
        LIMIT 1
    `;
    const code = String(rows[0]?.service_code || '').trim();
    if (code) return code;
    return `SRV-${String(consultId).padStart(3, '0')}`;
}

async function enrichUserConsultStatus(
    sql: ReturnType<typeof useDb>,
    data: Record<string, unknown>,
    uId: number,
    reqCid: number,
): Promise<Record<string, unknown>> {
    const targetPId = Number(data.id_pharma || 0);
    const reqId = Number(data.id || 0);

    const pharmaRows = targetPId > 0
        ? await sql`
            SELECT firstname_pharma, lastname_pharma, username_pharma
            FROM pharmacist_account
            WHERE id_pharma = ${targetPId}
            LIMIT 1
        `
        : [];
    const prow = pharmaRows[0];
    let pharmaName = 'เภสัชกร';
    if (prow) {
        const first = String(prow.firstname_pharma || '').trim();
        pharmaName = first || String(prow.username_pharma || '').trim() || pharmaName;
    }
    data.pharma_name = pharmaName;
    data.pharma_fullname = pharmaName;

    data.last_followup_at = null;
    if (targetPId > 0) {
        const fq = await sql`
            SELECT MAX(last_followup_at) AS lf
            FROM prescriptions
            WHERE id_account = ${uId} AND id_pharma = ${targetPId}
        `;
        data.last_followup_at = fq[0]?.lf || null;
    }

    data.tracking_active = 0;
    data.tracking_base = null;
    data.tracking_status = '';
    data.tracking_ended = 0;

    const rxConsultId = reqCid > 0 ? reqCid : reqId;
    if (targetPId > 0) {
        let presRows;
        if (rxConsultId > 0) {
            presRows = await sql`
                SELECT tracking_status, last_followup_at, created_at
                FROM prescriptions
                WHERE id_account = ${uId} AND id_consult_request = ${rxConsultId}
                ORDER BY id DESC
                LIMIT 1
            `;
        } else {
            presRows = await sql`
                SELECT tracking_status, last_followup_at, created_at
                FROM prescriptions
                WHERE id_account = ${uId} AND id_pharma = ${targetPId}
                ORDER BY id DESC
                LIMIT 1
            `;
        }

        // สร้างใบสรุปรายการยา auto เฉพาะเมื่อจบ consult แล้วยังไม่มี (ไม่ INSERT ทุก poll)
        if (!presRows[0] && String(data.status || '') === 'completed' && rxConsultId > 0) {
            await ensureConsultTrackingRecord(sql, targetPId, uId, rxConsultId);
            presRows = await sql`
                SELECT tracking_status, last_followup_at, created_at
                FROM prescriptions
                WHERE id_account = ${uId} AND id_consult_request = ${rxConsultId}
                ORDER BY id DESC
                LIMIT 1
            `;
        }

        if (presRows[0]) {
            const pr = presRows[0];
            const base = pr.last_followup_at || pr.created_at || null;
            data.tracking_base = base;
            data.tracking_status = String(pr.tracking_status || '');
            const within = base
                ? Date.now() < new Date(String(base)).getTime() + 3 * 24 * 60 * 60 * 1000
                : false;
            data.tracking_active = within ? 1 : 0;
            // สิ้นสุดการติดตามในแชท = ครบ 3 วันเท่านั้น
            data.tracking_ended = !within && !!base ? 1 : 0;
        }
    }

    data.service_code = '';
    if (reqId > 0) {
        data.service_code = await resolveServiceCode(sql, reqId);
    }

    data.reviewed = 0;
    if (reqId > 0) {
        const rv = await sql`
            SELECT 1 FROM reviews
            WHERE user_id = ${uId} AND id_consult_request = ${reqId}
            LIMIT 1
        `;
        if (rv[0]) data.reviewed = 1;
    }

    data.has_any_review = 0;
    const anyReview = await sql`
        SELECT 1 FROM reviews WHERE user_id = ${uId} LIMIT 1
    `;
    if (anyReview[0]) data.has_any_review = 1;

    return data;
}

export async function handleCheckUserStatus(event: H3Event) {
    const query = getQuery(event);
    const auth = getAuthContext(event);
    const uId = Number(query.u_id || auth.id_account || 0);

    if (uId <= 0) {
        return { status: 'none', reason: 'Invalid ID' };
    }

    const selCid = Number(query.consult_id || 0);

    const cacheKey = `consult:status:user:${uId}:${selCid}`;
    const cached = getBffCache(cacheKey);
    if (cached) return cached;

    const stale = getBffCacheStale(cacheKey);

    const result = await dbQuery(async (sql) => {
        let rows;
        if (selCid > 0) {
            rows = await sql`
                SELECT * FROM consult_requests
                WHERE id_account = ${uId}
                  AND id = ${selCid}
                  AND COALESCE(is_deleted, 0) = 0
                LIMIT 1
            `;
        }
        if (!rows?.[0]) {
            rows = await sql`
                SELECT * FROM consult_requests
                WHERE id_account = ${uId}
                  AND COALESCE(is_deleted, 0) = 0
                ORDER BY id DESC
                LIMIT 1
            `;
        }
        if (!rows?.[0]) return null;
        const data = await enrichUserConsultStatus(
            sql,
            { ...rows[0] } as Record<string, unknown>,
            uId,
            selCid,
        );
        if (!isConsultNotifyWorthy(data)) return null;
        return data;
    });

    const payload = result || { status: 'none' };
    if (result) {
        setBffCache(cacheKey, payload, 5_000);
    } else if (stale) {
        return stale;
    }
    return payload;
}

/** เติม bot_session_id / จำนวนข้อความ AI / อาการ สำหรับคำขอปรึกษา */
export async function enrichConsultBotMeta(
    sql: ReturnType<typeof useDb>,
    uId: number,
    data: Record<string, unknown>,
    consultIdHint = 0,
): Promise<void> {
    if (uId <= 0) {
        data.symptom_name = '';
        data.bot_message_count = 0;
        return;
    }

    data.symptom_name = data.symptom_name ? String(data.symptom_name) : '';
    data.bot_message_count = 0;

    let reqSession = String(data.bot_session_id || '').trim();
    const consultId = Number(consultIdHint || data.id || 0);
    if (!reqSession && consultId > 0) {
        const reqRow = await sql`
            SELECT bot_session_id FROM consult_requests
            WHERE id = ${consultId} AND id_account = ${uId}
            LIMIT 1
        `;
        reqSession = String(reqRow[0]?.bot_session_id || '').trim();
        if (reqSession) data.bot_session_id = reqSession;
    }

    if (reqSession) {
        const sq = await sql`
            SELECT symptom_name, COUNT(*)::int AS cnt
            FROM chat_history
            WHERE id_account = ${uId}
              AND session_id = ${reqSession}
              AND COALESCE(is_deleted, 0) = 0
            GROUP BY symptom_name
            ORDER BY COUNT(*) DESC
            LIMIT 1
        `;
        if (sq[0]) {
            data.bot_message_count = Number(sq[0].cnt || 0);
            data.symptom_name = String(sq[0].symptom_name || data.symptom_name || '');
        } else {
            data.bot_message_count = 0;
            data.symptom_name = '';
        }
    } else {
        const sq = await sql`
            SELECT session_id, symptom_name, COUNT(*)::int AS cnt, MAX(created_at) AS last_at
            FROM chat_history
            WHERE id_account = ${uId}
              AND COALESCE(is_deleted, 0) = 0
            GROUP BY session_id, symptom_name
            ORDER BY last_at DESC
            LIMIT 1
        `;
        if (sq[0]) {
            data.bot_session_id = String(sq[0].session_id || '');
            data.bot_message_count = Number(sq[0].cnt || 0);
            data.symptom_name = String(sq[0].symptom_name || data.symptom_name || '');
        }
    }
}

export async function handleCheckPharmaRequest(event: H3Event) {
    const auth = getAuthContext(event);
    const pId = auth.id_pharma || 0;

    if (pId <= 0) {
        return { status: 'none', reason: 'Unauthorized' };
    }

    const result = await dbQuery(async (sql) => {
        const rows = await sql`
            SELECT r.*, a.firstname, a.lastname
            FROM consult_requests r
            LEFT JOIN account a ON r.id_account = a.id_account
            WHERE r.id_pharma = ${pId}
              AND r.status = 'waiting'
              AND COALESCE(r.is_deleted, 0) = 0
            ORDER BY r.id ASC
            LIMIT 1
        `;
        if (!rows[0]) return null;

        const data = { ...rows[0] } as Record<string, unknown>;
        const first = String(data.firstname || '').trim();
        const last = String(data.lastname || '').trim();
        const fullName = `${first} ${last}`.trim();
        data.customer_name = fullName || 'คนไข้';
        delete data.firstname;
        delete data.lastname;

        const uId = Number(data.id_account || 0);
        await enrichConsultBotMeta(sql, uId, data);
        if (!String(data.symptom_name || '').trim()) {
            data.symptom_name = 'ทั่วไป';
        }

        return data;
    });

    return result || { status: 'none' };
}

export async function handleCreateConsultRequest(event: H3Event) {
    const { fields } = await readMultipartRequest(event);
    const auth = getAuthContext(event, fields);
    const uId = auth.id_account || Number(fields.u_id || 0);
    const pId = Number(fields.id_pharma || 0);

    if (uId <= 0 || pId <= 0) {
        return { status: 'error', message: 'Missing data' };
    }

    const privilege = ['normal', 'gold_card'].includes(fields.privilege || '')
        ? fields.privilege
        : 'normal';
    const method = fields.consult_method || 'chat';
    const bookingType = fields.booking_type || 'now';
    const deliveryPrepaid = fields.delivery_prepaid === '1' || fields.delivery_prepaid === 'true' ? 1 : 0;
    const botSessionId = String(fields.bot_session_id || '').trim() || null;
    const appointmentDate = bookingType === 'appointment'
        ? (String(fields.appointment_date || fields.date || '').trim() || null)
        : null;
    const appointmentTime = bookingType === 'appointment'
        ? (String(fields.appointment_time || fields.time || '').trim() || null)
        : null;

    const ok = await dbQuery(async (sql) => {
        await ensureAppointmentColumns(sql);
        const cancelledWaiting = await sql`
            UPDATE consult_requests
            SET status = 'cancelled',
                is_deleted = 1,
                deleted_at = NOW(),
                deleted_by = ${uId},
                deleted_by_role = 'user'
            WHERE id_account = ${uId} AND status = 'waiting'
            RETURNING id
        `;
        for (const row of cancelledWaiting) {
            await syncServiceUsageForConsult(sql, Number(row.id || 0));
        }

        const closingRows = await sql`
            SELECT id FROM consult_requests
            WHERE id_account = ${uId}
              AND id_pharma = ${pId}
              AND status = 'accepted'
              AND COALESCE(is_deleted, 0) = 0
            ORDER BY id DESC
            LIMIT 1
        `;
        const closingConsultId = Number(closingRows[0]?.id || 0);

        await sql`
            UPDATE consult_requests
            SET status = 'completed'
            WHERE id_account = ${uId}
              AND id_pharma = ${pId}
              AND status = 'accepted'
        `;
        const arch = await archiveAndClearChatBetween(sql, pId, uId);
        const consultId = closingConsultId || Number(arch.consultId || 0);
        if (consultId > 0) {
            await syncServiceUsageForConsult(sql, consultId);
            await ensureConsultTrackingRecord(sql, pId, uId, consultId);
        }

        const inserted = await sql`
            INSERT INTO consult_requests (
                id_account, id_pharma, status, created_at,
                privilege, consult_method, booking_type, delivery_prepaid, bot_session_id,
                appointment_date, appointment_time
            ) VALUES (
                ${uId}, ${pId}, 'waiting', NOW(),
                ${privilege}, ${method}, ${bookingType}, ${deliveryPrepaid}, ${botSessionId},
                ${appointmentDate}, ${appointmentTime}
            )
            RETURNING id
        `;
        const newConsultId = Number(inserted[0]?.id || 0);
        if (newConsultId > 0) {
            await syncServiceUsageForConsult(sql, newConsultId);
        }
        return true;
    });

    return ok
        ? {
            status: 'success',
            consult_method: method,
            booking_type: bookingType,
            appointment_date: appointmentDate,
            appointment_time: appointmentTime,
        }
        : { status: 'error', message: 'ไม่สามารถบันทึกคำขอได้' };
}

export async function handleUpdateConsultStatus(event: H3Event) {
    const { fields } = await readMultipartRequest(event);
    const reqId = Number(fields.request_id || 0);
    const status = String(fields.status || '').trim();

    if (reqId <= 0 || !status) {
        return { status: 'error', message: 'Invalid parameters' };
    }

    const ok = await dbQuery(async (sql) => {
        const pairRows = await sql`
            SELECT id_account, id_pharma FROM consult_requests
            WHERE id = ${reqId}
            LIMIT 1
        `;
        const pair = pairRows[0];
        if (!pair) return false;

        await sql`
            UPDATE consult_requests
            SET status = ${status}
            WHERE id = ${reqId}
        `;

        if (status === 'completed') {
            await archiveAndClearChatBetween(
                sql,
                Number(pair.id_pharma),
                Number(pair.id_account),
            );
            const consultId = reqId;
            if (consultId > 0) {
                await syncServiceUsageForConsult(sql, consultId);
                await ensureConsultTrackingRecord(
                    sql,
                    Number(pair.id_pharma),
                    Number(pair.id_account),
                    consultId,
                );
            }
        } else {
            await syncServiceUsageForConsult(sql, reqId);
        }

        return true;
    });

    return ok ? { status: 'success' } : { status: 'error' };
}

export async function handleCancelUserWaiting(event: H3Event) {
    const auth = getAuthContext(event);
    const uId = auth.id_account || 0;

    if (uId <= 0) {
        return { status: 'error', message: 'Not logged in' };
    }

    await dbQuery(async (sql) => {
        const cancelled = await sql`
            UPDATE consult_requests
            SET status = 'cancelled'
            WHERE id_account = ${uId} AND status = 'waiting'
            RETURNING id
        `;
        for (const row of cancelled) {
            await syncServiceUsageForConsult(sql, Number(row.id || 0));
        }
    });

    return { status: 'success' };
}

export async function handleGetUserBotHistory(event: H3Event) {
    const query = getQuery(event);
    const auth = getAuthContext(event);
    const pId = auth.id_pharma || 0;
    const uId = Number(query.u_id || query.id_account || 0);
    let sessionId = String(query.session_id || '').trim();

    if (pId <= 0) {
        return { status: 'error', message: 'ต้องเข้าสู่ระบบเภสัชกร', data: [] };
    }
    if (uId <= 0) {
        return { status: 'error', message: 'ไม่พบรหัสคนไข้', data: [] };
    }

    const result = await dbQuery(async (sql) => {
        const perm = await sql`
            SELECT id FROM consult_requests
            WHERE id_account = ${uId} AND id_pharma = ${pId}
              AND COALESCE(is_deleted, 0) = 0
            ORDER BY id DESC
            LIMIT 1
        `;
        if (!perm[0]) {
            return { error: 'ไม่มีสิทธิ์ดูประวัติของผู้ป่วยรายนี้' };
        }

        if (!sessionId) {
            const sq = await sql`
                SELECT session_id FROM chat_history
                WHERE id_account = ${uId}
                  AND COALESCE(is_deleted, 0) = 0
                GROUP BY session_id
                ORDER BY MAX(created_at) DESC
                LIMIT 1
            `;
            sessionId = String(sq[0]?.session_id || '').trim();
        }

        const messages: Array<{ role: string; message: string; created_at: string }> = [];
        let symptomName = '';

        if (sessionId) {
            const mq = await sql`
                SELECT role, message, symptom_name, created_at
                FROM chat_history
                WHERE id_account = ${uId}
                  AND session_id = ${sessionId}
                  AND COALESCE(is_deleted, 0) = 0
                ORDER BY created_at ASC, id ASC
            `;
            for (const r of mq) {
                if (!symptomName && r.symptom_name) {
                    symptomName = String(r.symptom_name);
                }
                messages.push({
                    role: String(r.role || ''),
                    message: String(r.message || ''),
                    created_at: String(r.created_at || ''),
                });
            }
        }

        const acc = await sql`
            SELECT firstname, lastname, username_account
            FROM account WHERE id_account = ${uId} LIMIT 1
        `;
        const row = acc[0];
        let patientName = '';
        if (row) {
            patientName = `${row.firstname || ''} ${row.lastname || ''}`.trim();
            if (!patientName) patientName = String(row.username_account || '').trim();
        }
        if (!patientName) patientName = `คนไข้ #${uId}`;

        return {
            patient_id: uId,
            patient_name: patientName,
            session_id: sessionId,
            symptom_name: symptomName,
            message_count: messages.length,
            data: messages,
        };
    });

    if (!result) {
        return { status: 'error', message: 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้', data: [] };
    }
    if ('error' in result) {
        return { status: 'error', message: result.error, data: [] };
    }

    return { status: 'success', ...result };
}
