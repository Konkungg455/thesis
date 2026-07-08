/**
 * super-admin-only.js
 * จำกัดเฉพาะ Super Admin (admin + is_super_admin === 1)
 *  - ใช้กับหน้า /admin/admins (จัดการแอดมิน)
 */
import { readAuthFromStorage, redirectToOwnHome, ROLE_LOGIN } from './role-helper.js';
import { normalizeRole } from './route-access.js';

export default defineNuxtRouteMiddleware((to) => {
    if (!import.meta.client) return;
    const { role: raw, data } = readAuthFromStorage();
    const role = normalizeRole(raw, data);

    if (!role) {
        return navigateTo({
            path: ROLE_LOGIN.admin,
            query: { redirect: to.fullPath, reason: 'super_admin_required' }
        });
    }
    if (role !== 'admin') {
        return redirectToOwnHome(role);
    }
    // ตรวจ super admin flag
    if (Number(data?.is_super_admin) !== 1) {
        return navigateTo('/admin_dashboard_page', { replace: true });
    }
});
