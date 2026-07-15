import { randomBytes } from 'node:crypto';
import type { H3Event } from 'h3';
import type postgres from 'postgres';
import { resolvePharmacistLicenseFile, resolveProfileImageFile, resolveStoreLicenseFile } from '#shared/utils/mediaDefaults';
import { readMultipartRequest, readRequestFields } from './formData';
import { getAuthContext, parsePositiveInt } from './sessionContext';
import { consolidateDuplicateActiveTracking } from './consultTracking';
import {
    ensurePharmacistReviewNoticeColumns,
    ensureStoreReviewNoticeColumns,
    notifyRegistrationReview,
} from '../../utils/registrationNotifications';
import { resolveRequestOrigin } from '../../utils/requestOrigin';
import { ensureBffSchema } from './ensureSchema';

const consolidateCooldown = new Map<number, number>();
const CONSOLIDATE_COOLDOWN_MS = 60_000;

function pharmacistLicensePath(filename?: string | null): string {
    return `uploads/licenses/${resolvePharmacistLicenseFile(filename)}`;
}

function storeLicensePath(filename?: string | null): string {
    return `uploads/licenses/${resolveStoreLicenseFile(filename)}`;
}

function accountDeletedFilter(sql: ReturnType<typeof postgres>, deleted: boolean) {
    return deleted ? sql`COALESCE(is_deleted, 0) = 1` : sql`COALESCE(is_deleted, 0) = 0`;
}

function pharmaDeletedFilter(sql: ReturnType<typeof postgres>, deleted: boolean) {
    return deleted ? sql`COALESCE(p.is_deleted, 0) = 1` : sql`COALESCE(p.is_deleted, 0) = 0`;
}

function storeDeletedFilter(sql: ReturnType<typeof postgres>, deleted: boolean) {
    return deleted ? sql`COALESCE(a.is_deleted, 0) = 1` : sql`COALESCE(a.is_deleted, 0) = 0`;
}

export async function handleGetUsers(event: H3Event) {
    const q = getQuery(event);
    const search = String(q.username || '').trim();
    const deletedMode = String(q.deleted || '') === '1';
    const pattern = `%${search}%`;

    const rows = await dbQuery(async (sql) => {
        const deleted = accountDeletedFilter(sql, deletedMode);
        if (search) {
            return sql`
                SELECT a.*,
                       addr.house_no, addr.road, addr.sub_district, addr.district,
                       addr.province, addr.zipcode
                FROM account a
                LEFT JOIN account_address addr ON addr.id_account = a.id_account
                WHERE ${deleted}
                  AND (
                    a.username_account ILIKE ${pattern}
                    OR a.firstname ILIKE ${pattern}
                    OR a.lastname ILIKE ${pattern}
                    OR a.id_account::text = ${search}
                  )
                ORDER BY a.id_account DESC
            `;
        }
        return sql`
            SELECT a.*,
                   addr.house_no, addr.road, addr.sub_district, addr.district,
                   addr.province, addr.zipcode
            FROM account a
            LEFT JOIN account_address addr ON addr.id_account = a.id_account
            WHERE ${deleted}
            ORDER BY a.id_account DESC
        `;
    });

    const data = (rows || []).map(mapUserRow);
    return { status: 'success', authenticated: data.length > 0, data };
}

export async function handleGetPharmaAdmin(event: H3Event) {
    const q = getQuery(event);
    const search = String(q.username || '').trim();
    const deletedMode = String(q.deleted || '') === '1';
    const pattern = `%${search}%`;

    const rows = await dbQuery(async (sql) => {
        const deleted = pharmaDeletedFilter(sql, deletedMode);

        if (search) {
            return sql`
                SELECT p.*, d.store_name
                FROM pharmacist_account p
                LEFT JOIN phamacy_store_accounts a ON a.id_store_accounts = p.id_store
                      AND a.status = 1
                      AND (a.admin_status IS NULL OR a.admin_status = 'approved')
                LEFT JOIN phamacy_store_details d ON d.id_store_accounts = p.id_store
                WHERE ${deleted}
                  AND (
                    p.username_pharma ILIKE ${pattern}
                    OR p.firstname_pharma ILIKE ${pattern}
                    OR p.id_pharma::text = ${search}
                  )
                ORDER BY p.id_pharma DESC
            `;
        }
        return sql`
            SELECT p.*, d.store_name
            FROM pharmacist_account p
            LEFT JOIN phamacy_store_accounts a ON a.id_store_accounts = p.id_store
                  AND a.status = 1
                  AND (a.admin_status IS NULL OR a.admin_status = 'approved')
            LEFT JOIN phamacy_store_details d ON d.id_store_accounts = p.id_store
            WHERE ${deleted}
            ORDER BY p.id_pharma DESC
        `;
    });

    const data = (rows || []).map(mapPharmaAdminRow);
    return {
        status: 'success',
        authenticated: data.length > 0,
        data,
        message: data.length === 0 ? 'ไม่พบข้อมูลเภสัชกร' : undefined,
    };
}

export async function handleGetPharmacistDetail(event: H3Event) {
    const id = Number(getQuery(event).id || 0);
    if (id <= 0) {
        return { status: 'error', message: 'รหัสเภสัชกรไม่ถูกต้อง' };
    }

    const row = await dbQuery(async (sql) => {
        const rows = await sql`
            SELECT p.id_pharma, p.firstname_pharma, p.lastname_pharma, p.images_pharma,
                   p.license_image, p.work_time, p.status_verify, p.id_store,
                   COALESCE(NULLIF(TRIM(d.store_name), ''), NULLIF(TRIM(p.store_name), '')) AS store_name,
                   d.house_no, d.road, d.sub_district, d.district, d.province,
                   d.latitude, d.longitude
            FROM pharmacist_account p
            LEFT JOIN phamacy_store_details d ON d.id_store_accounts = p.id_store
            WHERE p.id_pharma = ${id}
              AND COALESCE(p.is_deleted, 0) = 0
            LIMIT 1
        `;
        return rows[0] || null;
    });

    if (!row) {
        return { status: 'error', message: `ไม่พบเภสัชกรรหัส ${id}` };
    }

    let imageFile = String(row.images_pharma || '').trim();
    if (!imageFile) {
        imageFile = String(row.license_image || '').trim() || 'default.png';
    }

    const name = `${String(row.firstname_pharma || '').trim()} ${String(row.lastname_pharma || '').trim()}`.trim()
        || `เภสัชกร #${id}`;

    const address = [row.house_no, row.road, row.sub_district, row.district, row.province]
        .filter(Boolean)
        .join(' ');

    return {
        status: 'success',
        data: {
            id,
            name,
            image: imageFile,
            time: row.work_time || '-',
            price: '100 บาท / 15 นาที',
            location: address || 'กรุงเทพมหานคร',
            store_id: row.id_store != null ? Number(row.id_store) : null,
            store_name: String(row.store_name || '').trim(),
            store_address: address,
            store_lat: row.latitude != null ? Number(row.latitude) : null,
            store_lng: row.longitude != null ? Number(row.longitude) : null,
            status_verify: Number(row.status_verify || 0),
        },
    };
}

