/** อ่าน session จาก localStorage สำหรับแนบ auth ไป BFF (query/body) */
export function readBffAuthParams() {
    if (!import.meta.client) return {};
    try {
        const saved = localStorage.getItem('user_data');
        if (!saved) return {};
        const u = JSON.parse(saved);
        const params = {};
        const role = u.role || u.role_account || '';

        if (u.id_account) params.id_account = String(u.id_account);
        else if (role === 'user' && u.id) params.id_account = String(u.id);

        if (u.id_pharma) params.id_pharma = String(u.id_pharma);
        else if (role === 'pharmacist' && u.id) params.id_pharma = String(u.id);

        const storeId = u.id_store_accounts || u.store_id;
        if (storeId) params.id_store_accounts = String(storeId);
        else if (role === 'store' && u.id) params.id_store_accounts = String(u.id);

        if (u.id_account_admin) params.id_account_admin = String(u.id_account_admin);
        else if (role === 'admin' && u.id) params.id_account_admin = String(u.id);

        if (role) params.role = role;
        return params;
    } catch {
        return {};
    }
}

export function withBffAuthBody(body = {}) {
    return { ...body, ...readBffAuthParams() };
}
