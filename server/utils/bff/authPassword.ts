import { createHash, randomBytes } from 'node:crypto';
import type { H3Event } from 'h3';
import { getRoleFromAuthType } from '../../utils/emailTemplates';

type AuthType = 'user' | 'admin' | 'pharmacist' | 'store';

const AUTH_TABLES: Record<AuthType, {
    table: string;
    emailCol: string;
    loginPath: string;
    saltCol: string;
    passCol: string;
    idCol: string;
}> = {
    user: {
        table: 'account',
        emailCol: 'email_account',
        loginPath: '/auth/login-user',
        saltCol: 'salt_account',
        passCol: 'password_account',
        idCol: 'id_account',
    },
    admin: {
        table: 'account_admin',
        emailCol: 'email_account',
        loginPath: '/auth/login-admin',
        saltCol: 'salt_account',
        passCol: 'password_account',
        idCol: 'id_account_admin',
    },
    pharmacist: {
        table: 'pharmacist_account',
        emailCol: 'email_pharma',
        loginPath: '/auth/login-pharmacist',
        saltCol: 'salt_pharma',
        passCol: 'password_pharma',
        idCol: 'id_pharma',
    },
    store: {
        table: 'phamacy_store_accounts',
        emailCol: 'personal_email',
        loginPath: '/auth/login-store',
        saltCol: 'salt_store',
        passCol: 'password',
        idCol: 'id_store_accounts',
    },
};

function parseAuthType(raw: unknown): AuthType | null {
    const t = String(raw || 'user');
    return t in AUTH_TABLES ? t as AuthType : null;
}

const PRODUCTION_ORIGIN = 'https://thesis-telebot-pharmacy.vercel.app';

function isLocalOrigin(origin: string): boolean {
    return /localhost|127\.0\.0\.1/i.test(origin);
}

