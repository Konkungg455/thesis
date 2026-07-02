/**
 * auth-guard.global.js — ตรวจสิทธิ์ทุกหน้า (global)
 *
 * แก้บั๊ก: ผู้ใช้ทั่วไปเข้าหน้าเภสัช/ร้าน/แอดมิน หรือหน้าที่ไม่มี definePageMeta ได้
 *  - ผู้ใช้ (user) เข้าได้เฉพาะ /, /user/*, /pharmacist/*, หน้า public, /auth/*
 *  - guest ดูรายชื่อ/รายละเอียดเภสัชได้ (/pharmacist/all, /pharmacist/:id)
 *  - เภสัช / เจ้าร้าน / แอดมิน — เข้าได้เฉพาะโซนของตัวเอง
 */
import { readAuthFromStorage, redirectToOwnHome } from './role-helper.js';
import {
    normalizeRole,
    isPublicPath,
    isPathAllowedForRole,
    loginPathForRoute,
} from './route-access.js';

export default defineNuxtRouteMiddleware((to) => {
    // รันบน client เท่านั้น (อ่าน localStorage)
    if (!import.meta.client) return;

    const path = to.path;
    const { role: rawRole, data } = readAuthFromStorage();
    const role = normalizeRole(rawRole, data);

    // หน้า public — ใครก็เข้าได้
    if (isPublicPath(path)) return;

    // ยังไม่ล็อกอิน — ห้ามเข้าโซนที่ต้องมีสิทธิ์
    if (!role) {
        if (isPathAllowedForRole(path, null)) return;
        return navigateTo({
            path: loginPathForRoute(path),
            query: { redirect: to.fullPath, reason: 'login_required' },
        });
    }

    // ล็อกอินแล้ว — ต้องอยู่ในโซนของ role ตัวเอง
    if (!isPathAllowedForRole(path, role)) {
        return redirectToOwnHome(role);
    }
});
