import type { H3Event } from 'h3';
import { getAuthContext, parsePositiveInt } from './sessionContext';

type EntityType = 'user' | 'pharma' | 'store';

const ENTITY_LABELS: Record<EntityType, string> = {
    user: 'ผู้ใช้งาน',
    pharma: 'เภสัชกร',
    store: 'ร้านยา',
};

function adminOnlyMessage(auth: ReturnType<typeof getAuthContext>): string | null {
    if (!auth.isAdmin) {
        return 'เฉพาะผู้ดูแลระบบเท่านั้น';
    }
    return null;
}

async function markDeleted(type: EntityType, id: number, adminId: number): Promise<boolean> {
    const deletedBy = adminId > 0 ? adminId : null;

    if (type === 'user') {
        const rows = await dbQuery(async (sql) => sql`
            UPDATE account SET
                is_deleted = 1,
                deleted_at = NOW(),
                deleted_by = ${deletedBy},
                deleted_by_role = 'admin'
            WHERE id_account = ${id}
              AND COALESCE(is_deleted, 0) = 0
            RETURNING id_account
        `);
        return (rows?.length ?? 0) > 0;
    }

    if (type === 'pharma') {
        const rows = await dbQuery(async (sql) => sql`
            UPDATE pharmacist_account SET
                is_deleted = 1,
                deleted_at = NOW(),
                deleted_by = ${deletedBy},
                deleted_by_role = 'admin'
            WHERE id_pharma = ${id}
              AND COALESCE(is_deleted, 0) = 0
            RETURNING id_pharma
        `);
        return (rows?.length ?? 0) > 0;
    }

    const rows = await dbQuery(async (sql) => sql`
        UPDATE phamacy_store_accounts SET
            is_deleted = 1,
            deleted_at = NOW(),
            deleted_by = ${deletedBy},
            deleted_by_role = 'admin'
        WHERE id_store_accounts = ${id}
          AND COALESCE(is_deleted, 0) = 0
        RETURNING id_store_accounts
    `);
    return (rows?.length ?? 0) > 0;
}

async function markRestored(type: EntityType, id: number): Promise<boolean> {
    if (type === 'user') {
        const rows = await dbQuery(async (sql) => sql`
            UPDATE account SET
                is_deleted = 0,
                deleted_at = NULL,
                deleted_by = NULL,
                deleted_by_role = NULL
            WHERE id_account = ${id}
              AND COALESCE(is_deleted, 0) = 1
            RETURNING id_account
        `);
        return (rows?.length ?? 0) > 0;
    }

    if (type === 'pharma') {
        const rows = await dbQuery(async (sql) => sql`
            UPDATE pharmacist_account SET
                is_deleted = 0,
                deleted_at = NULL,
                deleted_by = NULL,
                deleted_by_role = NULL
            WHERE id_pharma = ${id}
              AND COALESCE(is_deleted, 0) = 1
            RETURNING id_pharma
        `);
        return (rows?.length ?? 0) > 0;
    }

    const rows = await dbQuery(async (sql) => sql`
        UPDATE phamacy_store_accounts SET
            is_deleted = 0,
            deleted_at = NULL,
            deleted_by = NULL,
            deleted_by_role = NULL
        WHERE id_store_accounts = ${id}
          AND COALESCE(is_deleted, 0) = 1
        RETURNING id_store_accounts
    `);
    return (rows?.length ?? 0) > 0;
}

async function handleDeleteEntity(event: H3Event, type: EntityType) {
    const auth = getAuthContext(event);
    const denied = adminOnlyMessage(auth);
    if (denied) {
        return { status: 'error', message: denied };
    }

    const id = parsePositiveInt(getQuery(event).id);
    if (id <= 0) {
        return { status: 'error', message: `ไม่พบรหัส${ENTITY_LABELS[type]}` };
    }

    const adminId = parsePositiveInt(auth.id_account_admin);
    const ok = await markDeleted(type, id, adminId);
    if (!ok) {
        return { status: 'error', message: 'ไม่พบข้อมูลหรือถูกลบไปแล้ว' };
    }

    return {
        status: 'success',
        message: `ลบ${ENTITY_LABELS[type]}ออกจากรายการใช้งานแล้ว (ข้อมูลจริงยังเก็บในฐานข้อมูล)`,
    };
}

export async function handleDeleteUser(event: H3Event) {
    return handleDeleteEntity(event, 'user');
}

export async function handleDeletePharma(event: H3Event) {
    return handleDeleteEntity(event, 'pharma');
}

export async function handleDeleteStore(event: H3Event) {
    return handleDeleteEntity(event, 'store');
}

export async function handleRestoreDeleted(event: H3Event) {
    const auth = getAuthContext(event);
    const denied = adminOnlyMessage(auth);
    if (denied) {
        return { status: 'error', message: denied };
    }

    const q = getQuery(event);
    const type = String(q.type || '').trim() as EntityType;
    const id = parsePositiveInt(q.id);

    if (!['user', 'pharma', 'store'].includes(type)) {
        return { status: 'error', message: 'ประเภทข้อมูลไม่ถูกต้อง' };
    }
    if (id <= 0) {
        return { status: 'error', message: `ไม่พบรหัส${ENTITY_LABELS[type]}` };
    }

    const ok = await markRestored(type, id);
    if (!ok) {
        return { status: 'error', message: 'ไม่พบข้อมูลที่ถูกลบ หรือกู้คืนไปแล้ว' };
    }

    return {
        status: 'success',
        message: `กู้คืน${ENTITY_LABELS[type]}เรียบร้อยแล้ว`,
    };
}
