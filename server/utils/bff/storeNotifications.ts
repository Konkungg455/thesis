import type { H3Event } from 'h3';
import { getAuthContext } from './sessionContext';

function pharmaWelcomePending(row: Record<string, unknown>): boolean {
    const notice = row.store_join_notice_at;
    if (notice == null || notice === '') return false;
    const ack = row.store_join_ack_at;
    if (ack == null || ack === '') return true;
    return new Date(String(ack)).getTime() < new Date(String(notice)).getTime();
}

async function ensurePharmaStoreNoticeColumns(sql: ReturnType<typeof useDb>) {
    try {
        await sql.unsafe(`
            ALTER TABLE pharmacist_account
            ADD COLUMN IF NOT EXISTS store_join_notice_at TIMESTAMP NULL DEFAULT NULL
        `);
        await sql.unsafe(`
            ALTER TABLE pharmacist_account
            ADD COLUMN IF NOT EXISTS store_join_ack_at TIMESTAMP NULL DEFAULT NULL
        `);
    } catch {
        // columns may already exist with different syntax on older PG
    }
}

export function isConsultNotifyWorthy(data: Record<string, unknown>): boolean {
    const status = String(data.status || '');
    if (['waiting', 'accepted', 'rejected'].includes(status)) return true;
    if (status === 'cancelled') return false;
    if (status === 'completed') {
        if (Number(data.tracking_active) === 1) return true;
        if (Number(data.reviewed) !== 1) return true;
        return false;
    }
    return false;
}

export async function handleGetPharmaStoreStatus(event: H3Event) {
    const auth = getAuthContext(event);
    const pId = auth.id_pharma || 0;

    if (pId <= 0) {
        return { status: 'error', message: 'ไม่ใช่บัญชีเภสัชกร' };
    }

    const cacheKey = `pharma-store-status:${pId}`;
    const cached = getBffCache(cacheKey);
    if (cached) return cached;

    const result = await dbQuery(async (sql) => {
        await ensurePharmaStoreNoticeColumns(sql);
        const rows = await sql`
            SELECT p.id_store, p.pending_store_id,
                   p.store_join_notice_at, p.store_join_ack_at,
                   d1.store_name AS current_store_name,
                   d2.store_name AS pending_store_name
            FROM pharmacist_account p
            LEFT JOIN phamacy_store_details d1 ON d1.id_store_accounts = p.id_store
            LEFT JOIN phamacy_store_details d2 ON d2.id_store_accounts = p.pending_store_id
            WHERE p.id_pharma = ${pId}
            LIMIT 1
        `;
        return rows[0] as Record<string, unknown> | undefined;
    });

    if (!result) {
        return { status: 'error', message: 'ไม่พบข้อมูล' };
    }

    const welcomePending = pharmaWelcomePending(result);
    const base = { welcome_pending: welcomePending };
    const pendingId = result.pending_store_id != null ? Number(result.pending_store_id) : 0;
    const storeId = result.id_store != null ? Number(result.id_store) : 0;

    if (pendingId > 0) {
        const label = String(result.pending_store_name || '').trim() || `ร้าน #${pendingId}`;
        const payload = {
            ...base,
            status: 'success',
            state: 'pending',
            store_name: label,
            message: `กำลังรอเจ้าของร้าน "${label}" อนุมัติคำขอเข้าร้าน`,
        };
        setBffCache(cacheKey, payload, 45_000);
        return payload;
    }

    if (storeId > 0) {
        const label = String(result.current_store_name || '').trim() || `ร้าน #${storeId}`;
        const payload = {
            ...base,
            status: 'success',
            state: 'active',
            store_name: label,
            store_id: storeId,
            message: `คุณกำลังทำงานที่ "${label}"`,
        };
        setBffCache(cacheKey, payload, 45_000);
        return payload;
    }

    const payload = {
        ...base,
        status: 'success',
        state: 'unassigned',
        store_name: '',
        message: 'คุณยังไม่ได้สังกัดร้านยา — รอเจ้าของร้านเชิญเข้าร้าน',
    };
    setBffCache(cacheKey, payload, 45_000);
    return payload;
}

export async function handleAckPharmaStoreWelcome(event: H3Event) {
    const auth = getAuthContext(event);
    const pId = auth.id_pharma || 0;

    if (pId <= 0) {
        return { status: 'error', message: 'ไม่ใช่บัญชีเภสัชกร' };
    }

    await dbQuery(async (sql) => {
        await ensurePharmaStoreNoticeColumns(sql);
        await sql`
            UPDATE pharmacist_account
            SET store_join_ack_at = NOW()
            WHERE id_pharma = ${pId}
        `;
    });

    return { status: 'success', message: 'รับทราบแล้ว' };
}
