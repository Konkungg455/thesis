import type { H3Event } from 'h3';
import { issueAgoraRtcToken } from '../agora/issueToken';
import {
    handleGetPrescriptionDetail,
    handleSavePrescription,
    handleSendPrescriptionEmail,
} from './savePrescription';

function normalizePath(pathname: string): string {
    return pathname.split('?')[0].replace(/^\/+/, '');
}

export async function dispatchBff(event: H3Event, pathname: string) {
    const path = normalizePath(pathname);
    const pathLower = path.toLowerCase();
    const query = getQuery(event);
    const method = event.method?.toUpperCase() || 'GET';

    if (isMediaPath(path)) {
        return serveLocalMedia(event, path);
    }

    if (pathLower === 'get-user-session.php') {
        return handleGetUserSession(event);
    }

    if (pathLower.startsWith('process-login')) {
        return handleProcessLogin(event, pathLower);
    }

    if (pathLower === 'logout.php') {
        return { status: 'success' };
    }

    if (pathLower === 'vue-forgot-password.php' && method === 'POST') {
        return handleForgotPassword(event);
    }

    if (pathLower === 'vue-check-reset-token.php') {
        return handleCheckResetToken(event);
    }

    if (pathLower === 'vue-reset-password.php' && method === 'POST') {
        return handleResetPassword(event);
    }

    if (pathLower === 'get_pharmacists.php') {
        return handleGetPharmacists(event);
    }

    if (pathLower === 'get_pharmacist_detail.php') {
        return handleGetPharmacistDetail(event);
    }

    if (pathLower === 'get-pharma.php') {
        return handleGetPharmaAdmin(event);
    }

    if (pathLower === 'get-nearby-pharmacies.php') {
        return handleGetNearbyPharmacies(event);
    }

    if (pathLower === 'get-stores.php') {
        return handleGetStores(event);
    }

    if (pathLower === 'get-user.php') {
        return handleGetUsers(event);
    }

    if (pathLower === 'get-prescriptions.php') {
        return handleGetPrescriptions(event);
    }

    if (pathLower === 'get-prescription-detail.php') {
        return handleGetPrescriptionDetail(event);
    }

    if (pathLower === 'save-prescription.php' && method === 'POST') {
        return handleSavePrescription(event);
    }

    if (pathLower === 'send-prescription-email.php' && method === 'POST') {
        return handleSendPrescriptionEmail(event);
    }

    if (pathLower === 'complete-tracking.php' && method === 'POST') {
        return handleCompleteTracking(event);
    }

    if (pathLower === 'admin-list-admins.php') {
        return handleAdminListAdmins(event);
    }

    if (pathLower === 'get-service-usage.php') {
        return handleGetServiceUsage(event);
    }

    if (pathLower === 'verify-pharma.php') {
        return handleVerifyPharma(event);
    }

    if (pathLower === 'get-store-pharmacists.php') {
        return handleGetStorePharmacists(event);
    }

    if (pathLower === 'get-pharma-store-status.php') {
        return handleGetPharmaStoreStatus(event);
    }

    if (pathLower === 'ack-pharma-store-welcome.php' && method === 'POST') {
        return handleAckPharmaStoreWelcome(event);
    }

    if (pathLower === 'get-pharmacist-billing-slips.php') {
        return handleGetPharmacistBillingSlips(event);
    }

    if (pathLower === 'get-store-billing-slips.php') {
        return handleGetStoreBillingSlips(event);
    }

    if (pathLower === 'get-store-statement.php') {
        return handleGetStoreStatement(event);
    }

    if (pathLower === 'vue-get-pharma-profile.php') {
        return handleGetPharmaProfile(event);
    }

    if (pathLower === 'vue-get-store-profile.php' || pathLower === 'get-store-profile.php' || pathLower === 'admin-get-store-profile.php') {
        return handleGetStoreProfile(event);
    }

    if (pathLower === 'vue-get-account-address.php') {
        return handleGetAccountAddress(event);
    }

    if (pathLower === 'vue-save-account-address.php' && method === 'POST') {
        return handleSaveAccountAddress(event);
    }

    if (pathLower === 'vue-update-user-profile.php' && method === 'POST') {
        return handleUpdateUserProfile(event);
    }

    if (pathLower === 'vue-update-pharma-profile.php' && method === 'POST') {
        return handleUpdatePharmaProfile(event);
    }

    if (pathLower === 'vue-update-store-profile.php' && method === 'POST') {
        return handleUpdateStoreProfile(event);
    }

    if (pathLower === 'review-billing-slip.php' && method === 'POST') {
        return handleReviewBillingSlip(event);
    }

    if (pathLower === 'invite-pharmacist-to-store.php' && method === 'POST') {
        return handleInvitePharmacistToStore(event);
    }

    if (pathLower === 'approve-pharmacist.php' && method === 'POST') {
        return handleApprovePharmacist(event);
    }

    if (pathLower === 'reject-pharmacist.php' && method === 'POST') {
        return handleRejectPharmacist(event);
    }

    if (pathLower === 'vue-register-user.php' && method === 'POST') {
        return handleRegisterUser(event);
    }

    if (pathLower === 'vue-verify-otp.php' && method === 'POST') {
        return handleVerifyOtp(event);
    }

    if (pathLower === 'vue-resend-otp.php' && method === 'POST') {
        return handleResendOtp(event);
    }

    if (pathLower === 'review-get.php') {
        return handleGetReviews();
    }

    if (pathLower === 'review-send.php' && method === 'POST') {
        return handleSendReview(event);
    }

    if (pathLower === 'vue-get-user-profile.php') {
        return handleGetUserProfileBff(event);
    }

    if (pathLower === 'consult-handler.php') {
        return handleConsult(event, String(query.action || ''));
    }

    if (pathLower === 'get-patient-info.php') {
        return handleGetPatientInfo(event);
    }

    if (pathLower === 'chat-get.php') {
        return handleChatGet(event);
    }

    if (pathLower === 'chat-send.php' && method === 'POST') {
        return handleChatSend(event);
    }

    if (pathLower === 'chat-timer.php') {
        return handleChatTimer(event);
    }

    if (pathLower === 'chat-delete.php' && method === 'POST') {
        return handleChatDelete(event);
    }

    if (pathLower === 'chat-edit.php' && method === 'POST') {
        return handleChatEdit(event);
    }

    if (pathLower === 'save-chat.php' && method === 'POST') {
        return handleSaveChat(event);
    }

    if (pathLower === 'get-chat-history.php') {
        return handleGetChatHistory(event);
    }

    if (pathLower === 'get-chat-detail.php') {
        return handleGetChatDetail(event);
    }

    if (pathLower === 'delete-chat-session.php' && method === 'POST') {
        return handleDeleteChatSession(event);
    }

    if (pathLower === 'delete-chat-message.php' && method === 'POST') {
        return handleDeleteChatMessage(event);
    }

    if (pathLower === 'call-handler.php') {
        return handleCallHandler(event, String(query.action || ''));
    }

    if (pathLower === 'call-check.php') {
        return handleCallCheck(event);
    }

    if (pathLower === 'agora-token.php') {
        return issueAgoraRtcToken(event);
    }

    return handleFallback(pathLower, method);
}

