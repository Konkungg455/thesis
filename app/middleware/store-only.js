/**
 * store-only.js
 * จำกัดเฉพาะ "เจ้าของร้านยา" (role=store) — เช่น /shop/*
 */
import { readAuthFromStorage, redirectToLogin, redirectToOwnHome, ROLE_LOGIN } from './role-helper.js';
import { normalizeRole } from './route-access.js';

export default defineNuxtRouteMiddleware((to) => {
    if (!import.meta.client) return;
    const { role: raw, data } = readAuthFromStorage();
    const role = normalizeRole(raw, data);

    if (!role) {
        return redirectToLogin(to.fullPath, ROLE_LOGIN.store, 'store_required');
    }
    if (role !== 'store') {
        return redirectToOwnHome(role);
    }
});
