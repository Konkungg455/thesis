/**
 * smart-home.js
 * ใช้กับหน้าแรก ('/') — ถ้าล็อกอินค้างอยู่ในฐานะ admin/pharmacist/store
 * → เด้งไปหน้าแรกของ role ตัวเอง (ไม่ให้ admin/เภสัช/เจ้าของร้านมาเจอ landing user)
 *
 * user หรือ guest → ผ่าน, เห็น landing ตามปกติ
 */
import { readAuthFromStorage, ROLE_HOME } from './role-helper.js';

export default defineNuxtRouteMiddleware(() => {
    if (!import.meta.client) return;
    const { role } = readAuthFromStorage();

    if (!role || role === 'user') return; // landing user

    const home = ROLE_HOME[role];
    if (home && home !== '/') {
        return navigateTo(home, { replace: true });
    }
});