export async function handleGetStores(event: H3Event) {
    const q = getQuery(event);
    const id = Number(q.id || 0);
    const deletedMode = String(q.deleted || '') === '1';
    const filterStatus = String(q.admin_status || '').trim();

    if (id > 0) {
        const row = await dbQuery(async (sql) => {
            const deleted = storeDeletedFilter(sql, deletedMode);
            const rows = await sql`
                SELECT a.id_store_accounts AS id, a.username, a.firstname, a.lastname,
                       a.personal_phone, a.personal_email, a.license_file, a.status,
                       a.admin_status, a.admin_reviewed_at, a.admin_review_note, a.created_at,
                       a.is_deleted, a.deleted_at, a.deleted_by, a.deleted_by_role,
                       d.store_name, d.house_no, d.road, d.sub_district, d.district,
                       d.province, d.zipcode, d.store_phone, d.store_email,
                       d.google_maps_url, d.latitude, d.longitude,
                       d.bank_name, d.bank_account_name, d.bank_account_number, d.qr_payment_file
                FROM phamacy_store_accounts a
                LEFT JOIN phamacy_store_details d ON d.id_store_accounts = a.id_store_accounts
                WHERE a.id_store_accounts = ${id} AND ${deleted}
                LIMIT 1
            `;
            return rows[0];
        });

        if (!row) {
            return { status: 'error', message: 'ไม่พบข้อมูลร้านยา' };
        }

        const store = mapStoreRow(row);
        const schedules = await dbQuery(async (sql) => sql`
            SELECT day_of_week, open_time, close_time, is_open
            FROM store_schedule WHERE id_store = ${id}
        `);
        store.schedules = (schedules || []).map((r) => ({
            day_of_week: r.day_of_week,
            open_time: String(r.open_time || '').slice(0, 5),
            close_time: String(r.close_time || '').slice(0, 5),
            is_open: Number(r.is_open) === 1,
        }));
        store.details = store;
        return { status: 'success', store, data: store };
    }

    const rows = await dbQuery(async (sql) => {
        const deleted = storeDeletedFilter(sql, deletedMode);

        if (['pending', 'approved', 'rejected'].includes(filterStatus)) {
            return sql`
                SELECT a.id_store_accounts AS id, a.username, a.firstname, a.lastname,
                       a.personal_phone, a.personal_email, a.license_file, a.status,
                       a.admin_status, a.admin_reviewed_at, a.admin_review_note, a.created_at,
                       a.is_deleted, a.deleted_at, a.deleted_by, a.deleted_by_role,
                       d.store_name, d.house_no, d.road, d.sub_district, d.district,
                       d.province, d.zipcode, d.store_phone, d.store_email,
                       d.google_maps_url, d.latitude, d.longitude,
                       d.bank_name, d.bank_account_name, d.bank_account_number, d.qr_payment_file
                FROM phamacy_store_accounts a
                LEFT JOIN phamacy_store_details d ON d.id_store_accounts = a.id_store_accounts
                WHERE ${deleted} AND a.admin_status = ${filterStatus}
                ORDER BY a.id_store_accounts DESC
            `;
        }

        return sql`
            SELECT a.id_store_accounts AS id, a.username, a.firstname, a.lastname,
                   a.personal_phone, a.personal_email, a.license_file, a.status,
                   a.admin_status, a.admin_reviewed_at, a.admin_review_note, a.created_at,
                   a.is_deleted, a.deleted_at, a.deleted_by, a.deleted_by_role,
                   d.store_name, d.house_no, d.road, d.sub_district, d.district,
                   d.province, d.zipcode, d.store_phone, d.store_email,
                   d.google_maps_url, d.latitude, d.longitude,
                   d.bank_name, d.bank_account_name, d.bank_account_number, d.qr_payment_file
            FROM phamacy_store_accounts a
            LEFT JOIN phamacy_store_details d ON d.id_store_accounts = a.id_store_accounts
            WHERE ${deleted}
            ORDER BY a.id_store_accounts DESC
        `;
    });

    const stores = (rows || []).map(mapStoreRow);
    return { status: 'success', stores };
}

export async function handleGetPrescriptions(event: H3Event) {
    const auth = getAuthContext(event);

    if (!auth.isAdmin && !auth.id_account && !auth.id_pharma && !auth.id_store_accounts) {
        return { status: 'error', message: 'กรุณาเข้าสู่ระบบก่อนดูข้อมูลใบสรุปรายการยา', data: [] };
    }

    const rows = await dbQuery(async (sql) => {
        if (auth.id_pharma) {
            const now = Date.now();
            const last = consolidateCooldown.get(auth.id_pharma) || 0;
            if (now - last > CONSOLIDATE_COOLDOWN_MS) {
                await consolidateDuplicateActiveTracking(sql, auth.id_pharma);
                consolidateCooldown.set(auth.id_pharma, now);
            }
        }
        let prescriptions: Record<string, unknown>[] = [];
        if (auth.isAdmin) {
            prescriptions = await sql`
                SELECT p.*,
                       a.phone_number AS account_phone, a.firstname AS account_firstname,
                       a.lastname AS account_lastname, a.email_account AS account_email,
                       a.images_account AS account_image,
                       addr.house_no AS addr_house_no, addr.road AS addr_moo,
                       addr.sub_district AS addr_sub_district, addr.district AS addr_district,
                       addr.province AS addr_province, addr.zipcode AS addr_zipcode,
                       ph.firstname_pharma AS p_firstname_pharma,
                       ph.lastname_pharma AS p_lastname_pharma,
                       ph.username_pharma AS p_username_pharma,
                       ph.store_name AS p_store_name,
                       (SELECT su.service_code FROM service_usage su
                        WHERE su.id_consult_request = p.id_consult_request LIMIT 1) AS linked_service_code
                FROM prescriptions p
                LEFT JOIN account a ON a.id_account = p.id_account
                LEFT JOIN account_address addr ON addr.id_account = p.id_account
                LEFT JOIN pharmacist_account ph ON ph.id_pharma = p.id_pharma
                ORDER BY p.created_at DESC
            `;
        } else if (auth.id_store_accounts) {
            prescriptions = await sql`
                SELECT p.*,
                       a.phone_number AS account_phone, a.firstname AS account_firstname,
                       a.lastname AS account_lastname, a.email_account AS account_email,
                       a.images_account AS account_image,
                       addr.house_no AS addr_house_no, addr.road AS addr_moo,
                       addr.sub_district AS addr_sub_district, addr.district AS addr_district,
                       addr.province AS addr_province, addr.zipcode AS addr_zipcode,
                       ph.firstname_pharma AS p_firstname_pharma,
                       ph.lastname_pharma AS p_lastname_pharma,
                       ph.username_pharma AS p_username_pharma,
                       ph.store_name AS p_store_name,
                       (SELECT su.service_code FROM service_usage su
                        WHERE su.id_consult_request = p.id_consult_request LIMIT 1) AS linked_service_code
                FROM prescriptions p
                LEFT JOIN account a ON a.id_account = p.id_account
                LEFT JOIN account_address addr ON addr.id_account = p.id_account
                LEFT JOIN pharmacist_account ph ON ph.id_pharma = p.id_pharma
                WHERE p.id_pharma IN (
                    SELECT id_pharma FROM pharmacist_account WHERE id_store = ${auth.id_store_accounts}
                )
                ORDER BY p.created_at DESC
            `;
        } else if (auth.id_pharma) {
            prescriptions = await sql`
                SELECT p.*,
                       a.phone_number AS account_phone, a.firstname AS account_firstname,
                       a.lastname AS account_lastname, a.email_account AS account_email,
                       a.images_account AS account_image,
                       addr.house_no AS addr_house_no, addr.road AS addr_moo,
                       addr.sub_district AS addr_sub_district, addr.district AS addr_district,
                       addr.province AS addr_province, addr.zipcode AS addr_zipcode,
                       ph.firstname_pharma AS p_firstname_pharma,
                       ph.lastname_pharma AS p_lastname_pharma,
                       ph.username_pharma AS p_username_pharma,
                       ph.store_name AS p_store_name,
                       (SELECT su.service_code FROM service_usage su
                        WHERE su.id_consult_request = p.id_consult_request LIMIT 1) AS linked_service_code
                FROM prescriptions p
                LEFT JOIN account a ON a.id_account = p.id_account
                LEFT JOIN account_address addr ON addr.id_account = p.id_account
                LEFT JOIN pharmacist_account ph ON ph.id_pharma = p.id_pharma
                WHERE p.id_pharma = ${auth.id_pharma}
                ORDER BY p.created_at DESC
            `;
        } else {
            prescriptions = await sql`
            SELECT p.*,
                   a.phone_number AS account_phone, a.firstname AS account_firstname,
                   a.lastname AS account_lastname, a.email_account AS account_email,
                   a.images_account AS account_image,
                   addr.house_no AS addr_house_no, addr.road AS addr_moo,
                   addr.sub_district AS addr_sub_district, addr.district AS addr_district,
                   addr.province AS addr_province, addr.zipcode AS addr_zipcode,
                   ph.firstname_pharma AS p_firstname_pharma,
                   ph.lastname_pharma AS p_lastname_pharma,
                   ph.username_pharma AS p_username_pharma,
                   ph.store_name AS p_store_name,
                   (SELECT su.service_code FROM service_usage su
                    WHERE su.id_consult_request = p.id_consult_request LIMIT 1) AS linked_service_code
            FROM prescriptions p
            LEFT JOIN account a ON a.id_account = p.id_account
            LEFT JOIN account_address addr ON addr.id_account = p.id_account
            LEFT JOIN pharmacist_account ph ON ph.id_pharma = p.id_pharma
            WHERE p.id_account = ${auth.id_account}
            ORDER BY p.created_at DESC
        `;
        }
        return attachPrescriptionSymptoms(sql, prescriptions || []);
    });

    const data = (rows || []).map(mapPrescriptionRow);
    return { status: 'success', data };
}