/** URL ในอีเมล reset password — ห้ามใช้ localhost แม้รัน dev ในเครื่อง */
function resolveSiteOrigin(event?: H3Event): string {
    const config = useRuntimeConfig();
    const candidates = [
        process.env.NUXT_PUBLIC_SITE_ORIGIN,
        process.env.NUXT_PUBLIC_APP_ORIGIN,
        process.env.SITE_ORIGIN,
        config.public.siteOrigin,
        config.siteOrigin,
    ]
        .map((v) => String(v || '').trim().replace(/\/$/, ''))
        .filter(Boolean);

    for (const origin of candidates) {
        if (!isLocalOrigin(origin)) {
            return origin;
        }
    }

    if (event) {
        const headers = getRequestHeaders(event);
        const host = (headers['x-forwarded-host'] || headers.host || '').split(',')[0].trim();
        const proto = (headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
        if (host && !isLocalOrigin(host)) {
            return `${proto}://${host}`;
        }
    }

    return PRODUCTION_ORIGIN;
}

function resetLink(type: AuthType, token: string, event?: H3Event): string {
    const origin = resolveSiteOrigin(event);
    return `${origin}/auth/reset-password?type=${type}&token=${encodeURIComponent(token)}`;
}

async function sendResetEmail(to: string, link: string, type: AuthType): Promise<boolean> {
    return sendResetPasswordEmail(to, link, { role: getRoleFromAuthType(type) });
}

export async function handleForgotPassword(event: H3Event) {
    if (!isDbConfigured()) {
        return { status: 'error', message: 'DATABASE_URL ยังไม่ได้ตั้งค่า' };
    }

    const body = await readBody(event).catch(() => ({}));
    const type = parseAuthType(body?.type);
    const email = String(body?.email || body?.email_account || '').trim();

    if (!type) {
        return { status: 'error', message: 'ประเภทบัญชีไม่ถูกต้อง' };
    }
    if (!email) {
        return { status: 'error', message: 'กรุณากรอกอีเมล' };
    }

    const cfg = AUTH_TABLES[type];
    const token = randomBytes(16).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiry = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const updated = await dbQuery(async (sql) => {
        const rows = await sql.unsafe(
            `UPDATE ${cfg.table}
             SET reset_token_hash = $1, reset_token_expires_at = $2
             WHERE ${cfg.emailCol} = $3
             RETURNING ${cfg.idCol}`,
            [tokenHash, expiry, email],
        );
        return rows.length > 0;
    });

    if (!updated) {
        const messages: Record<AuthType, string> = {
            user: 'ไม่พบอีเมลนี้ในระบบผู้ใช้งาน',
            admin: 'ไม่พบอีเมลนี้ในระบบผู้ดูแลระบบ',
            pharmacist: 'ไม่พบอีเมลนี้ในระบบเภสัชกร',
            store: 'ไม่พบอีเมลนี้ในระบบเจ้าของร้าน',
        };
        return { status: 'error', message: messages[type] };
    }

    const link = resetLink(type, token, event);
    const mailed = await sendResetEmail(email, link, type);

    const payload: Record<string, unknown> = {
        status: 'success',
        message: mailed
            ? 'ส่งลิงก์รีเซ็ตรหัสผ่านไปยังอีเมลแล้ว กรุณาตรวจสอบกล่องจดหมาย'
            : 'สร้างลิงก์รีเซ็ตรหัสผ่านแล้ว (โหมด dev — ตรวจ console server)',
        redirect: cfg.loginPath,
    };

    if (!mailed) {
        console.log('[auth] reset link:', link);
        if (process.dev) {
            payload.reset_link = link;
        }
    }

    return payload;
}

export async function handleCheckResetToken(event: H3Event) {
    if (!isDbConfigured()) {
        return { status: 'error', message: 'DATABASE_URL ยังไม่ได้ตั้งค่า' };
    }

    const q = getQuery(event);
    const type = parseAuthType(q.type);
    const token = String(q.token || '').trim();

    if (!type) return { status: 'error', message: 'ประเภทไม่ถูกต้อง' };
    if (!token) return { status: 'error', message: 'ไม่พบ Token' };

    const cfg = AUTH_TABLES[type];
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const usernameCol = type === 'pharmacist'
        ? 'username_pharma'
        : (type === 'store' ? 'username' : 'username_account');

    const row = await dbQuery(async (sql) => {
        const rows = await sql.unsafe(
            `SELECT ${usernameCol} AS username
             FROM ${cfg.table}
             WHERE reset_token_hash = $1 AND reset_token_expires_at > NOW()
             LIMIT 1`,
            [tokenHash],
        );
        return rows[0] as { username?: string } | undefined;
    });

    if (!row?.username) {
        return { status: 'error', message: 'ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว' };
    }

    return { status: 'success', username: row.username };
}

export async function handleResetPassword(event: H3Event) {
    if (!isDbConfigured()) {
        return { status: 'error', message: 'DATABASE_URL ยังไม่ได้ตั้งค่า' };
    }

    const body = await readBody(event).catch(() => ({}));
    const type = parseAuthType(body?.type);
    const token = String(body?.token || '').trim();
    const password = String(body?.password || '');
    const confirm = String(body?.confirm_password || body?.password_confirm || '');

    if (!type) return { status: 'error', message: 'ประเภทไม่ถูกต้อง' };
    if (!token || !password) {
        return { status: 'error', message: 'กรุณากรอกข้อมูลให้ครบ' };
    }
    if (password.length < 8) {
        return { status: 'error', message: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' };
    }
    if (confirm && password !== confirm) {
        return { status: 'error', message: 'รหัสผ่านไม่ตรงกัน' };
    }

    const cfg = AUTH_TABLES[type];
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const user = await dbQuery(async (sql) => {
        const rows = await sql.unsafe(
            `SELECT * FROM ${cfg.table}
             WHERE reset_token_hash = $1 AND reset_token_expires_at > NOW()
             LIMIT 1`,
            [tokenHash],
        );
        return rows[0] as Record<string, unknown> | undefined;
    });

    if (!user) {
        return { status: 'error', message: 'ลิงก์ไม่ถูกต้องหรือหมดอายุ' };
    }

    const salt = String(user[cfg.saltCol] || '');
    const newHash = await hashPassword(password, salt);
    const id = Number(user[cfg.idCol]);

    await dbQuery(async (sql) => {
        if (type === 'admin') {
            await sql.unsafe(
                `UPDATE ${cfg.table}
                 SET ${cfg.passCol} = $1, reset_token_hash = NULL, reset_token_expires_at = NULL,
                     login_count_account = 0, lock_account = 0
                 WHERE ${cfg.idCol} = $2`,
                [newHash, id],
            );
        } else if (type === 'store') {
            await sql.unsafe(
                `UPDATE ${cfg.table}
                 SET ${cfg.passCol} = $1, reset_token_hash = NULL, reset_token_expires_at = NULL,
                     login_count_account = 0, lock_account = 0
                 WHERE ${cfg.idCol} = $2`,
                [newHash, id],
            );
        } else {
            await sql.unsafe(
                `UPDATE ${cfg.table}
                 SET ${cfg.passCol} = $1, reset_token_hash = NULL, reset_token_expires_at = NULL
                 WHERE ${cfg.idCol} = $2`,
                [newHash, id],
            );
        }
    });

    return {
        status: 'success',
        message: 'เปลี่ยนรหัสผ่านสำเร็จแล้ว',
        redirect: cfg.loginPath,
    };
}
