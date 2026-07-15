import type { H3Event } from 'h3';
import { getAuthContext } from './sessionContext';
import { readMultipartRequest } from './formData';
import { archiveAndClearChatBetween } from './consultArchives';
import { ensureConsultTrackingRecord } from './consultTracking';
import { syncServiceUsageForConsult } from './serviceUsage';
import { enrichConsultBotMeta } from './consultRequests';

const TRACKING_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

function isWithinTrackingWindow(trackingBase: string | null | undefined): boolean {
    if (!trackingBase) return false;
    const baseMs = new Date(String(trackingBase)).getTime();
    return Number.isFinite(baseMs) && Date.now() < baseMs + TRACKING_WINDOW_MS;
}

function buildPatientName(row: Record<string, unknown>, idAccount: number): string {
    const first = String(row.firstname || '').trim();
    const last = String(row.lastname || '').trim();
    let name = `${first} ${last}`.trim();
    if (!name) {
        name = String(row.username_account || '').trim() || `ผู้ป่วย #${idAccount}`;
    }
    return name;
}

function buildPatientImage(row: Record<string, unknown>): string {
    const imgFile = String(row.images_account || '').trim();
    return imgFile ? `images_account/${imgFile}` : 'images_account/default.png';
}

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
        const acceptedRows = await sql`
            SELECT r.id_account,
                   MAX(r.id)::int AS request_id,
                   a.firstname, a.lastname, a.username_account, a.images_account,
                   (
                       SELECT su.service_code
                       FROM service_usage su
                       WHERE su.id_consult_request = (
                           SELECT MAX(r2.id)
                           FROM consult_requests r2
                           WHERE r2.id_account = r.id_account
                             AND r2.id_pharma = ${pId}
                             AND r2.status = 'accepted'
                             AND COALESCE(r2.is_deleted, 0) = 0
                       )
                       LIMIT 1
                   ) AS service_code
            FROM consult_requests r
            INNER JOIN account a ON r.id_account = a.id_account
            WHERE r.id_pharma = ${pId}
              AND r.status = 'accepted'
              AND COALESCE(r.is_deleted, 0) = 0
            GROUP BY r.id_account, a.firstname, a.lastname, a.username_account, a.images_account
            ORDER BY MAX(r.id) DESC
        `;

        const trackingRows = await sql`
            SELECT DISTINCT ON (p.id_account)
                p.id_account,
                p.id_consult_request,
                p.tracking_status,
                COALESCE(p.last_followup_at, p.created_at) AS tracking_base,
                COALESCE(TRIM(p.med_details), '') AS med_details,
                COALESCE(p.auto_created, 0) AS auto_created,
                a.firstname, a.lastname, a.username_account, a.images_account,
                (
                    SELECT su.service_code
                    FROM service_usage su
                    WHERE su.id_consult_request = p.id_consult_request
                    LIMIT 1
                ) AS service_code
            FROM prescriptions p
            INNER JOIN account a ON a.id_account = p.id_account
            WHERE p.id_pharma = ${pId}
              AND COALESCE(p.tracking_status, 'active') <> 'completed'
            ORDER BY p.id_account, p.id DESC
        `;

        const byAccount = new Map<number, Record<string, unknown>>();

        for (const row of acceptedRows) {
            const idAccount = Number(row.id_account);
            if (idAccount <= 0) continue;
            byAccount.set(idAccount, {
                id_account: idAccount,
                request_id: Number(row.request_id),
                consult_id: Number(row.request_id),
                service_code: String(row.service_code || '').trim(),
                patient_name: buildPatientName(row, idAccount),
                image_url: buildPatientImage(row),
                list_group: 'consult',
            });
        }

        for (const row of trackingRows) {
            const idAccount = Number(row.id_account);
            if (idAccount <= 0) continue;

            const trackingStatus = String(row.tracking_status || 'active');
            const trackingBase = row.tracking_base ? String(row.tracking_base) : '';
            const hasMeds = String(row.med_details || '').trim() !== '';
            const autoCreated = Number(row.auto_created || 0) === 1;
            const trackable = trackingStatus === 'active' && (hasMeds || autoCreated);
            if (!trackable || !isWithinTrackingWindow(trackingBase)) continue;

            const existing = byAccount.get(idAccount);
            if (existing && existing.list_group === 'consult') continue;

            const consultId = Number(row.id_consult_request || 0);
            byAccount.set(idAccount, {
                id_account: idAccount,
                request_id: consultId,
                consult_id: consultId,
                service_code: String(row.service_code || '').trim(),
                patient_name: buildPatientName(row, idAccount),
                image_url: buildPatientImage(row),
                list_group: 'tracking',
                tracking_base: trackingBase,
            });
        }

        return Array.from(byAccount.values()).sort((a, b) => {
            const groupOrder = (g: unknown) => (g === 'tracking' ? 0 : 1);
            const ga = groupOrder(a.list_group);
            const gb = groupOrder(b.list_group);
            if (ga !== gb) return ga - gb;
            return Number(b.request_id || 0) - Number(a.request_id || 0);
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
            await enrichConsultBotMeta(sql, uId, data, Number(data.id || reqCid || 0));
            return data;
        }

        if (trackingActive && (reqCid > 0 || trackingCid > 0)) {
            const fallbackCid = reqCid > 0 ? reqCid : trackingCid;
            const trackData: Record<string, unknown> = {
                status: 'tracking',
                id: fallbackCid,
                is_followup: 1,
                tracking_active: 1,
                tracking_base: trackingBase,
                last_followup_at: trackingBase,
            };
            await enrichConsultBotMeta(sql, uId, trackData, fallbackCid);
            return trackData;
        }

        if (presRows[0] && trackingBase !== null && (reqCid > 0 || trackingCid > 0)) {
            const baseMs = new Date(String(trackingBase)).getTime();
            const expired = Number.isFinite(baseMs)
                && Date.now() >= baseMs + 3 * 24 * 60 * 60 * 1000;
            if (expired) {
                const fallbackCid = reqCid > 0 ? reqCid : trackingCid;
                const endedData: Record<string, unknown> = {
                    status: 'tracking_ended',
                    id: fallbackCid,
                    is_followup: 0,
                    tracking_active: 0,
                    tracking_base: trackingBase,
                    last_followup_at: trackingBase,
                };
                await enrichConsultBotMeta(sql, uId, endedData, fallbackCid);
                return endedData;
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

    clearBffCache(`list-my-patients:${pId}`);
    clearBffCachePrefix(`active-consult:${pId}:${uId}`);

    return {
        status: 'success',
        consult_id: result.consult_id,
        service_code: result.service_code,
    };
}
