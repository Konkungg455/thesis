import type { H3Event } from 'h3';
import { getAuthContext } from './sessionContext';
import { readMultipartRequest } from './formData';
import { archiveAndClearChatBetween } from './consultArchives';
import { ensureConsultTrackingRecord } from './consultTracking';
import { syncServiceUsageForConsult } from './serviceUsage';

export async function handleListMyPatients(event: H3Event) {
    const auth = getAuthContext(event);
    const pId = auth.id_pharma || 0;
    if (pId <= 0) {
        return { status: 'error', data: [] };
    }

    const cacheKey = `list-my-patients:${pId}`;
    const cached = getBffCache(cacheKey);
    if (cached) return cached;

    const list = await dbQuery(async (sql) => {
        const rows = await sql`
            SELECT r.id_account,
                   MAX(r.id)::int AS request_id,
                   a.firstname, a.lastname, a.username_account, a.images_account
            FROM consult_requests r
            INNER JOIN account a ON r.id_account = a.id_account
            WHERE r.id_pharma = ${pId}
              AND r.status = 'accepted'
              AND COALESCE(r.is_deleted, 0) = 0
            GROUP BY r.id_account, a.firstname, a.lastname, a.username_account, a.images_account
            ORDER BY request_id DESC
        `;
        return rows.map((row) => {
            const first = String(row.firstname || '').trim();
            const last = String(row.lastname || '').trim();
            let name = `${first} ${last}`.trim();
            if (!name) {
                name = String(row.username_account || '').trim() || `ผู้ป่วย #${row.id_account}`;
            }
            const imgFile = String(row.images_account || '').trim();
            return {
                id_account: Number(row.id_account),
                request_id: Number(row.request_id),
                patient_name: name,
                image_url: imgFile ? `images_account/${imgFile}` : 'images_account/default.png',
            };
        });
    });

    const payload = { status: 'success', data: list || [] };
    setBffCache(cacheKey, payload, 20_000);
    return payload;
}