async function handleGetUserSession(event: H3Event) {
    const q = getQuery(event);
    const cacheKey = buildSessionCacheKey(q as Record<string, unknown>);
    if (cacheKey) {
        const cached = getSessionCache(cacheKey);
        if (cached) return cached;
    }

    const fromDb = await dbQuery(async (sql) => {
        if (q.id_store_accounts) {
            const id = Number(q.id_store_accounts);
            const rows = await sql`
                SELECT username, firstname, license_file, profile_store_account, is_deleted
                FROM phamacy_store_accounts
                WHERE id_store_accounts = ${id}
                LIMIT 1
            `;
            const row = rows[0];
            if (!row) return null;
            if (Number(row.is_deleted || 0) === 1) {
                return { authenticated: false, status: 'deleted', message: 'บัญชีร้านยานี้ถูกลบ/ระงับการใช้งานชั่วคราว' };
            }
            return {
                authenticated: true,
                user: {
                    id,
                    store_id: id,
                    username: row.username || row.firstname,
                    firstname: row.firstname,
                    role: 'store',
                    image: row.profile_store_account,
                },
            };
        }

        if (q.id_pharma) {
            const id = Number(q.id_pharma);
            const rows = await sql`
                SELECT username_pharma, images_pharma, license_image, is_deleted
                FROM pharmacist_account
                WHERE id_pharma = ${id}
                LIMIT 1
            `;
            const row = rows[0];
            if (!row) return null;
            if (Number(row.is_deleted || 0) === 1) {
                return { authenticated: false, status: 'deleted', message: 'บัญชีเภสัชกรนี้ถูกลบ/ระงับการใช้งานชั่วคราว' };
            }
            return {
                authenticated: true,
                user: {
                    id,
                    id_pharma: id,
                    username: row.username_pharma,
                    role: 'pharmacist',
                    image: row.images_pharma || row.license_image,
                },
            };
        }

        if (q.id_account_admin) {
            const id = Number(q.id_account_admin);
            const rows = await sql`
                SELECT username_account, images_account, firstname, lastname, email_account,
                       admin_status, is_super_admin, is_deleted
                FROM account_admin
                WHERE id_account_admin = ${id}
                LIMIT 1
            `;
            const row = rows[0];
            if (!row) return null;
            if (Number(row.is_deleted || 0) === 1) {
                return { authenticated: false, status: 'deleted', message: 'บัญชีผู้ดูแลระบบนี้ถูกลบ/ระงับการใช้งานชั่วคราว' };
            }
            return {
                authenticated: true,
                user: {
                    id,
                    id_account_admin: id,
                    id_account: id,
                    username: row.username_account,
                    firstname: row.firstname,
                    lastname: row.lastname,
                    email_account: row.email_account,
                    role: 'admin',
                    admin_status: row.admin_status || 'approved',
                    is_super_admin: Number(row.is_super_admin || 0),
                    image: row.images_account || 'default.png',
                },
            };
        }

        if (q.id_account) {
            const id = Number(q.id_account);
            const rows = await sql`
                SELECT username_account, images_account, role_account, is_deleted
                FROM account
                WHERE id_account = ${id}
                LIMIT 1
            `;
            const row = rows[0];
            if (!row) return null;
            if (Number(row.is_deleted || 0) === 1) {
                return { authenticated: false, status: 'deleted', message: 'บัญชีผู้ใช้งานนี้ถูกลบ/ระงับการใช้งานชั่วคราว' };
            }
            return {
                authenticated: true,
                user: {
                    id,
                    id_account: id,
                    username: row.username_account,
                    role: row.role_account,
                    image: row.images_account,
                },
            };
        }

        return null;
    });

    if (fromDb) {
        if (cacheKey) setSessionCache(cacheKey, fromDb);
        return fromDb;
    }

    if (q.id_store_accounts) {
        return {
            authenticated: true,
            user: {
                id: Number(q.id_store_accounts),
                store_id: Number(q.id_store_accounts),
                username: String(q.username || 'store'),
                firstname: String(q.firstname || ''),
                role: 'store',
                image: String(q.image || ''),
            },
        };
    }

    if (q.id_pharma) {
        return {
            authenticated: true,
            user: {
                id: Number(q.id_pharma),
                id_pharma: Number(q.id_pharma),
                username: String(q.username || 'pharmacist'),
                role: 'pharmacist',
                image: String(q.image || ''),
            },
        };
    }

    if (q.id_account_admin) {
        return {
            authenticated: true,
            user: {
                id: Number(q.id_account_admin),
                id_account_admin: Number(q.id_account_admin),
                id_account: Number(q.id_account_admin),
                username: String(q.username || 'admin'),
                role: 'admin',
                image: String(q.image || 'default.png'),
            },
        };
    }

    if (q.id_account) {
        return {
            authenticated: true,
            user: {
                id: Number(q.id_account),
                id_account: Number(q.id_account),
                username: String(q.username || 'user'),
                role: String(q.role || 'user'),
                image: String(q.image || 'default.png'),
            },
        };
    }

    return { authenticated: false };
}