export async function handleAdminListAdmins(event: H3Event) {
    const auth = getAuthContext(event);
    const q = getQuery(event);
    const filter = String(q.status || 'all').trim();

    const rows = await dbQuery(async (sql) => {
        if (['pending', 'approved', 'rejected'].includes(filter)) {
            return sql`
                SELECT id_account_admin, username_account, email_account, firstname, lastname,
                       gender, old, phone_number, admin_status, is_super_admin,
                       admin_reviewed_at, admin_review_note, reviewed_by, created_at, images_account
                FROM account_admin
                WHERE admin_status = ${filter}
                  AND (is_deleted IS NULL OR is_deleted = 0)
                ORDER BY (admin_status = 'pending') DESC, created_at DESC
                LIMIT 500
            `;
        }
        return sql`
            SELECT id_account_admin, username_account, email_account, firstname, lastname,
                   gender, old, phone_number, admin_status, is_super_admin,
                   admin_reviewed_at, admin_review_note, reviewed_by, created_at, images_account
            FROM account_admin
            WHERE (is_deleted IS NULL OR is_deleted = 0)
            ORDER BY (admin_status = 'pending') DESC, created_at DESC
            LIMIT 500
        `;
    });

    if (!rows) {
        return { status: 'error', message: 'ดึงข้อมูลไม่สำเร็จ', items: [], summary: emptyAdminSummary() };
    }

    const me = auth.id_account_admin || 0;
    const summary = emptyAdminSummary();
    const items = rows.map((r) => {
        summary.all++;
        const st = String(r.admin_status || 'approved');
        if (st in summary) summary[st as keyof typeof summary]++;
        return {
            id: Number(r.id_account_admin),
            username: r.username_account,
            email: r.email_account,
            firstname: r.firstname,
            lastname: r.lastname,
            fullname: `${r.firstname || ''} ${r.lastname || ''}`.trim(),
            gender: r.gender,
            age: Number(r.old || 0),
            phone: r.phone_number,
            image: r.images_account || 'default.png',
            admin_status: st,
            is_super_admin: Number(r.is_super_admin || 0),
            reviewed_at: r.admin_reviewed_at,
            review_note: r.admin_review_note || '',
            reviewed_by: r.reviewed_by != null ? Number(r.reviewed_by) : null,
            created_at: r.created_at,
            is_me: Number(r.id_account_admin) === me,
        };
    });

    return { status: 'success', items, summary, me };
}

export async function handleAdminReviewAdmin(event: H3Event) {
    const body = await readBody(event).catch(() => ({}));
    const auth = getAuthContext(event, body as Record<string, unknown>);
    const reviewerId = parsePositiveInt(auth.id_account_admin);
    const targetId = parsePositiveInt((body as Record<string, unknown>).id);
    const action = String((body as Record<string, unknown>).action || '').trim();
    const note = String((body as Record<string, unknown>).note || '').trim();

    const validActions = ['approve', 'reject', 'revoke', 'promote', 'demote'];
    if (reviewerId <= 0) {
        return { status: 'error', message: 'กรุณาเข้าสู่ระบบในฐานะแอดมิน' };
    }
    if (targetId <= 0 || !validActions.includes(action)) {
        return { status: 'error', message: 'ข้อมูลไม่ครบหรือไม่ถูกต้อง' };
    }

    const result = await dbQuery(async (sql) => {
        const reviewerRows = await sql`
            SELECT is_super_admin, admin_status
            FROM account_admin
            WHERE id_account_admin = ${reviewerId}
              AND (is_deleted IS NULL OR is_deleted = 0)
            LIMIT 1
        `;
        const reviewer = reviewerRows[0];
        if (!reviewer || Number(reviewer.is_super_admin) !== 1 || String(reviewer.admin_status) !== 'approved') {
            return { error: 'เฉพาะ Super Admin เท่านั้นที่ทำรายการนี้ได้' };
        }

        const targetRows = await sql`
            SELECT id_account_admin, admin_status, is_super_admin
            FROM account_admin
            WHERE id_account_admin = ${targetId}
              AND (is_deleted IS NULL OR is_deleted = 0)
            LIMIT 1
        `;
        const target = targetRows[0];
        if (!target) {
            return { error: 'ไม่พบบัญชีแอดมิน' };
        }

        const targetStatus = String(target.admin_status || '');
        const targetIsSuper = Number(target.is_super_admin || 0) === 1;

        if ((action === 'revoke' || action === 'demote') && targetId === reviewerId) {
            return { error: 'ไม่สามารถดำเนินการกับบัญชีของตนเองได้' };
        }

        if (action === 'demote' && targetIsSuper) {
            const [{ n: superCount }] = await sql`
                SELECT COUNT(*)::int AS n FROM account_admin
                WHERE is_super_admin = 1
                  AND admin_status = 'approved'
                  AND (is_deleted IS NULL OR is_deleted = 0)
            `;
            if (superCount <= 1) {
                return { error: 'ต้องเหลือ Super Admin อย่างน้อย 1 คน' };
            }
        }

        const reviewNote = note || null;

        if (action === 'approve') {
            await sql`
                UPDATE account_admin SET
                    admin_status = 'approved',
                    admin_reviewed_at = NOW(),
                    admin_review_note = ${reviewNote},
                    reviewed_by = ${reviewerId}
                WHERE id_account_admin = ${targetId}
            `;
            return { message: 'อนุมัติแอดมินเรียบร้อยแล้ว' };
        }

        if (action === 'reject') {
            await sql`
                UPDATE account_admin SET
                    admin_status = 'rejected',
                    is_super_admin = 0,
                    admin_reviewed_at = NOW(),
                    admin_review_note = ${reviewNote},
                    reviewed_by = ${reviewerId}
                WHERE id_account_admin = ${targetId}
            `;
            return { message: 'ปฏิเสธคำขอเรียบร้อยแล้ว' };
        }

        if (action === 'revoke') {
            if (targetStatus !== 'approved') {
                return { error: 'เพิกถอนได้เฉพาะแอดมินที่อนุมัติแล้ว' };
            }
            if (targetIsSuper) {
                return { error: 'ไม่สามารถเพิกถอน Super Admin ได้ — ให้ปลดตำแหน่งก่อน' };
            }
            await sql`
                UPDATE account_admin SET
                    admin_status = 'rejected',
                    is_super_admin = 0,
                    admin_reviewed_at = NOW(),
                    admin_review_note = ${reviewNote},
                    reviewed_by = ${reviewerId}
                WHERE id_account_admin = ${targetId}
            `;
            return { message: 'เพิกถอนสิทธิ์แอดมินเรียบร้อยแล้ว' };
        }

        if (action === 'promote') {
            if (targetStatus !== 'approved') {
                return { error: 'ตั้ง Super Admin ได้เฉพาะแอดมินที่อนุมัติแล้ว' };
            }
            await sql`
                UPDATE account_admin SET
                    is_super_admin = 1,
                    admin_reviewed_at = NOW(),
                    admin_review_note = ${reviewNote},
                    reviewed_by = ${reviewerId}
                WHERE id_account_admin = ${targetId}
            `;
            return { message: 'ตั้งเป็น Super Admin เรียบร้อยแล้ว' };
        }

        if (action === 'demote') {
            if (!targetIsSuper) {
                return { error: 'บัญชีนี้ไม่ใช่ Super Admin' };
            }
            await sql`
                UPDATE account_admin SET
                    is_super_admin = 0,
                    admin_reviewed_at = NOW(),
                    admin_review_note = ${reviewNote},
                    reviewed_by = ${reviewerId}
                WHERE id_account_admin = ${targetId}
            `;
            return { message: 'ปลดจาก Super Admin เรียบร้อยแล้ว' };
        }

        return { error: 'การดำเนินการไม่รองรับ' };
    });

    if (!result) {
        return { status: 'error', message: 'อัปเดตไม่สำเร็จ' };
    }
    if ('error' in result) {
        return { status: 'error', message: result.error };
    }

    return { status: 'success', message: result.message };
}

