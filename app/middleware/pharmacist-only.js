/**
 * pharmacist-only.js
 * จำกัดเฉพาะ "เภสัชกร" (role=pharmacist)
 *  - หน้า PDF ใบสั่งยา (/prescription-view) ยังให้ admin เปิดดูได้
 *  - หน้าอื่นในกลุ่มนี้ (tracking/history/dashboard/billing/Summary/pharmacy_web)
 *    → เฉพาะเภสัชกรเท่านั้น
 */
import { readAuthFromStorage, redirectToLogin, redirectToOwnHome, ROLE_LOGIN } from './role-helper.js';
import { normalizeRole } from './route-access.js';

// path ที่ admin ยังเปิดดูได้ (เช่น PDF ใบสั่งยา)
const ADMIN_ALSO_ALLOWED = ['/prescription-view'];

export default defineNuxtRouteMiddleware((to) => {
    if (!import.meta.client) return;
    const { role: raw, data } = readAuthFromStorage();
    const role = normalizeRole(raw, data);

    if (!role) {
        return redirectToLogin(to.fullPath, ROLE_LOGIN.pharmacist, 'pharmacist_required');
    }
    if (role === 'pharmacist') return;

    // admin สามารถดูบางหน้าได้
    if (role === 'admin' && ADMIN_ALSO_ALLOWED.some(p => to.path.startsWith(p))) {
        return;
    }

    // อื่น ๆ — เด้งไป home ของ role ตัวเอง
    return redirectToOwnHome(role);
});
