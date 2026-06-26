/**
 * auth-required.js
 * ต้องล็อกอินทุก role (user / pharmacist / store / admin) เปิดดูได้
 * ใช้กับหน้าที่ backend เป็นคนตัดสินสิทธิ์เอง เช่น /prescription-view
 */
import { readAuthFromStorage, ROLE_LOGIN } from './role-helper.js';
import { normalizeRole, loginPathForRoute } from './route-access.js';

export default defineNuxtRouteMiddleware((to) => {
    if (!import.meta.client) return;
    const { role: raw, data } = readAuthFromStorage();
    const role = normalizeRole(raw, data);

    if (!role) {
        return navigateTo({
            path: loginPathForRoute(to.path) || ROLE_LOGIN.user,
            query: { redirect: to.fullPath, reason: 'login_required' }
        });
    }
});