export async function handleGetServiceUsage(_event: H3Event) {
    const rows = await dbQuery(async (sql) => sql`
        SELECT su.id_service_usage, su.service_code, su.id_consult_request, su.id_account, su.id_pharma,
               su.user_name, su.pharmacist_name, su.service_type, su.service_format, su.service_status,
               su.consult_method, su.booking_type, su.delivery_prepaid, su.raw_status, su.note,
               su.service_date, su.completed_at, su.created_at,
               COALESCE(
                   NULLIF(TRIM(d.store_name), ''),
                   NULLIF(TRIM(p.store_name), ''),
                   NULLIF(TRIM(sa.firstname), '')
               ) AS store_name
        FROM service_usage su
        LEFT JOIN pharmacist_account p ON p.id_pharma = su.id_pharma
        LEFT JOIN phamacy_store_details d ON d.id_store_accounts = p.id_store
        LEFT JOIN phamacy_store_accounts sa ON sa.id_store_accounts = p.id_store
        ORDER BY su.service_date DESC, su.id_service_usage DESC
        LIMIT 500
    `);

    if (!rows) {
        return { status: 'error', message: 'ไม่สามารถโหลดข้อมูลการให้บริการได้ — ตรวจสอบการเชื่อมต่อฐานข้อมูล', data: [] };
    }

    const data = rows.map((row) => ({
        id: Number(row.id_service_usage),
        service_code: row.service_code,
        user_name: row.user_name || `ผู้ใช้ #${Number(row.id_account || 0)}`,
        pharmacist_name: row.pharmacist_name || `เภสัช #${Number(row.id_pharma || 0)}`,
        store_name: String(row.store_name || '').trim(),
        service_type: row.service_type,
        service_format: row.service_format,
        service_status: row.service_status,
        consult_method: row.consult_method,
        booking_type: row.booking_type,
        delivery_prepaid: Number(row.delivery_prepaid) === 1,
        raw_status: row.raw_status,
        note: row.note,
        service_date: row.service_date,
        completed_at: row.completed_at,
    }));

    return { status: 'success', data };
}

export async function handleVerifyPharma(event: H3Event) {
    const q = getQuery(event);
    const id = Number(q.id || 0);
    const status = Number(q.status || 0);

    if (id <= 0) {
        return { status: 'error', message: 'ไม่พบรหัสเภสัชกร' };
    }
    if (status !== 1 && status !== 2) {
        return { status: 'error', message: 'สถานะไม่ถูกต้อง' };
    }

    const result = await dbQuery(async (sql) => {
        const rows = await sql`
            SELECT id_pharma, email_pharma, firstname_pharma, lastname_pharma, status_verify
            FROM pharmacist_account
            WHERE id_pharma = ${id}
            LIMIT 1
        `;
        const pharma = rows[0];
        if (!pharma) {
            return { error: 'ไม่พบเภสัชกร' };
        }

        const reviewResult = status === 1 ? 'approved' : 'rejected';
        await ensurePharmacistReviewNoticeColumns(sql);
        await sql`
            UPDATE pharmacist_account SET
                status_verify = ${status},
                platform_review_notice_at = NOW(),
                platform_review_ack_at = NULL,
                platform_review_result = ${reviewResult}
            WHERE id_pharma = ${id}
        `;

        return {
            email: String(pharma.email_pharma || ''),
            name: `${String(pharma.firstname_pharma || '').trim()} ${String(pharma.lastname_pharma || '').trim()}`.trim(),
            reviewResult,
        };
    });

    if ('error' in result) {
        return { status: 'error', message: result.error };
    }

    if (result.email) {
        void notifyRegistrationReview({
            role: 'pharmacist',
            to: result.email,
            name: result.name || 'เภสัชกร',
            result: result.reviewResult as 'approved' | 'rejected',
            origin: resolveRequestOrigin(event),
        });
    }

    const msg = status === 1 ? 'อนุมัติเภสัชกรเรียบร้อยแล้ว' : 'ปฏิเสธการสมัครเรียบร้อยแล้ว';
    return { status: 'success', message: msg };
}

export async function handleAdminReviewStore(event: H3Event) {
    const body = await readBody(event).catch(() => ({}));
    const auth = getAuthContext(event, body as Record<string, unknown>);
    const adminId = parsePositiveInt(auth.id_account_admin);
    const storeId = parsePositiveInt((body as Record<string, unknown>).id);
    const action = String((body as Record<string, unknown>).action || '').trim();
    const note = String((body as Record<string, unknown>).note || '').trim();

    if (adminId <= 0) {
        return { status: 'error', message: 'กรุณาเข้าสู่ระบบในฐานะแอดมิน' };
    }
    if (storeId <= 0 || !['approve', 'reject'].includes(action)) {
        return { status: 'error', message: 'ข้อมูลไม่ครบหรือไม่ถูกต้อง' };
    }

    const result = await dbQuery(async (sql) => {
        const adminRows = await sql`
            SELECT admin_status
            FROM account_admin
            WHERE id_account_admin = ${adminId}
              AND (is_deleted IS NULL OR is_deleted = 0)
            LIMIT 1
        `;
        if (!adminRows[0] || String(adminRows[0].admin_status) !== 'approved') {
            return { error: 'ไม่มีสิทธิ์ดำเนินการ' };
        }

        const storeRows = await sql`
            SELECT a.id_store_accounts, a.personal_email, a.firstname, a.lastname, a.admin_status,
                   d.store_name
            FROM phamacy_store_accounts a
            LEFT JOIN phamacy_store_details d ON d.id_store_accounts = a.id_store_accounts
            WHERE a.id_store_accounts = ${storeId}
              AND COALESCE(a.is_deleted, 0) = 0
            LIMIT 1
        `;
        const store = storeRows[0];
        if (!store) {
            return { error: 'ไม่พบข้อมูลร้าน' };
        }
        if (String(store.admin_status || '') !== 'pending') {
            return { error: 'ร้านนี้ไม่อยู่ในสถานะรออนุมัติ' };
        }

        const reviewResult = action === 'approve' ? 'approved' : 'rejected';
        const reviewNote = note || null;
        await ensureStoreReviewNoticeColumns(sql);
        await sql`
            UPDATE phamacy_store_accounts SET
                admin_status = ${reviewResult},
                admin_reviewed_at = NOW(),
                admin_review_note = ${reviewNote},
                platform_review_notice_at = NOW(),
                platform_review_ack_at = NULL,
                platform_review_result = ${reviewResult}
            WHERE id_store_accounts = ${storeId}
        `;

        return {
            email: String(store.personal_email || ''),
            name: `${String(store.firstname || '').trim()} ${String(store.lastname || '').trim()}`.trim()
                || String(store.store_name || 'เจ้าของร้าน'),
            reviewResult,
            reviewNote: note,
        };
    });

    if ('error' in result) {
        return { status: 'error', message: result.error };
    }

    if (result.email) {
        void notifyRegistrationReview({
            role: 'store',
            to: result.email,
            name: result.name || 'เจ้าของร้าน',
            result: result.reviewResult as 'approved' | 'rejected',
            note: result.reviewNote || undefined,
            origin: resolveRequestOrigin(event),
        });
    }

    const msg = action === 'approve' ? 'อนุมัติร้านเรียบร้อยแล้ว' : 'ปฏิเสธคำขอเรียบร้อยแล้ว';
    return { status: 'success', message: msg };
}

export async function handleGetStorePharmacists(event: H3Event) {
    const q = getQuery(event);
    const auth = getAuthContext(event);
    const storeId = Number(q.store_id || auth.id_store_accounts || 0);

    if (storeId <= 0) {
        return { status: 'error', message: 'ไม่พบรหัสร้าน' };
    }

    const [approved, pending, available] = await dbQuery(async (sql) => {
        const a = await sql`
            SELECT * FROM pharmacist_account
            WHERE id_store = ${storeId} AND status_verify = 1
            ORDER BY firstname_pharma
        `;
        const p = await sql`
            SELECT * FROM pharmacist_account
            WHERE pending_store_id = ${storeId}
            ORDER BY firstname_pharma
        `;
        const v = await sql`
            SELECT * FROM pharmacist_account
            WHERE status_verify = 1
              AND (id_store IS NULL OR id_store = 0)
              AND (pending_store_id IS NULL OR pending_store_id = 0)
            ORDER BY firstname_pharma
        `;
        return [a, p, v];
    }) || [[], [], []];

    return {
        status: 'success',
        approved: approved.map(mapStorePharmacistRow),
        pending: pending.map(mapStorePharmacistRow),
        available: available.map(mapStorePharmacistRow),
    };
}

