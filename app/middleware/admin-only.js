/**
 * admin-only.js
 * จำกัดเฉพาะ "ผู้ดูแลระบบ" (role=admin)
 *  - ไม่ล็อกอิน → ไป login-admin
 *  - ล็อกอินเป็น role อื่น → เด้งไป home ของ role นั้น
 */
import { readAuthFromStorage, redirectToLogin, redirectToOwnHome, ROLE_LOGIN } from './role-helper.js';
import { normalizeRole } from './route-access.js';

export default defineNuxtRouteMiddleware((to) => {
    if (!import.meta.client) return;
    const { role: raw, data } = readAuthFromStorage();
    const role = normalizeRole(raw, data);

    if (!role) {
        return redirectToLogin(to.fullPath, ROLE_LOGIN.admin, 'admin_required');
    }
    if (role !== 'admin') {
        return redirectToOwnHome(role);
    }
});