async function handleProcessLogin(event: H3Event, path: string) {
    const body = await readBody(event).catch(() => ({}));
    const email = String(body?.email_account || '').trim();
    const password = String(body?.password_account || '');

    if (!email || !password) {
        return { status: 'error', message: 'กรุณากรอกอีเมลและรหัสผ่าน' };
    }

    const tableMap: Record<string, { table: string; idCol: string; emailCol: string; passCol: string; saltCol: string; role: string }> = {
        'process-login.php': {
            table: 'account',
            idCol: 'id_account',
            emailCol: 'email_account',
            passCol: 'password_account',
            saltCol: 'salt_account',
            role: 'user',
        },
        'process-login-phamacy.php': {
            table: 'pharmacist_account',
            idCol: 'id_pharma',
            emailCol: 'email_pharma',
            passCol: 'password_pharma',
            saltCol: 'salt_pharma',
            role: 'pharmacist',
        },
        'process-login-store.php': {
            table: 'phamacy_store_accounts',
            idCol: 'id_store_accounts',
            emailCol: 'personal_email',
            passCol: 'password',
            saltCol: 'salt_store',
            role: 'store',
        },
        'process-login-admin.php': {
            table: 'account_admin',
            idCol: 'id_account_admin',
            emailCol: 'email_account',
            passCol: 'password_account',
            saltCol: 'salt_account',
            role: 'admin',
        },
    };

    const cfg = tableMap[path];
    if (!cfg) {
        return { status: 'error', message: 'ไม่รองรับ endpoint นี้' };
    }

    const selectByPath: Record<string, string> = {
        'process-login.php': `SELECT id_account, password_account, salt_account, is_deleted,
            username_account, images_account, role_account
            FROM account WHERE email_account = $1 LIMIT 1`,
        'process-login-phamacy.php': `SELECT id_pharma, password_pharma, salt_pharma, is_deleted,
            username_pharma, images_pharma, status_verify
            FROM pharmacist_account WHERE email_pharma = $1 LIMIT 1`,
        'process-login-store.php': `SELECT id_store_accounts, password, salt_store, is_deleted,
            username, firstname, profile_store_account
            FROM phamacy_store_accounts WHERE personal_email = $1 LIMIT 1`,
        'process-login-admin.php': `SELECT id_account_admin, password_account, salt_account, is_deleted,
            username_account, images_account, firstname, role_account
            FROM account_admin WHERE email_account = $1 LIMIT 1`,
    };

    const selectSql = selectByPath[path];
    if (!selectSql) {
        return { status: 'error', message: 'ไม่รองรับ endpoint นี้' };
    }

    const result = await dbQuery(async (sql) => {
        const rows = await sql.unsafe(selectSql, [email]);
        return rows[0] as Record<string, unknown> | undefined;
    });

    if (!result) {
        if (!isDbConfigured()) {
            return {
                status: 'error',
                message: dbUnavailableMessage(),
            };
        }
        return { status: 'error', message: 'ไม่พบอีเมลนี้ในระบบ' };
    }

    if (Number(result.is_deleted || 0) === 1) {
        return { status: 'deleted', message: 'บัญชีนี้ถูกลบ/ระงับการใช้งานชั่วคราว' };
    }

    const hash = String(result[cfg.passCol] || '');
    const salt = String(result[cfg.saltCol] || '');
    const ok = await verifyPassword(password, salt, hash, {
        allowPlainPassword: cfg.table === 'phamacy_store_accounts',
    });

    if (!ok) {
        return { status: 'error', message: 'รหัสผ่านไม่ถูกต้อง' };
    }

    if (cfg.table === 'pharmacist_account') {
        const verifyStatus = Number(result.status_verify ?? 1);
        if (verifyStatus === 0) {
            return {
                status: 'pending',
                message: 'บัญชีของคุณอยู่ระหว่างรอการตรวจสอบใบวิชาชีพจาก Admin',
            };
        }
        if (verifyStatus === 2) {
            return {
                status: 'rejected',
                message: 'บัญชีของคุณไม่ได้รับการอนุมัติ กรุณาติดต่อผู้ดูแลระบบ',
            };
        }
    }

    const id = Number(result[cfg.idCol]);
    const role = String(result.role_account || cfg.role);
    const username = String(
        result.username_account
        || result.username_pharma
        || result.username
        || result.firstname
        || email,
    );
    const image = String(
        result.images_account
        || result.images_pharma
        || result.profile_store_account
        || 'default.png',
    );

    const redirectMap: Record<string, string> = {
        user: '/',
        pharmacist: '/dashboard',
        store: '/shop/shop_detail',
        admin: '/admin_dashboard_page',
    };

    return {
        status: 'success',
        message: 'เข้าสู่ระบบสำเร็จ',
        redirect: redirectMap[role] || '/',
        user: {
            id,
            id_account: cfg.table === 'account' ? id : undefined,
            id_pharma: cfg.table === 'pharmacist_account' ? id : undefined,
            id_store_accounts: cfg.table === 'phamacy_store_accounts' ? id : undefined,
            id_account_admin: cfg.table === 'account_admin' ? id : undefined,
            store_id: cfg.table === 'phamacy_store_accounts' ? id : undefined,
            username,
            role,
            image,
        },
    };
}