export async function handleGetPharmacistBillingSlips(event: H3Event) {
    const q = getQuery(event);
    const auth = getAuthContext(event);
    const idPharma = parsePositiveInt(q.id_pharma ?? auth.id_pharma);

    if (idPharma <= 0) {
        return { status: 'error', message: 'ไม่พบรหัสเภสัชกร', slips: [] };
    }

    const rows = await dbQuery(async (sql) => sql`
        SELECT b.id, b.id_pharma, b.id_store, b.amount, b.slip_image, b.transfer_date, b.note,
               b.status, b.created_at, b.reviewed_at, b.reviewed_note,
               d.store_name AS detail_store_name,
               ph.store_name AS pharma_store_name
        FROM pharmacy_billing_slips b
        LEFT JOIN phamacy_store_details d ON d.id_store_accounts = b.id_store
        LEFT JOIN pharmacist_account ph ON ph.id_pharma = b.id_pharma
        WHERE b.id_pharma = ${idPharma}
        ORDER BY b.created_at DESC
        LIMIT 200
    `);

    const slips = (rows || []).map((r) => {
        let storeName = String(r.detail_store_name || '').trim();
        if (!storeName) storeName = String(r.pharma_store_name || '').trim();
        if (!storeName) storeName = `ร้าน #${Number(r.id_store || 0)}`;
        return {
            id: Number(r.id),
            id_pharma: Number(r.id_pharma),
            id_store: Number(r.id_store),
            store_name: storeName,
            amount: Number(r.amount || 0),
            slip_image: r.slip_image,
            transfer_date: r.transfer_date,
            note: r.note,
            status: r.status,
            created_at: r.created_at,
            reviewed_at: r.reviewed_at,
            reviewed_note: r.reviewed_note || '',
        };
    });

    return { status: 'success', slips };
}

export async function handleGetStoreBillingSlips(event: H3Event) {
    const q = getQuery(event);
    const auth = getAuthContext(event);
    const storeId = parsePositiveInt(q.store_id ?? auth.id_store_accounts);

    if (storeId <= 0) {
        return { status: 'error', message: 'ไม่พบรหัสร้าน', slips: [] };
    }

    const rows = await dbQuery(async (sql) => sql`
        SELECT b.*, ph.firstname_pharma, ph.lastname_pharma, ph.username_pharma
        FROM pharmacy_billing_slips b
        LEFT JOIN pharmacist_account ph ON b.id_pharma = ph.id_pharma
        WHERE b.id_store = ${storeId}
        ORDER BY b.created_at DESC
        LIMIT 200
    `);

    let totalApproved = 0;
    let countPending = 0;
    const slips = (rows || []).map((r) => {
        const amount = Number(r.amount || 0);
        if (r.status === 'approved') totalApproved += amount;
        else if (r.status === 'pending') countPending++;
        const name = `${r.firstname_pharma || ''} ${r.lastname_pharma || ''}`.trim()
            || String(r.username_pharma || '')
            || `เภสัช #${Number(r.id_pharma || 0)}`;
        return {
            id: Number(r.id),
            id_pharma: Number(r.id_pharma),
            pharmacist_name: name,
            amount,
            slip_image: r.slip_image,
            transfer_date: r.transfer_date,
            note: r.note,
            status: r.status,
            created_at: r.created_at,
            reviewed_at: r.reviewed_at,
        };
    });

    return { status: 'success', slips, total_approved: totalApproved, count_pending: countPending };
}

export async function handleGetStoreStatement(event: H3Event) {
    const q = getQuery(event);
    const auth = getAuthContext(event);
    const storeId = parsePositiveInt(q.store_id ?? auth.id_store_accounts);
    const period = String(q.period || 'all');

    if (storeId <= 0) {
        return { status: 'error', message: 'ไม่พบรหัสร้าน' };
    }

    await ensureBffSchema();

    const txRows = await dbQuery(async (sql) => {
        if (period === 'today') {
            return sql`
                SELECT id_store_transaction, tx_type, source_id, doc_no, customer_name,
                       id_pharma, pharmacist_name, amount, slip_image, tx_at
                FROM store_transactions
                WHERE id_store = ${storeId} AND tx_status = 'active'
                  AND DATE(tx_at) = CURRENT_DATE
                ORDER BY tx_at DESC LIMIT 200
            `;
        }
        if (period === 'week') {
            return sql`
                SELECT id_store_transaction, tx_type, source_id, doc_no, customer_name,
                       id_pharma, pharmacist_name, amount, slip_image, tx_at
                FROM store_transactions
                WHERE id_store = ${storeId} AND tx_status = 'active'
                  AND tx_at >= NOW() - INTERVAL '7 days'
                ORDER BY tx_at DESC LIMIT 200
            `;
        }
        if (period === 'month') {
            return sql`
                SELECT id_store_transaction, tx_type, source_id, doc_no, customer_name,
                       id_pharma, pharmacist_name, amount, slip_image, tx_at
                FROM store_transactions
                WHERE id_store = ${storeId} AND tx_status = 'active'
                  AND tx_at >= NOW() - INTERVAL '30 days'
                ORDER BY tx_at DESC LIMIT 200
            `;
        }
        return sql`
            SELECT id_store_transaction, tx_type, source_id, doc_no, customer_name,
                   id_pharma, pharmacist_name, amount, slip_image, tx_at
            FROM store_transactions
            WHERE id_store = ${storeId} AND tx_status = 'active'
            ORDER BY tx_at DESC LIMIT 200
        `;
    });

    let incomePrescriptions = 0;
    let incomeSlips = 0;
    const transactions = (txRows || []).map((r) => {
        const amount = Number(r.amount || 0);
        const type = String(r.tx_type || 'prescription');
        if (type === 'slip') incomeSlips += amount;
        else incomePrescriptions += amount;
        return {
            type,
            id: Number(r.source_id || 0),
            doc_no: r.doc_no,
            patient_name: r.customer_name,
            amount,
            pharmacist_name: String(r.pharmacist_name || '').trim(),
            created_at: r.tx_at,
            slip_image: r.slip_image,
        };
    });

    const dayLabels: Record<string, string> = {
        Mon: 'จันทร์', Tue: 'อังคาร', Wed: 'พุธ', Thu: 'พฤหัสบดี',
        Fri: 'ศุกร์', Sat: 'เสาร์', Sun: 'อาทิตย์',
    };
    const daysOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const scheduleRows = await dbQuery(async (sql) => sql`
        SELECT day_of_week, open_time, close_time, is_open FROM store_schedule WHERE id_store = ${storeId}
    `);
    const byDay: Record<string, Record<string, unknown>> = {};
    for (const r of scheduleRows || []) byDay[String(r.day_of_week)] = r;
    const schedule = daysOrder.map((code) => {
        const r = byDay[code] || { day_of_week: code, open_time: '08:00:00', close_time: '20:00:00', is_open: 1 };
        return {
            day_of_week: code,
            day_label: dayLabels[code] || code,
            open_time: String(r.open_time || '').slice(0, 5),
            close_time: String(r.close_time || '').slice(0, 5),
            is_open: Number(r.is_open) === 1,
        };
    });

    return {
        status: 'success',
        income_total: incomePrescriptions + incomeSlips,
        income_prescriptions: incomePrescriptions,
        income_slips: incomeSlips,
        tx_count: transactions.length,
        transactions,
        schedule,
    };
}

