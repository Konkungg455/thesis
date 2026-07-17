/**
 * ทดสอบส่งอีเมลแจ้ง Super Admin เมื่อมีสมัครใหม่
 * ใช้: node scripts/test-admin-registration-notify.mjs [pharmacist|store|both]
 */
import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

for (const line of readFileSync(join(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
}

const mode = process.argv[2] || 'both';
const testTo = process.argv[3] || '';
const jiti = createJiti(import.meta.url, { interopDefault: true });
const { buildAdminNewRegistrationEmailHtml, buildRegistrationReviewEmailHtml } = jiti('../server/utils/emailTemplates.ts');
const { sendRichEmail } = jiti('../server/utils/mail.ts');

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false, connect_timeout: 20 });

async function fetchSuperAdminEmails() {
    const fromEnv = String(process.env.ADMIN_NOTIFY_EMAIL || '')
        .split(/[,;]/).map((v) => v.trim()).filter(Boolean);
    const rows = await sql`
        SELECT email_account FROM account_admin
        WHERE admin_status = 'approved'
          AND COALESCE(is_super_admin, 0) = 1
          AND COALESCE(is_deleted, 0) = 0
          AND TRIM(COALESCE(email_account, '')) <> ''
    `;
    const fromDb = [...new Set(rows.map((r) => String(r.email_account).trim()))];
    return fromDb.length ? fromDb : [...new Set(fromEnv)];
}

const origin = process.env.NUXT_PUBLIC_SITE_ORIGIN || 'http://localhost:3000';

const cases = [];
if (mode === 'pharmacist' || mode === 'both') {
    cases.push({
        role: 'pharmacist',
        id: 9991,
        name: 'ทดสอบ ระบบ เภสัชกร',
        email: 'test-pharma@telebot-pharmacy.test',
        username: 'test_pharma_notify',
        phone: '0811111111',
        storeName: 'ร้านยาทดสอบ',
        adminUrl: `${origin}/admin/continue_pharmacist`,
    });
}
if (mode === 'store' || mode === 'both') {
    cases.push({
        role: 'store',
        id: 9992,
        name: 'ทดสอบ ระบบ เจ้าของร้าน',
        email: 'test-store@telebot-pharmacy.test',
        username: 'test_store_notify',
        phone: '0822222222',
        storeName: 'ร้านยา Telebot Test',
        adminUrl: `${origin}/admin/phacmacy_shop`,
    });
}

try {
    const admins = await fetchSuperAdminEmails();
    if (!admins.length) {
        console.error('ไม่พบอีเมล Super Admin — ตั้ง is_super_admin=1 หรือ ADMIN_NOTIFY_EMAIL ใน .env');
        process.exit(1);
    }

    console.log('Super Admin recipients:', admins.join(', '));

    for (const c of cases) {
        const built = buildAdminNewRegistrationEmailHtml(c);
        const results = await Promise.all(admins.map(async (to) => {
            const ok = await sendRichEmail({
                to,
                subject: `[TEST] ${built.subject}`,
                html: built.html,
                text: built.text,
                fromName: 'Telebot Pharmacy',
            });
            return { to, ok };
        }));
        console.log(`\n${c.role === 'pharmacist' ? 'เภสัชกร' : 'เจ้าของร้านยา'}: ${built.subject}`);
        results.forEach((r) => console.log(`  → ${r.to}: ${r.ok ? 'OK' : 'FAIL'}`));
    }

    console.log('\nเสร็จแล้ว — ตรวจ inbox (และ spam) ของ Super Admin');

    if (mode === 'approved' || mode === 'both') {
        const approveCases = [
            { role: 'pharmacist', name: 'ทดสอบ เภสัชกร', loginUrl: `${origin}/auth/login-pharmacist` },
            { role: 'store', name: 'ทดสอบ เจ้าของร้าน', loginUrl: `${origin}/auth/login-store` },
        ];
        const recipient = testTo || process.env.SMTP_USER || 'telebotpharcy@gmail.com';
        for (const c of approveCases) {
            const built = buildRegistrationReviewEmailHtml({
                role: c.role,
                recipientName: c.name,
                result: 'approved',
                loginUrl: c.loginUrl,
            });
            const ok = await sendRichEmail({
                to: recipient,
                toName: c.name,
                subject: `[TEST] ${built.subject}`,
                html: built.html,
                text: built.text,
                fromName: 'Telebot Pharmacy',
            });
            console.log(`\nอนุมัติ (${c.role}) → ${recipient}: ${ok ? 'OK' : 'FAIL'}`);
            console.log(`  หัวข้อ: ${built.subject}`);
        }
    }
} finally {
    await sql.end({ timeout: 3 });
}