async function handleGetPharmacists(event: H3Event) {
    const q = getQuery(event);
    const userLat = q.lat ? Number(q.lat) : null;
    const userLng = q.lng ? Number(q.lng) : null;
    const cacheKey = `pharmacists:${userLat ?? 'x'}:${userLng ?? 'x'}`;

    if (!isDbConfigured()) {
        return { status: 'error', message: dbUnavailableMessage() };
    }

    const cached = getBffCache(cacheKey);
    if (cached) return cached;

    const rows = await dbQuery(async (sql) => sql`
        SELECT p.id_pharma, p.firstname_pharma, p.lastname_pharma,
               p.images_pharma, p.work_time, p.status_verify, p.id_store,
               d.store_name, d.latitude, d.longitude,
               d.house_no, d.road, d.sub_district, d.district, d.province
        FROM pharmacist_account p
        LEFT JOIN phamacy_store_accounts a ON a.id_store_accounts = p.id_store
              AND a.status = 1
              AND (a.admin_status IS NULL OR a.admin_status = 'approved')
        LEFT JOIN phamacy_store_details d ON d.id_store_accounts = p.id_store
        WHERE p.status_verify = 1
    `);

    if (rows === null) {
        return { status: 'error', message: dbUnavailableMessage() };
    }

    const pharmacists = rows.map((row) => {
        const address = [row.house_no, row.road, row.sub_district, row.district, row.province]
            .filter(Boolean)
            .join(' ');
        let distance_km: number | null = null;
        const storeLat = row.latitude != null ? Number(row.latitude) : null;
        const storeLng = row.longitude != null ? Number(row.longitude) : null;
        if (userLat != null && userLng != null && storeLat != null && storeLng != null
            && Number.isFinite(userLat) && Number.isFinite(userLng)
            && Number.isFinite(storeLat) && Number.isFinite(storeLng)) {
            distance_km = Math.round(haversineKm(userLat, userLng, storeLat, storeLng) * 100) / 100;
        }
        return {
            id: Number(row.id_pharma),
            name: `${row.firstname_pharma || ''} ${row.lastname_pharma || ''}`.trim(),
            time: row.work_time || '',
            image: row.images_pharma || 'default.png',
            store_id: row.id_store != null ? Number(row.id_store) : null,
            store_name: row.store_name || '',
            store_address: address,
            store_lat: storeLat,
            store_lng: storeLng,
            distance_km,
        };
    });

    if (userLat != null && userLng != null) {
        pharmacists.sort((a, b) => {
            if (a.distance_km == null && b.distance_km == null) return 0;
            if (a.distance_km == null) return 1;
            if (b.distance_km == null) return -1;
            return a.distance_km - b.distance_km;
        });
    }

    const payload = { status: 'success', total: pharmacists.length, data: pharmacists };
    if (pharmacists.length > 0) {
        setBffCache(cacheKey, payload, 90_000);
    }
    return payload;
}