export async function handleGetPharmaProfile(event: H3Event) {
    const auth = getAuthContext(event);
    const id = auth.id_pharma;

    if (!id) {
        return { status: 'error', message: 'กรุณาเข้าสู่ระบบในฐานะเภสัชกร' };
    }

    const row = await dbQuery(async (sql) => {
        const rows = await sql`SELECT * FROM pharmacist_account WHERE id_pharma = ${id} LIMIT 1`;
        return rows[0];
    });

    if (!row) {
        return { status: 'error', message: 'ไม่พบข้อมูลเภสัชกร' };
    }

    const stores = await dbQuery(async (sql) => sql`
        SELECT a.id_store_accounts AS id, COALESCE(NULLIF(TRIM(d.store_name), ''), a.firstname, a.username) AS name
        FROM phamacy_store_accounts a
        LEFT JOIN phamacy_store_details d ON d.id_store_accounts = a.id_store_accounts
        WHERE COALESCE(a.is_deleted, 0) = 0
          AND (a.admin_status IS NULL OR a.admin_status = 'approved')
        ORDER BY name
    `);

    let currentStoreName = '';
    let pendingStoreName = '';
    const storePayment = {
        bank_name: '',
        bank_account_name: '',
        bank_account_number: '',
        qr_payment_url: '',
    };

    if (row.id_store) {
        const det = await dbQuery(async (sql) => sql`
            SELECT store_name, bank_name, bank_account_name, bank_account_number, qr_payment_file
            FROM phamacy_store_details WHERE id_store_accounts = ${Number(row.id_store)} LIMIT 1
        `);
        if (det?.[0]) {
            currentStoreName = String(det[0].store_name || '');
            storePayment.bank_name = String(det[0].bank_name || '');
            storePayment.bank_account_name = String(det[0].bank_account_name || '');
            storePayment.bank_account_number = String(det[0].bank_account_number || '');
            if (det[0].qr_payment_file) {
                storePayment.qr_payment_url = `uploads/qr_payment/${det[0].qr_payment_file}`;
            }
        }
    }

    if (row.pending_store_id) {
        const pendingDet = await dbQuery(async (sql) => sql`
            SELECT store_name
            FROM phamacy_store_details WHERE id_store_accounts = ${Number(row.pending_store_id)} LIMIT 1
        `);
        if (pendingDet?.[0]) {
            pendingStoreName = String(pendingDet[0].store_name || '');
        }
    }

    return {
        status: 'success',
        data: {
            id_pharma: Number(row.id_pharma),
            username_pharma: row.username_pharma,
            firstname_pharma: row.firstname_pharma,
            lastname_pharma: row.lastname_pharma,
            age_pharma: row.age_pharma,
            gender_pharma: row.gender_pharma,
            phone_pharma: row.phone_pharma,
            email_pharma: row.email_pharma,
            work_time: row.work_time || '',
            schedules: parseWorkTimeSchedules(String(row.work_time || '')),
            images_pharma: row.images_pharma,
            license_image: resolvePharmacistLicenseFile(row.license_image),
            license_url: pharmacistLicensePath(row.license_image),
            id_store: row.id_store != null ? Number(row.id_store) : null,
            pending_store_id: row.pending_store_id != null ? Number(row.pending_store_id) : null,
            status_verify: Number(row.status_verify || 0),
            current_store_name: currentStoreName,
            store_payment: storePayment,
            pending_store_name: pendingStoreName,
            stores: (stores || []).map((s) => ({ id: Number(s.id), name: s.name })),
        },
    };
}

export async function handleGetStoreProfile(event: H3Event) {
    const auth = getAuthContext(event);
    const id = auth.id_store_accounts;

    if (!id) {
        return { status: 'error', message: 'กรุณาเข้าสู่ระบบในฐานะเจ้าของร้านยา' };
    }

    const acc = await dbQuery(async (sql) => {
        const rows = await sql`SELECT * FROM phamacy_store_accounts WHERE id_store_accounts = ${id} LIMIT 1`;
        return rows[0];
    });

    if (!acc) {
        return { status: 'error', message: 'ไม่พบข้อมูลบัญชีร้านยา' };
    }

    let det = await dbQuery(async (sql) => {
        const rows = await sql`SELECT * FROM phamacy_store_details WHERE id_store_accounts = ${id} LIMIT 1`;
        return rows[0];
    });

    if (!det) {
        await dbQuery(async (sql) => sql`
            INSERT INTO phamacy_store_details (id_store_accounts, store_name, house_no, sub_district, district, province, zipcode, store_phone, store_email)
            VALUES (${id}, 'ร้านยา', '-', '-', '-', '-', '00000', '-', ${acc.personal_email || '-'})
        `);
        const rows = await dbQuery(async (sql) => sql`SELECT * FROM phamacy_store_details WHERE id_store_accounts = ${id} LIMIT 1`);
        det = rows?.[0];
    }

    const schedules = await dbQuery(async (sql) => sql`
        SELECT day_of_week, open_time, close_time, is_open FROM store_schedule WHERE id_store = ${id}
    `);

    const dayLabels: Record<string, string> = {
        Mon: 'จันทร์', Tue: 'อังคาร', Wed: 'พุธ', Thu: 'พฤหัสบดี',
        Fri: 'ศุกร์', Sat: 'เสาร์', Sun: 'อาทิตย์',
    };

    const licenseFile = resolveStoreLicenseFile(acc.license_file);
    const profileFile = resolveProfileImageFile(acc.profile_store_account);
    const qrPaymentFile = String(det?.qr_payment_file || '');

    return {
        status: 'success',
        data: {
            id: id,
            id_store_accounts: id,
            username: acc.username ?? '',
            firstname: acc.firstname ?? '',
            lastname: acc.lastname ?? '',
            personal_phone: acc.personal_phone ?? '',
            personal_email: acc.personal_email ?? '',
            license_file: licenseFile,
            license_url: storeLicensePath(acc.license_file),
            profile_file: profileFile,
            profile_url: `uploads/store_profiles/${profileFile}`,
            details: {
                store_name: det?.store_name ?? '',
                house_no: det?.house_no ?? '',
                road: det?.road ?? '',
                sub_district: det?.sub_district ?? '',
                district: det?.district ?? '',
                province: det?.province ?? '',
                zipcode: det?.zipcode ?? '',
                store_phone: det?.store_phone ?? '',
                store_email: det?.store_email ?? '',
                google_maps_url: det?.google_maps_url ?? '',
                latitude: det?.latitude ?? null,
                longitude: det?.longitude ?? null,
                bank_name: det?.bank_name ?? '',
                bank_account_name: det?.bank_account_name ?? '',
                bank_account_number: det?.bank_account_number ?? '',
                qr_payment_file: qrPaymentFile,
                qr_payment_url: qrPaymentFile ? `uploads/qr_payment/${qrPaymentFile}` : '',
            },
            schedules: (schedules || []).map((r) => ({
                day_of_week: r.day_of_week,
                day_label: dayLabels[String(r.day_of_week)] || r.day_of_week,
                open_time: String(r.open_time || '').slice(0, 5),
                close_time: String(r.close_time || '').slice(0, 5),
                is_open: Number(r.is_open) === 1,
            })),
        },
    };
}

export async function handleGetAccountAddress(event: H3Event) {
    const body = event.method === 'POST' ? await readBody(event).catch(() => ({})) : {};
    const auth = getAuthContext(event, body as Record<string, unknown>);
    const id = auth.id_account || Number(getQuery(event).id_account || 0);

    if (!id) {
        return { status: 'error', message: 'ไม่พบบัญชีผู้ใช้งาน', address: null };
    }

    const row = await dbQuery(async (sql) => sql`
        SELECT a.id_address, a.id_account, a.house_no, a.road, a.sub_district, a.district,
               a.province, a.zipcode, a.created_at, a.updated_at,
               acc.firstname, acc.lastname, acc.phone_number, acc.email_account
        FROM account_address a
        INNER JOIN account acc ON acc.id_account = a.id_account
        WHERE a.id_account = ${id}
        LIMIT 1
    `);

    if (!row?.[0]) {
        return { status: 'success', has_address: false, address: null };
    }

    const r = row[0];
    return {
        status: 'success',
        has_address: true,
        address: {
            id_address: Number(r.id_address),
            id_account: Number(r.id_account),
            house_no: r.house_no,
            road: r.road,
            sub_district: r.sub_district,
            district: r.district,
            province: r.province,
            zipcode: r.zipcode,
            firstname: r.firstname,
            lastname: r.lastname,
            phone_number: r.phone_number,
            email_account: r.email_account,
        },
    };
}

