import type { H3Event } from 'h3';

export interface BffAuthContext {
    id_account?: number;
    id_pharma?: number;
    id_store_accounts?: number;
    id_account_admin?: number;
    role?: string;
    isAdmin: boolean;
}

export function getAuthContext(event: H3Event, body?: Record<string, unknown>): BffAuthContext {
    const q = getQuery(event);
    const merged: Record<string, unknown> = { ...q, ...(body || {}) };

    const id_account = numOrUndef(
        merged.id_account
        ?? (String(merged.role || merged.role_account || '').toLowerCase() === 'user' ? merged.id : undefined),
    );
    const id_pharma = numOrUndef(
        merged.id_pharma
        ?? (String(merged.role || '').toLowerCase() === 'pharmacist' ? merged.id : undefined),
    );
    const id_store_accounts = numOrUndef(
        merged.id_store_accounts
        ?? merged.store_id
        ?? (String(merged.role || '').toLowerCase() === 'store' ? merged.id : undefined),
    );
    const role = String(merged.role || merged.role_account || '').trim().toLowerCase();
    const id_account_admin = numOrUndef(
        merged.id_account_admin
        ?? (role === 'admin' ? merged.id : undefined),
    );

    const isAdmin = role === 'admin' || (id_account_admin != null && id_account_admin > 0);

    return {
        id_account,
        id_pharma,
        id_store_accounts,
        id_account_admin,
        role: role || undefined,
        isAdmin,
    };
}

function numOrUndef(v: unknown): number | undefined {
    const n = parsePositiveInt(v);
    return n > 0 ? n : undefined;
}

/** แปลงค่าเป็นจำนวนเต็มบวก — กัน NaN ไปเข้า Postgres */
export function parsePositiveInt(v: unknown): number {
    if (v === null || v === undefined || v === '') return 0;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}