async function handleGetNearbyPharmacies(event: H3Event) {
    const q = getQuery(event);
    const lat = q.lat !== undefined && q.lat !== '' ? Number(q.lat) : NaN;
    const lng = q.lng !== undefined && q.lng !== '' ? Number(q.lng) : NaN;
    const limit = Math.max(1, Math.min(100, Number(q.limit || 20) || 20));
    const hasUserPos = Number.isFinite(lat) && Number.isFinite(lng)
        && (lat !== 0 || lng !== 0);

    const rows = await dbQuery(async (sql) => sql`
        SELECT a.id_store_accounts AS id,
               a.personal_phone, a.personal_email,
               d.store_name, d.store_phone, d.store_email,
               d.house_no, d.road, d.sub_district, d.district,
               d.province, d.zipcode,
               d.google_maps_url, d.latitude, d.longitude
        FROM phamacy_store_accounts a
        LEFT JOIN phamacy_store_details d ON d.id_store_accounts = a.id_store_accounts
        WHERE a.status = 1
          AND COALESCE(a.is_deleted, 0) = 0
          AND (a.admin_status IS NULL OR a.admin_status = 'approved')
        ORDER BY a.id_store_accounts DESC
    `);

    if (!rows) {
        return { status: 'success', total: 0, stores: [] };
    }

    const stores = [];
    for (const row of rows) {
        const name = String(row.store_name || '').trim();
        if (!name) continue;

        const address = [
            row.house_no, row.road, row.sub_district, row.district, row.province, row.zipcode,
        ].filter((v) => v != null && String(v).trim() !== '').join(' ').trim();

        const storeLat = row.latitude != null && row.latitude !== ''
            ? Number(row.latitude) : null;
        const storeLng = row.longitude != null && row.longitude !== ''
            ? Number(row.longitude) : null;

        let distance: number | null = null;
        if (hasUserPos && storeLat != null && storeLng != null
            && Number.isFinite(storeLat) && Number.isFinite(storeLng)
            && (storeLat !== 0 || storeLng !== 0)) {
            distance = Math.round(haversineKm(lat, lng, storeLat, storeLng) * 100) / 100;
        }

        stores.push({
            id: Number(row.id),
            store_name: name,
            address: address || 'ไม่ระบุที่อยู่',
            phone: String(row.store_phone || row.personal_phone || '').trim(),
            email: String(row.store_email || row.personal_email || '').trim(),
            google_maps_url: String(row.google_maps_url || '').trim(),
            latitude: storeLat,
            longitude: storeLng,
            distance,
        });
    }

    if (hasUserPos) {
        stores.sort((a, b) => {
            if (a.distance == null && b.distance == null) return 0;
            if (a.distance == null) return 1;
            if (b.distance == null) return -1;
            return a.distance - b.distance;
        });
    }

    const limited = stores.slice(0, limit);
    return { status: 'success', total: limited.length, stores: limited };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function handleGetReviews() {
    const cached = getBffCache('reviews:all');
    if (cached) return cached;

    const rows = await dbQuery(async (sql) => sql`
        SELECT r.*, a.firstname, a.lastname, a.images_account
        FROM reviews r
        INNER JOIN (
            SELECT user_id, MAX(id) AS latest_id
            FROM reviews
            GROUP BY user_id
        ) latest ON latest.user_id = r.user_id AND latest.latest_id = r.id
        JOIN account a ON r.user_id = a.id_account
        ORDER BY r.rating DESC, r.created_at DESC
    `);

    if (rows === null) {
        return { status: 'error', message: dbUnavailableMessage() };
    }

    const payload = rows;
    if (payload.length > 0) {
        setBffCache('reviews:all', payload, 60_000);
    }
    return payload;
}

async function handleSendReview(event: H3Event) {
    const { fields } = await readMultipartRequest(event);
    const auth = getAuthContext(event, fields);
    const userId = Number(auth.id_account || fields.user_id || 0);
    const rating = Math.max(1, Math.min(5, Number(fields.rating || 0)));
    const comment = String(fields.comment || '').trim();
    const consultId = Number(fields.consult_id || 0);

    if (!userId) {
        return { status: 'error', message: 'กรุณาเข้าสู่ระบบก่อนส่งรีวิว' };
    }
    if (!rating || !comment) {
        return { status: 'error', message: 'กรุณาให้คะแนนและกรอกความคิดเห็น' };
    }

    const result = await dbQuery(async (sql) => {
        const inserted = consultId > 0
            ? await sql`
                INSERT INTO reviews (user_id, rating, comment, id_consult_request, created_at)
                VALUES (${userId}, ${rating}, ${comment}, ${consultId}, NOW())
                RETURNING id
            `
            : await sql`
                INSERT INTO reviews (user_id, rating, comment, created_at)
                VALUES (${userId}, ${rating}, ${comment}, NOW())
                RETURNING id
            `;

        return inserted[0] || null;
    });

    if (result === null) {
        return { status: 'error', message: dbUnavailableMessage() };
    }

    clearBffCache('reviews:all');
    return {
        status: 'success',
        id: Number(result.id || 0),
        backend: 'supabase',
    };
}

async function handleConsult(event: H3Event, action: string) {
    switch (action) {
        case 'list_consult_archives':
            return handleListConsultArchives(event);
        case 'get_chat_archive':
            return handleGetChatArchive(event);
        case 'delete_consult_archive':
            return handleDeleteConsultArchive(event);
        case 'list_my_patients':
            return handleListMyPatients(event);
        case 'get_active_consult':
            return handleGetActiveConsult(event);
        case 'complete_consult':
            return handleCompleteConsult(event);
        case 'check_user_status':
            return handleCheckUserStatus(event);
        case 'check_pharma_request':
            return handleCheckPharmaRequest(event);
        case 'cancel_user_waiting':
            return handleCancelUserWaiting(event);
        case 'update_status':
            return handleUpdateConsultStatus(event);
        case 'create_request':
            return handleCreateConsultRequest(event);
        case 'get_user_bot_history':
            return handleGetUserBotHistory(event);
        default:
            return { status: 'success', data: [] };
    }
}

async function handleSaveChat(event: H3Event) {
    if (!isSupabaseConfigured()) {
        return { status: 'error', message: 'Supabase is not configured' };
    }

    const body = await readBody(event);
    const idAccount = resolveAccountId(event, body);
    await saveChatMessage({
        id_account: idAccount,
        role: String(body?.role || ''),
        message: String(body?.message || ''),
        session_id: String(body?.session_id || ''),
        symptom_name: String(body?.symptom_name || 'ทั่วไป'),
        meta_json: body?.meta_json != null ? String(body.meta_json) : null,
    });

    return {
        status: 'success',
        session: String(body?.session_id || ''),
        guest: idAccount === null,
        backend: 'supabase',
    };
}

async function handleGetChatHistory(event: H3Event) {
    const query = getQuery(event);
    const idAccount = resolveAccountId(event, query);
    let sessionIds: string[] | null = null;

    if (idAccount === null) {
        const raw = String(query.sessions || '').trim();
        if (raw) {
            sessionIds = raw.split(',').map((s) => s.trim()).filter(Boolean);
        }
    }

    const data = await listChatSessions(idAccount, sessionIds);
    return { status: 'success', data, backend: 'supabase' };
}

async function handleGetChatDetail(event: H3Event) {
    const query = getQuery(event);
    const sessionId = String(query.session_id || '').trim();
    if (!sessionId) {
        return { status: 'error', message: 'Missing session_id' };
    }

    const idAccount = resolveAccountId(event, query);
    const messages = await getChatDetail(idAccount, sessionId);

    if (messages.length === 0) {
        return { status: 'error', message: 'No chat history found' };
    }

    return {
        status: 'success',
        data: messages,
        symptom_name: messages[0]?.symptom_name || 'ทั่วไป',
        backend: 'supabase',
    };
}

async function handleDeleteChatSession(event: H3Event) {
    const body = await readBody(event);
    const sessionId = String(body?.session_id || '').trim();
    const idAccount = resolveAccountId(event, body);
    const deletedRows = await softDeleteChatSession(
        idAccount,
        sessionId,
        idAccount,
        idAccount === null ? 'guest' : 'user',
    );

    return {
        status: 'success',
        session_id: sessionId,
        deleted_rows: deletedRows,
        backend: 'supabase',
    };
}

async function handleDeleteChatMessage(event: H3Event) {
    const body = await readBody(event);
    const messageId = Number(body?.message_id || 0);
    const sessionId = String(body?.session_id || '').trim() || null;
    const idAccount = resolveAccountId(event, body);
    const deletedRows = await softDeleteChatMessage(idAccount, messageId, sessionId);

    if (deletedRows === 0) {
        return {
            status: 'error',
            message: 'ไม่พบข้อความ หรือไม่มีสิทธิ์ลบ',
            deleted_rows: 0,
        };
    }

    return {
        status: 'success',
        message_id: messageId,
        deleted_rows: deletedRows,
        backend: 'supabase',
    };
}

function handleFallback(path: string, method: string) {
    if (method === 'GET') {
        if (path.includes('get-') || path.includes('list') || path.includes('admin-list')) {
            return { status: 'success', data: [] };
        }
    }

    return {
        status: 'error',
        message: `ฟังก์ชัน ${path} ยังไม่พร้อมบน Supabase — ต้องตั้งค่า DATABASE_URL และ import schema`,
    };
}
