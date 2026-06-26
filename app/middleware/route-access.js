/**
 * route-access.js — กฎเส้นทางตาม role (ใช้ร่วมกับ auth-guard.global.js)
 */

/** หน้าที่เปิดได้โดยไม่ต้องล็อกอิน */
export const PUBLIC_PATH_PREFIXES = [
    '/auth',
    '/Contact',
    '/Contact_Pharmacy',
    '/Advice',
    '/Review',
    '/review_write',
    '/user/chat_bot',     // 🆕 ปรึกษา AI (เริ่มแชทใหม่)         — guest mode
    '/user/chat-history', // 🆕 ปรึกษา AI (มี session_id ต่อเนื่อง) — guest mode
    // ⚠️ NOTE: ห้ามใช้ '/user' ลอย ๆ เพราะจะทำให้หน้าอื่นใต้ /user เป็น public ด้วย
];

/** หน้าแรก — ผู้ใช้ทั่วไป + guest เข้าได้ */
export const LANDING_PATHS = ['/', ''];

/**
 * prefix ที่แต่ละ role เข้าได้ (นอกจาก PUBLIC + LANDING ตามกฎด้านล่าง)
 * ลำดับสำคัญ: ตรวจ prefix ยาวก่อนใน auth-guard
 */
export const ROLE_ALLOWED_PREFIXES = {
    user: [
        '/user',
        '/pharmacist',         // เลือกเภสัช / จองคิว
        '/prescription-view',  // ดู PDF ใบสั่งยาของตัวเอง (backend ตรวจสิทธิ์)
    ],
    pharmacist: [
        '/pharmacy_web',
        '/tracking',
        '/billing',
        '/history',
        '/dashboard',
        '/Summary',
        '/prescription-view',
        '/my-prescriptions',
        '/pharmacy',
    ],
    store: [
        '/shop',
    ],
    admin: [
        '/admin',
        '/admin_dashboard_page',
        '/prescription-view', // ดู PDF ใบสั่งยา
    ],
};

export function normalizeRole(role, data = null) {
    if (!role && data) {
        if (Number(data.id_account_admin) > 0) role = 'admin';
        else if (Number(data.id_pharma) > 0) role = 'pharmacist';
        else if (Number(data.id_store_accounts) > 0 || data.store_id) role = 'store';
        else if (Number(data.id_account) > 0) role = 'user';
    }
    if (role === 'member') return 'user';
    if (role === 'pharmacist' || role === 'store' || role === 'admin' || role === 'user') {
        return role;
    }
    return null;
}

export function isPublicPath(path) {
    if (LANDING_PATHS.includes(path)) return true;
    return PUBLIC_PATH_PREFIXES.some((p) => path === p || path.startsWith(p + '/'));
}

export function isPathAllowedForRole(path, role) {
    if (!role) return isPublicPath(path);
    if (isPublicPath(path)) return true;

    // หน้าแรก: ทุก role เข้าได้ (smart-home จะเด้ง admin/เภสัช/ร้านไป home ของตัวเอง)
    if (LANDING_PATHS.includes(path)) return true;

    const prefixes = ROLE_ALLOWED_PREFIXES[role];
    if (!prefixes) return false;
    return prefixes.some((p) => path === p || path.startsWith(p + '/'));
}

/** หา login path ตาม URL ที่พยายามเข้า */
export function loginPathForRoute(path) {
    if (path.startsWith('/admin') || path.startsWith('/admin_dashboard')) {
        return '/auth/login-admin';
    }
    if (
        path.startsWith('/shop')
        || path.startsWith('/pharmacy_web')
        || path.startsWith('/tracking')
        || path.startsWith('/billing')
        || path.startsWith('/pharmacy')
        || path.startsWith('/dashboard')
        || path.startsWith('/history')
        || path.startsWith('/Summary')
        || path.startsWith('/my-prescriptions')
        || path.startsWith('/prescription-view')
    ) {
        if (path.startsWith('/shop')) return '/auth/login-store';
        return '/auth/login-pharmacist';
    }
    return '/auth/login-user';
}
