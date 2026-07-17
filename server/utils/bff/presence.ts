import type { H3Event } from 'h3';
import { getAuthContext } from './sessionContext';

export const PRESENCE_ONLINE_SEC = 90;

export async function handleTouchPresence(event: H3Event) {
    if (!isDbConfigured()) {
        return { status: 'error', message: 'DATABASE_URL ยังไม่ได้ตั้งค่า' };
    }

    await ensureBffSchema();
    const auth = getAuthContext(event);
    const role = String(auth.role || '').toLowerCase();

    let presenceRole: 'user' | 'pharmacist' | null = null;
    let entityId = 0;

    if (auth.id_pharma && (role === 'pharmacist' || role === '')) {
        presenceRole = 'pharmacist';
        entityId = auth.id_pharma;
    } else if (auth.id_account && role !== 'admin' && !auth.isAdmin) {
        presenceRole = 'user';
        entityId = auth.id_account;
    }

    if (!presenceRole || entityId <= 0) {
        return { status: 'success', touched: false };
    }

    await dbQuery(async (sql) => sql`
        INSERT INTO user_presence (role, entity_id, last_seen_at)
        VALUES (${presenceRole}, ${entityId}, NOW())
        ON CONFLICT (role, entity_id)
        DO UPDATE SET last_seen_at = NOW()
    `);

    return { status: 'success', touched: true, role: presenceRole, entity_id: entityId };
}
