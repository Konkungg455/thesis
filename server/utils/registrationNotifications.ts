import type { H3Event } from 'h3';
import type postgres from 'postgres';
import {
    buildAdminNewRegistrationEmailHtml,
    buildRegistrationReviewEmailHtml,
    type RegistrationReviewResult,
} from './emailTemplates';
import { sendRichEmail } from './mail';
import { resolveRequestOrigin } from './requestOrigin';
import { getAuthContext } from './bff/sessionContext';

type RegistrationRole = 'pharmacist' | 'store';

function reviewNoticePending(row: Record<string, unknown>): boolean {
    const notice = row.platform_review_notice_at;
    if (notice == null || notice === '') return false;
    const ack = row.platform_review_ack_at;
    if (ack == null || ack === '') return true;
    return new Date(String(ack)).getTime() < new Date(String(notice)).getTime();
}

export async function ensurePharmacistReviewNoticeColumns(sql: ReturnType<typeof postgres>) {
    try {
        await sql.unsafe(`
            ALTER TABLE pharmacist_account
            ADD COLUMN IF NOT EXISTS platform_review_notice_at TIMESTAMP NULL DEFAULT NULL
        `);
        await sql.unsafe(`
            ALTER TABLE pharmacist_account
            ADD COLUMN IF NOT EXISTS platform_review_ack_at TIMESTAMP NULL DEFAULT NULL
        `);
        await sql.unsafe(`
            ALTER TABLE pharmacist_account
            ADD COLUMN IF NOT EXISTS platform_review_result VARCHAR(20) NULL DEFAULT NULL
        `);
    } catch {
        // columns may already exist
    }
}

export async function ensureStoreReviewNoticeColumns(sql: ReturnType<typeof postgres>) {
    try {
        await sql.unsafe(`
            ALTER TABLE phamacy_store_accounts
            ADD COLUMN IF NOT EXISTS admin_status VARCHAR(20) NULL DEFAULT 'approved'
        `);
        await sql.unsafe(`
            ALTER TABLE phamacy_store_accounts
            ADD COLUMN IF NOT EXISTS admin_reviewed_at TIMESTAMP NULL DEFAULT NULL
        `);
        await sql.unsafe(`
            ALTER TABLE phamacy_store_accounts
            ADD COLUMN IF NOT EXISTS admin_review_note TEXT NULL DEFAULT NULL
        `);
        await sql.unsafe(`
            ALTER TABLE phamacy_store_accounts
            ADD COLUMN IF NOT EXISTS platform_review_notice_at TIMESTAMP NULL DEFAULT NULL
        `);
        await sql.unsafe(`
            ALTER TABLE phamacy_store_accounts
            ADD COLUMN IF NOT EXISTS platform_review_ack_at TIMESTAMP NULL DEFAULT NULL
        `);
        await sql.unsafe(`
            ALTER TABLE phamacy_store_accounts
            ADD COLUMN IF NOT EXISTS platform_review_result VARCHAR(20) NULL DEFAULT NULL
        `);
    } catch {
        // columns may already exist
    }
}

async function fetchSuperAdminNotifyEmails(): Promise<string[]> {
    const fromEnv = String(process.env.ADMIN_NOTIFY_EMAIL || '')
        .split(/[,;]/)
        .map((v) => v.trim())
        .filter(Boolean);

    const rows = await dbQuery(async (sql) => sql`
        SELECT email_account
        FROM account_admin
        WHERE admin_status = 'approved'
          AND COALESCE(is_super_admin, 0) = 1
          AND (is_deleted IS NULL OR is_deleted = 0)
          AND email_account IS NOT NULL
          AND TRIM(email_account) <> ''
    `);
    const fromDb = [...new Set((rows || []).map((r) => String(r.email_account || '').trim()).filter(Boolean))];
    if (fromDb.length) return fromDb;
    if (fromEnv.length) return [...new Set(fromEnv)];
    return [];
}

function adminReviewUrl(origin: string, role: RegistrationRole): string {
    const base = origin || 'http://localhost:3001';
    return role === 'pharmacist'
        ? `${base}/admin/continue_pharmacist`
        : `${base}/admin/phacmacy_shop`;
}

function loginUrlForRole(origin: string, role: RegistrationRole): string {
    const base = origin || 'http://localhost:3001';
    return role === 'pharmacist'
        ? `${base}/auth/login-pharmacist`
        : `${base}/auth/login-store`;
}

export async function notifyAdminsNewRegistration(options: {
    role: RegistrationRole;
    id: number;
    name: string;
    email: string;
    username?: string;
    phone?: string;
    storeName?: string;
    origin?: string;
}) {
    try {
        const admins = await fetchSuperAdminNotifyEmails();
        if (!admins.length) {
            console.warn('[registration] no super admin emails for new registration alert');
            return;
        }

        const built = buildAdminNewRegistrationEmailHtml({
            role: options.role,
            name: options.name,
            email: options.email,
            username: options.username,
            phone: options.phone,
            storeName: options.storeName,
            id: options.id,
            adminUrl: adminReviewUrl(options.origin || '', options.role),
        });

        await Promise.all(admins.map((to) => sendRichEmail({
            to,
            subject: built.subject,
            html: built.html,
            text: built.text,
            fromName: 'Telebot Pharmacy',
        })));
    } catch (err) {
        console.error('[registration] notifyAdminsNewRegistration failed:', err);
    }
}