export async function handleSaveAccountAddress(event: H3Event) {
    const fields = await readRequestFields(event);
    const auth = getAuthContext(event, fields);
    let idAccount = Number(fields.id_account || auth.id_account || 0);

    const houseNo = String(fields.house_no || '').trim();
    const road = String(fields.road || fields.moo || '').trim();
    const subDistrict = String(fields.sub_district || '').trim();
    const district = String(fields.district || '').trim();
    const province = String(fields.province || '').trim();
    const zipcode = String(fields.zipcode || '').trim();

    const required: [string, string][] = [
        [houseNo, 'บ้านเลขที่'],
        [subDistrict, 'ตำบล'],
        [district, 'อำเภอ'],
        [province, 'จังหวัด'],
        [zipcode, 'รหัสไปรษณีย์'],
    ];
    for (const [val, label] of required) {
        if (!val) {
            return { status: 'error', message: `กรุณากรอก ${label}` };
        }
    }

    if (idAccount <= 0) {
        return { status: 'error', message: 'ไม่พบบัญชีผู้ใช้งาน (id_account)' };
    }

    const ok = await dbQuery(async (sql) => {
        const acc = await sql`SELECT id_account FROM account WHERE id_account = ${idAccount} LIMIT 1`;
        if (!acc[0]) {
            return { error: 'ไม่พบบัญชีผู้ใช้งานนี้ในระบบ' };
        }

        await sql`
            INSERT INTO account_address
                (id_account, house_no, road, sub_district, district, province, zipcode)
            VALUES
                (${idAccount}, ${houseNo}, ${road}, ${subDistrict}, ${district}, ${province}, ${zipcode})
            ON CONFLICT (id_account) DO UPDATE SET
                house_no = EXCLUDED.house_no,
                road = EXCLUDED.road,
                sub_district = EXCLUDED.sub_district,
                district = EXCLUDED.district,
                province = EXCLUDED.province,
                zipcode = EXCLUDED.zipcode,
                updated_at = NOW()
        `;
        return { success: true };
    });

    if (!ok) {
        return { status: 'error', message: 'บันทึกที่อยู่ไม่สำเร็จ — ตรวจสอบ DATABASE_URL' };
    }
    if ('error' in ok) {
        return { status: 'error', message: ok.error };
    }

    const isLoggedIn = auth.id_account != null && auth.id_account > 0;
    return {
        status: 'success',
        message: 'บันทึกที่อยู่เรียบร้อย',
        redirect: isLoggedIn ? '/user/profile' : '/auth/login-user',
    };
}

export async function handleUpdateUserProfile(event: H3Event) {
    const { fields, files } = await readMultipartRequest(event);
    const auth = getAuthContext(event, fields);

    const useAdmin = auth.id_account_admin != null && auth.id_account_admin > 0;
    const id = useAdmin ? auth.id_account_admin! : auth.id_account;

    if (!id) {
        return { status: 'error', message: 'กรุณาเข้าสู่ระบบ' };
    }

    const phone = String(fields.phone_number || '').trim();
    const disease = String(fields.personal_disease || '').trim();
    const passwordNew = String(fields.password_new || '');
    const passwordConfirm = String(fields.password_confirm || '');

    const dbOk = await dbQuery(async (sql) => {
        if (useAdmin) {
            if (phone) {
                await sql`UPDATE account_admin SET phone_number = ${phone} WHERE id_account_admin = ${id}`;
            }
        } else {
            await sql`
                UPDATE account
                SET phone_number = ${phone}, personal_disease = ${disease}
                WHERE id_account = ${id}
            `;
        }

        if (passwordNew && passwordNew === passwordConfirm) {
            const salt = randomBytes(16).toString('hex');
            const hash = await hashPassword(passwordNew, salt);
            if (useAdmin) {
                await sql`
                    UPDATE account_admin
                    SET password_account = ${hash}, salt_account = ${salt}
                    WHERE id_account_admin = ${id}
                `;
            } else {
                await sql`
                    UPDATE account
                    SET password_account = ${hash}, salt_account = ${salt}
                    WHERE id_account = ${id}
                `;
            }
        }
        return true;
    });

    if (!dbOk) {
        return { status: 'error', message: 'อัปเดตไม่สำเร็จ — ตรวจสอบ DATABASE_URL' };
    }

    let newImage: string | null = null;
    const filePart = files.images_account;
    if (filePart?.data?.length) {
        const ext = (filePart.filename || '').split('.').pop()?.toLowerCase() || '';
        const allowed = ['jpg', 'jpeg', 'png', 'webp'];
        if (!allowed.includes(ext)) {
            return { status: 'error', message: 'รองรับเฉพาะไฟล์ JPG, PNG หรือ WEBP เท่านั้น' };
        }

        const prefix = useAdmin ? 'admin_' : 'user_';
        newImage = `${prefix}${id}_${Date.now()}_${randomBytes(4).toString('hex')}.${ext}`;

        const oldRow = await dbQuery(async (sql) => {
            if (useAdmin) {
                const rows = await sql`
                    SELECT images_account FROM account_admin WHERE id_account_admin = ${id} LIMIT 1
                `;
                return rows[0];
            }
            const rows = await sql`SELECT images_account FROM account WHERE id_account = ${id} LIMIT 1`;
            return rows[0];
        });

        const oldFile = String(oldRow?.images_account || '');
        if (oldFile && !['default.png', 'default.jpg'].includes(oldFile)) {
            await deleteMediaFile('images_account', oldFile);
        }

        await uploadMediaFile('images_account', newImage, filePart.data, mimeFromExt(ext));

        await dbQuery(async (sql) => {
            if (useAdmin) {
                await sql`UPDATE account_admin SET images_account = ${newImage} WHERE id_account_admin = ${id}`;
            } else {
                await sql`UPDATE account SET images_account = ${newImage} WHERE id_account = ${id}`;
            }
        });
    }

    const userRow = await dbQuery(async (sql) => {
        if (useAdmin) {
            const rows = await sql`
                SELECT username_account, images_account FROM account_admin WHERE id_account_admin = ${id} LIMIT 1
            `;
            return rows[0];
        }
        const rows = await sql`
            SELECT username_account, images_account, role_account FROM account WHERE id_account = ${id} LIMIT 1
        `;
        return rows[0];
    });

    const roleRaw = useAdmin ? 'admin' : String(userRow?.role_account || 'member');
    const role = roleRaw === 'member' ? 'user' : roleRaw;

    return {
        status: 'success',
        message: 'อัปเดตข้อมูลสำเร็จ',
        new_image: newImage,
        user: {
            id,
            id_account: id,
            id_account_admin: useAdmin ? id : null,
            username: userRow?.username_account || '',
            role,
            image: userRow?.images_account || 'default.png',
        },
        redirect: role === 'admin' ? '/admin/profile' : '/user/profile',
    };
}

export async function handleGetUserProfileBff(event: H3Event) {
    const auth = getAuthContext(event);
    const q = getQuery(event);
    const id = auth.id_account || auth.id_account_admin || Number(q.id_account || q.id_account_admin || 0);

    if (id <= 0) {
        return { status: 'error', message: 'กรุณาเข้าสู่ระบบ' };
    }

    const row = await dbQuery(async (sql) => {
        const accountRows = await sql`SELECT * FROM account WHERE id_account = ${id} LIMIT 1`;
        if (accountRows[0]) return accountRows[0];
        const adminRows = await sql`SELECT * FROM account_admin WHERE id_account_admin = ${id} LIMIT 1`;
        return adminRows[0] || null;
    });

    if (!row) {
        return { status: 'error', message: 'ไม่พบข้อมูลผู้ใช้' };
    }

    return {
        status: 'success',
        data: {
            id_account: Number(row.id_account || row.id_account_admin || id),
            username_account: row.username_account,
            firstname: row.firstname,
            lastname: row.lastname,
            gender: row.gender,
            old: row.old,
            height: row.height || '',
            weight: row.weight || '',
            phone_number: row.phone_number,
            email_account: row.email_account,
            personal_disease: row.personal_disease || '',
            images_account: row.images_account,
            role_account: row.role_account || (auth.role === 'admin' ? 'admin' : 'user'),
        },
    };
}

function mapUserRow(data: Record<string, unknown>) {
    return {
        id: Number(data.id_account),
        username: data.username_account,
        firstname: data.firstname,
        lastname: data.lastname,
        email: data.email_account,
        gender: data.gender,
        old: data.old,
        height: data.height,
        weight: data.weight,
        phone: data.phone_number,
        personal_disease: data.personal_disease,
        house_no: data.house_no ?? '',
        road: data.road ?? '',
        sub_district: data.sub_district ?? '',
        district: data.district ?? '',
        province: data.province ?? '',
        zipcode: data.zipcode ?? '',
        image: data.images_account ? data.images_account : 'default.png',
        is_deleted: Number(data.is_deleted || 0),
        deleted_at: data.deleted_at ?? null,
        deleted_by: data.deleted_by ?? null,
        deleted_by_role: data.deleted_by_role ?? null,
    };
}

