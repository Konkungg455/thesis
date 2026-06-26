/**
 * user-only.js
 * จำกัดเฉพาะ "ผู้ใช้งานทั่วไป" (role=user) — เช่น /user/*, /pharmacist/* (เลือกเภสัช)
 *
 * พฤติกรรม:
 *  - SSR/server → ปล่อยผ่าน (ตรวจอีกที onMounted)
 *  - client:
 *    - ไม่ล็อกอิน → ไป login-user
 *    - ล็อกอินเป็น role อื่น → เด้งไป home ของ role นั้น
 *    - role=user → ผ่าน
 */
import { readAuthFromStorage, redirectToLogin, redirectToOwnHome, ROLE_LOGIN } from './role-helper.js';
import { normalizeRole } from './route-access.js';

export default defineNuxtRouteMiddleware((to) => {
    if (!import.meta.client) return;

    const { role: raw, data } = readAuthFromStorage();
    const role = normalizeRole(raw, data);

    if (!role) {
        return redirectToLogin(to.fullPath, ROLE_LOGIN.user, 'user_required');
    }
    if (role !== 'user') {
        return redirectToOwnHome(role);
    }
});
