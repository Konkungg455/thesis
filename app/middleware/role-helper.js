/**
 * role-helper.js
 * Helper สำหรับตรวจ role + redirect — ใช้ใน middleware ทั้งหมด
 *
 * รวมที่อ่าน localStorage + ตัดสิน role + path ของแต่ละ role
 */

export const ROLE_HOME = {
    user: '/',
    pharmacist: '/pharmacy_web',
    store: '/shop/shop_detail',
    admin: '/admin_dashboard_page',
};

export const ROLE_LOGIN = {
    user: '/auth/login-user',
    pharmacist: '/auth/login-pharmacist',
    store: '/auth/login-store',
    admin: '/auth/login-admin',
};

/**
 * อ่าน auth จาก localStorage แล้วคืน role ที่ล็อกอินอยู่
 * @returns {{ role: 'user'|'pharmacist'|'store'|'admin'|null, data: any }}
 */
export function readAuthFromStorage() {
    if (!import.meta.client) return { role: null, data: null };
    let role = null;
    let data = null;
    try {
        role = localStorage.getItem('user_role');
        const raw = localStorage.getItem('user_data');
        if (raw) data = JSON.parse(raw);
    } catch {
        role = null;
        data = null;
    }
    // normalize role จาก data ถ้า key role ไม่มี
    if (!role && data?.role) role = data.role;
    if (!role && data?.role_account) role = data.role_account;

    // backfill จาก id_* (ลำดับสำคัญ: admin > pharma > store > user)
    if (!role) {
        if (Number(data?.id_account_admin) > 0) role = 'admin';
        else if (Number(data?.id_pharma) > 0) role = 'pharmacist';
        else if (Number(data?.id_store_accounts) > 0 || data?.store_id) role = 'store';
        else if (Number(data?.id_account) > 0) role = 'user';
    }

    // member ในฐานข้อมูล = ผู้ใช้ทั่วไป
    if (role === 'member') role = 'user';

    return { role, data };
}

/**
 * สร้าง redirect ไป login พร้อม query
 */
export function redirectToLogin(toPath, loginPath, reason) {
    return navigateTo({
        path: loginPath,
        query: { redirect: toPath, reason }
    });
}

/**
 * Redirect ไป "หน้าแรกของ role ตัวเอง" (ใช้กับคนที่ไม่มีสิทธิ์ดูหน้าปัจจุบัน)
 */
export function redirectToOwnHome(role) {
    return navigateTo(ROLE_HOME[role] || '/', { replace: true });
}