function mapPharmaAdminRow(data: Record<string, unknown>) {
    return {
        id: Number(data.id_pharma),
        username: data.username_pharma,
        firstname: data.firstname_pharma,
        lastname: data.lastname_pharma,
        email: data.email_pharma,
        gender: data.gender_pharma,
        age: data.age_pharma,
        height: data.height_pharma,
        weight: data.weight_pharma,
        phone: data.phone_pharma ?? '',
        work_time: data.work_time || 'ไม่ได้ระบุ',
        image: data.images_pharma ? data.images_pharma : 'default.png',
        license_image: data.license_image,
        status_verify: Number(data.status_verify),
        store_name: data.store_name ?? '',
        work_place: data.store_name ?? '',
        is_deleted: Number(data.is_deleted || 0),
        deleted_at: data.deleted_at ?? null,
        deleted_by: data.deleted_by ?? null,
        deleted_by_role: data.deleted_by_role ?? null,
    };
}

function mapStoreRow(row: Record<string, unknown>) {
    const address = [row.house_no, row.road, row.sub_district, row.district, row.province, row.zipcode]
        .filter(Boolean)
        .join(' ');
    return {
        id: Number(row.id),
        username: row.username ?? '',
        firstname: row.firstname ?? '',
        lastname: row.lastname ?? '',
        personal_phone: row.personal_phone ?? '',
        personal_email: row.personal_email ?? '',
        license_file: resolveStoreLicenseFile(row.license_file),
        status: Number(row.status || 0),
        admin_status: row.admin_status ?? 'approved',
        admin_reviewed_at: row.admin_reviewed_at ?? null,
        admin_review_note: row.admin_review_note ?? '',
        created_at: row.created_at ?? null,
        store_name: row.store_name ?? '',
        house_no: row.house_no ?? '',
        road: row.road ?? '',
        sub_district: row.sub_district ?? '',
        district: row.district ?? '',
        province: row.province ?? '',
        zipcode: row.zipcode ?? '',
        store_phone: row.store_phone ?? '',
        store_email: row.store_email ?? '',
        google_maps_url: row.google_maps_url ?? '',
        latitude: row.latitude ?? null,
        longitude: row.longitude ?? null,
        bank_name: row.bank_name ?? '',
        bank_account_name: row.bank_account_name ?? '',
        bank_account_number: row.bank_account_number ?? '',
        qr_payment_file: row.qr_payment_file ?? '',
        qr_payment_url: row.qr_payment_file ? `uploads/qr_payment/${row.qr_payment_file}` : '',
        address,
        is_deleted: Number(row.is_deleted || 0),
        deleted_at: row.deleted_at ?? null,
        deleted_by: row.deleted_by ?? null,
        deleted_by_role: row.deleted_by_role ?? null,
    };
}

async function attachPrescriptionSymptoms(
    sql: ReturnType<typeof useDb>,
    prescriptions: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
    if (!prescriptions.length) return prescriptions;

    const consultIds = [
        ...new Set(
            prescriptions
                .map((row) => Number(row.id_consult_request || 0))
                .filter((id) => id > 0),
        ),
    ];
    if (!consultIds.length) return prescriptions;

    try {
        const symptomRows = await sql`
            SELECT DISTINCT ON (cr.id) cr.id AS consult_id, ch.symptom_name
            FROM consult_requests cr
            INNER JOIN chat_history ch
              ON ch.id_account = cr.id_account AND ch.session_id = cr.bot_session_id
            WHERE cr.id IN ${sql(consultIds)}
              AND ch.symptom_name IS NOT NULL
              AND ch.symptom_name <> ''
              AND COALESCE(ch.is_deleted, 0) = 0
            ORDER BY cr.id, ch.created_at ASC, ch.id ASC
        `;

        const symptomMap = new Map<number, string>();
        for (const row of symptomRows) {
            symptomMap.set(Number(row.consult_id), String(row.symptom_name || '').trim());
        }

        return prescriptions.map((row) => {
            const linked = symptomMap.get(Number(row.id_consult_request || 0)) || '';
            return linked ? { ...row, linked_symptom_name: linked } : row;
        });
    } catch (err) {
        console.warn('[attachPrescriptionSymptoms]', err);
        return prescriptions;
    }
}

function mapPrescriptionRow(r: Record<string, unknown>) {
    const pharmaFn = String(r.p_firstname_pharma || '').trim();
    const pharmaLn = String(r.p_lastname_pharma || '').trim();
    const pharmaFullName = `${pharmaFn} ${pharmaLn}`.trim();
    let accountFullName = `${r.account_firstname || ''} ${r.account_lastname || ''}`.trim();
    if (!accountFullName && r.patient_name) {
        accountFullName = String(r.patient_name).trim();
    }
    const displayPatientName = accountFullName || String(r.patient_name || '').trim();

    const cid = Number(r.id_consult_request || 0);
    let serviceCode = String(r.linked_service_code || '').trim();
    if (!serviceCode && cid > 0) {
        serviceCode = `SRV-${String(cid).padStart(3, '0')}`;
    }

    const hasAddr = Boolean(r.addr_house_no);
    let patientAddress = '';
    let patientAddressShort = '';
    if (hasAddr) {
        const parts = [r.addr_house_no];
        if (r.addr_moo && r.addr_moo !== '-' && r.addr_moo !== 'ไม่มี') {
            parts.push(`ถ.${r.addr_moo}`);
        }
        if (r.addr_sub_district) parts.push(`ต.${r.addr_sub_district}`);
        if (r.addr_district) parts.push(`อ.${r.addr_district}`);
        if (r.addr_province) parts.push(`จ.${r.addr_province}`);
        if (r.addr_zipcode) parts.push(String(r.addr_zipcode));
        patientAddress = parts.join(' ');
        patientAddressShort = `${r.addr_sub_district || ''} ${r.addr_district || ''} ${r.addr_province || ''}`.trim();
    }

    return {
        ...r,
        id: Number(r.id),
        id_account: Number(r.id_account || 0),
        doctor_name: pharmaFullName ? `ภก. ${pharmaFullName}` : String(r.doctor_name || '').trim(),
        firstname_pharma: pharmaFn,
        lastname_pharma: pharmaLn,
        pharmacist_name: pharmaFullName,
        pharmacist_username: String(r.p_username_pharma || '').trim(),
        store_name: String(r.p_store_name || '').trim(),
        work_place: String(r.p_store_name || '').trim(),
        symptom_name: String(r.linked_symptom_name || '').trim() || 'ทั่วไป',
        service_code: serviceCode,
        patient_phone: String(r.account_phone || '').trim(),
        patient_name: displayPatientName,
        patient_full_name: accountFullName || displayPatientName,
        patient_email: String(r.account_email || '').trim(),
        patient_image: String(r.account_image || '').trim(),
        patient_address: patientAddress,
        patient_address_short: patientAddressShort,
    };
}

function mapStorePharmacistRow(row: Record<string, unknown>) {
    const first = String(row.firstname_pharma || '').trim();
    const last = String(row.lastname_pharma || '').trim();
    const full = `${first} ${last}`.trim() || String(row.username_pharma || '') || `เภสัช #${Number(row.id_pharma || 0)}`;
    return {
        id_pharma: Number(row.id_pharma),
        username: row.username_pharma,
        firstname: first,
        lastname: last,
        fullname: full,
        email: row.email_pharma ?? '',
        phone: row.phone_pharma ?? '',
        gender: row.gender_pharma ?? '',
        age: Number(row.age_pharma || 0),
        work_time: row.work_time ?? '',
        license_image: resolvePharmacistLicenseFile(row.license_image),
        license_exists: true,
        images_pharma: row.images_pharma ?? 'default.png',
        status_verify: Number(row.status_verify || 0),
        id_store: row.id_store != null ? Number(row.id_store) : null,
        pending_store_id: row.pending_store_id != null ? Number(row.pending_store_id) : null,
    };
}

function parseWorkTimeSchedules(workTimeStr: string) {
    const schedules: { day: string; start: string; end: string }[] = [];
    if (workTimeStr) {
        for (const item of workTimeStr.split(', ')) {
            const m = item.trim().match(/^(.*) \((.*)-(.*)\)$/);
            if (m) schedules.push({ day: m[1], start: m[2], end: m[3] });
        }
    }
    if (schedules.length === 0) {
        schedules.push({ day: 'Monday', start: '08:00', end: '17:00' });
    }
    return schedules;
}

function emptyAdminSummary() {
    return { all: 0, pending: 0, approved: 0, rejected: 0 };
}