export async function notifyRegistrationReview(options: {
    role: RegistrationRole;
    to: string;
    name: string;
    result: RegistrationReviewResult;
    note?: string;
    origin?: string;
}) {
    try {
        const built = buildRegistrationReviewEmailHtml({
            role: options.role,
            recipientName: options.name,
            result: options.result,
            note: options.note,
            loginUrl: loginUrlForRole(options.origin || '', options.role),
        });

        await sendRichEmail({
            to: options.to,
            toName: options.name,
            subject: built.subject,
            html: built.html,
            text: built.text,
            fromName: 'Telebot Pharmacy',
        });
    } catch (err) {
        console.error('[registration] notifyRegistrationReview failed:', err);
    }
}

export async function notifyAdminsNewPharmacistFromTemp(
    id: number,
    u: Record<string, unknown>,
    email: string,
    event?: H3Event,
) {
    const name = `${String(u.firstname_pharma || '').trim()} ${String(u.lastname_pharma || '').trim()}`.trim() || String(u.username_pharma || '');
    void notifyAdminsNewRegistration({
        role: 'pharmacist',
        id,
        name,
        email: String(u.email_pharma || email),
        username: String(u.username_pharma || ''),
        phone: String(u.phone_pharma || ''),
        storeName: u.store_name ? String(u.store_name) : undefined,
        origin: resolveRequestOrigin(event),
    });
}

export async function notifyAdminsNewStoreFromTemp(
    id: number,
    u: Record<string, unknown>,
    email: string,
    event?: H3Event,
) {
    const account = (u.account || {}) as Record<string, unknown>;
    const details = (u.details || {}) as Record<string, unknown>;
    const name = `${String(account.firstname || '').trim()} ${String(account.lastname || '').trim()}`.trim() || String(account.username || '');
    void notifyAdminsNewRegistration({
        role: 'store',
        id,
        name,
        email: String(account.personal_email || email),
        username: String(account.username || ''),
        phone: String(account.personal_phone || ''),
        storeName: String(details.store_name || ''),
        origin: resolveRequestOrigin(event),
    });
}

export async function handleGetPharmaRegistrationNotice(event: H3Event) {
    const auth = getAuthContext(event);
    const pId = auth.id_pharma || 0;
    if (pId <= 0) {
        return { status: 'error', message: 'ไม่ใช่บัญชีเภสัชกร' };
    }

    const row = await dbQuery(async (sql) => {
        await ensurePharmacistReviewNoticeColumns(sql);
        const rows = await sql`
            SELECT status_verify, platform_review_notice_at, platform_review_ack_at,
                   platform_review_result
            FROM pharmacist_account
            WHERE id_pharma = ${pId}
            LIMIT 1
        `;
        return rows[0] as Record<string, unknown> | undefined;
    });

    if (!row) {
        return { status: 'error', message: 'ไม่พบข้อมูล' };
    }

    const pending = reviewNoticePending(row);
    const result = String(row.platform_review_result || '');
    const approved = result === 'approved' || Number(row.status_verify) === 1;

    return {
        status: 'success',
        notice_pending: pending,
        result: result || (Number(row.status_verify) === 2 ? 'rejected' : ''),
        approved,
        message: approved
            ? 'บัญชีเภสัชกรของคุณได้รับการอนุมัติจากผู้ดูแลระบบแล้ว'
            : 'คำขอสมัครเภสัชกรของคุณไม่ได้รับการอนุมัติ',
        review_note: '',
    };
}

export async function handleGetStoreRegistrationNotice(event: H3Event) {
    const auth = getAuthContext(event);
    const storeId = auth.id_store_accounts || 0;
    if (storeId <= 0) {
        return { status: 'error', message: 'ไม่ใช่บัญชีเจ้าของร้าน' };
    }

    const row = await dbQuery(async (sql) => {
        await ensureStoreReviewNoticeColumns(sql);
        const rows = await sql`
            SELECT admin_status, platform_review_notice_at, platform_review_ack_at,
                   platform_review_result, admin_review_note
            FROM phamacy_store_accounts
            WHERE id_store_accounts = ${storeId}
            LIMIT 1
        `;
        return rows[0] as Record<string, unknown> | undefined;
    });

    if (!row) {
        return { status: 'error', message: 'ไม่พบข้อมูล' };
    }

    const pending = reviewNoticePending(row);
    const result = String(row.platform_review_result || row.admin_status || '');
    const approved = result === 'approved';

    return {
        status: 'success',
        notice_pending: pending,
        result,
        approved,
        message: approved
            ? 'ร้านยาของคุณได้รับการอนุมัติจากผู้ดูแลระบบแล้ว'
            : 'คำขอสมัครเจ้าของร้านของคุณไม่ได้รับการอนุมัติ',
        review_note: String(row.admin_review_note || ''),
    };
}

export async function handleAckPharmaRegistrationNotice(event: H3Event) {
    const auth = getAuthContext(event);
    const pId = auth.id_pharma || 0;
    if (pId <= 0) {
        return { status: 'error', message: 'ไม่ใช่บัญชีเภสัชกร' };
    }

    await dbQuery(async (sql) => {
        await ensurePharmacistReviewNoticeColumns(sql);
        await sql`
            UPDATE pharmacist_account
            SET platform_review_ack_at = NOW()
            WHERE id_pharma = ${pId}
        `;
    });

    return { status: 'success', message: 'รับทราบแล้ว' };
}

export async function handleAckStoreRegistrationNotice(event: H3Event) {
    const auth = getAuthContext(event);
    const storeId = auth.id_store_accounts || 0;
    if (storeId <= 0) {
        return { status: 'error', message: 'ไม่ใช่บัญชีเจ้าของร้าน' };
    }

    await dbQuery(async (sql) => {
        await ensureStoreReviewNoticeColumns(sql);
        await sql`
            UPDATE phamacy_store_accounts
            SET platform_review_ack_at = NOW()
            WHERE id_store_accounts = ${storeId}
        `;
    });

    return { status: 'success', message: 'รับทราบแล้ว' };
}