export async function handleGetActiveConsult(event: H3Event) {
    const query = getQuery(event);
    const auth = getAuthContext(event);
    const pId = auth.id_pharma || 0;
    const uId = Number(query.patient_id || 0);
    const reqCid = Number(query.consult_id || 0);

    if (pId <= 0 || uId <= 0) {
        return { status: 'none' };
    }

    const cacheKey = `active-consult:${pId}:${uId}:${reqCid}`;
    const cached = getBffCache(cacheKey);
    if (cached) return cached;

    const result = await dbQuery(async (sql) => {
        let trackingActive = 0;
        let trackingBase: string | null = null;
        let trackingCid = 0;

        let presRows;
        if (reqCid > 0) {
            presRows = await sql`
                SELECT id_consult_request, tracking_status, last_followup_at, created_at
                FROM prescriptions
                WHERE id_account = ${uId} AND id_consult_request = ${reqCid}
                ORDER BY id DESC
                LIMIT 1
            `;
        } else {
            presRows = await sql`
                SELECT id_consult_request, tracking_status, last_followup_at, created_at
                FROM prescriptions
                WHERE id_account = ${uId} AND id_pharma = ${pId}
                  AND (tracking_status IS NULL OR tracking_status <> 'completed')
                ORDER BY id DESC
                LIMIT 1
            `;
        }

        if (presRows[0]) {
            const prow = presRows[0];
            const base = prow.last_followup_at || prow.created_at || null;
            trackingBase = base ? String(base) : null;
            trackingCid = Number(prow.id_consult_request || 0);
            const within = base
                ? Date.now() < new Date(String(base)).getTime() + 3 * 24 * 60 * 60 * 1000
                : false;
            // แชทยังติดตามได้จนกว่าจะครบ 3 วัน — ไม่จบเพราะอนุมัติสลิป/ปิดเคสในรายการติดตาม
            trackingActive = within ? 1 : 0;
        }

        let rows;
        if (reqCid > 0) {
            rows = await sql`
                SELECT * FROM consult_requests
                WHERE id_pharma = ${pId}
                  AND id_account = ${uId}
                  AND id = ${reqCid}
                  AND status = 'accepted'
                  AND COALESCE(is_deleted, 0) = 0
                LIMIT 1
            `;
        } else {
            rows = await sql`
                SELECT * FROM consult_requests
                WHERE id_pharma = ${pId}
                  AND id_account = ${uId}
                  AND status = 'accepted'
                  AND COALESCE(is_deleted, 0) = 0
                ORDER BY id DESC
                LIMIT 1
            `;
        }

        if (rows[0]) {
            const data = { ...rows[0] } as Record<string, unknown>;
            const fq = await sql`
                SELECT MAX(last_followup_at) AS lf
                FROM prescriptions
                WHERE id_account = ${uId} AND id_pharma = ${pId}
            `;
            data.last_followup_at = fq[0]?.lf || null;
            data.tracking_active = trackingActive;
            data.tracking_base = trackingBase;
            return data;
        }

        if (trackingActive && (reqCid > 0 || trackingCid > 0)) {
            const fallbackCid = reqCid > 0 ? reqCid : trackingCid;
            return {
                status: 'tracking',
                id: fallbackCid,
                is_followup: 1,
                tracking_active: 1,
                tracking_base: trackingBase,
                last_followup_at: trackingBase,
            };
        }

        if (presRows[0] && trackingBase !== null && (reqCid > 0 || trackingCid > 0)) {
            const baseMs = new Date(String(trackingBase)).getTime();
            const expired = Number.isFinite(baseMs)
                && Date.now() >= baseMs + 3 * 24 * 60 * 60 * 1000;
            if (expired) {
                const fallbackCid = reqCid > 0 ? reqCid : trackingCid;
                return {
                    status: 'tracking_ended',
                    id: fallbackCid,
                    is_followup: 0,
                    tracking_active: 0,
                    tracking_base: trackingBase,
                    last_followup_at: trackingBase,
                };
            }
        }

        return { status: 'none' };
    });

    const payload = result || { status: 'none' };
    setBffCache(cacheKey, payload, 8_000);
    return payload;
}

export async function handleCompleteConsult(event: H3Event) {
    await ensureBffSchema();

    const auth = getAuthContext(event);
    const pId = auth.id_pharma || 0;

    let uId = 0;
    if (event.method?.toUpperCase() === 'POST') {
        const { fields } = await readMultipartRequest(event);
        uId = Number(fields.patient_id || 0);
    }
    if (uId <= 0) {
        const q = getQuery(event);
        uId = Number(q.patient_id || 0);
    }

    if (pId <= 0 || uId <= 0) {
        return { status: 'error', message: 'ข้อมูลไม่ครบ' };
    }

    const result = await dbQuery(async (sql) => {
        const accepted = await sql`
            SELECT id FROM consult_requests
            WHERE id_pharma = ${pId}
              AND id_account = ${uId}
              AND status = 'accepted'
              AND COALESCE(is_deleted, 0) = 0
            ORDER BY id DESC
            LIMIT 1
        `;
        let consultId = Number(accepted[0]?.id || 0);

        await sql`
            UPDATE consult_requests
            SET status = 'completed'
            WHERE id_pharma = ${pId}
              AND id_account = ${uId}
              AND status = 'accepted'
        `;

        const info = await archiveAndClearChatBetween(sql, pId, uId);
        if (consultId <= 0) consultId = Number(info.consultId || 0);
        const serviceCode = String(info.serviceCode || '');

        if (consultId > 0) {
            await syncServiceUsageForConsult(sql, consultId);
            await ensureConsultTrackingRecord(sql, pId, uId, consultId);
        }

        return { consult_id: consultId, service_code: serviceCode };
    });

    if (!result) {
        return { status: 'error', message: 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้' };
    }

    return {
        status: 'success',
        consult_id: result.consult_id,
        service_code: result.service_code,
    };
}
