/**
 * ลดแอดมินสถานะ pending ให้เหลือ 5 คน (soft-delete ที่เกิน)
 * ใช้: npm run db:trim-pending-admins
 */
import postgres from 'postgres';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const KEEP = 5;
const DEMO_EMAILS = [
    'demo.admin01@telebot-pharmacy.test',
    'demo.admin02@telebot-pharmacy.test',
    'demo.admin03@telebot-pharmacy.test',
    'demo.admin04@telebot-pharmacy.test',
    'demo.admin05@telebot-pharmacy.test',
];

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');

function loadEnv() {
    if (!existsSync(envPath)) return;
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^([^#=]+)=(.*)$/);
        if (!m) continue;
        const key = m[1].trim();
        if (!process.env[key]) {
            process.env[key] = m[2].trim().replace(/^["']|["']$/g, '');
        }
    }
}

loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
    console.error('ต้องมี DATABASE_URL ใน .env');
    process.exit(1);
}

const sql = postgres(url, { ssl: 'require', prepare: false, connect_timeout: 20 });

try {
    const [{ n: before }] = await sql`
        SELECT COUNT(*)::int AS n FROM account_admin
        WHERE admin_status = 'pending'
          AND (is_deleted IS NULL OR is_deleted = 0)
    `;

    const removed = await sql`
        WITH pending_ranked AS (
            SELECT id_account_admin,
                   email_account,
                   ROW_NUMBER() OVER (
                       ORDER BY
                           CASE WHEN email_account = ANY(${DEMO_EMAILS}) THEN 0 ELSE 1 END,
                           created_at ASC NULLS LAST,
                           id_account_admin ASC
                   ) AS rn
            FROM account_admin
            WHERE admin_status = 'pending'
              AND (is_deleted IS NULL OR is_deleted = 0)
        )
        UPDATE account_admin a
        SET is_deleted = 1
        FROM pending_ranked r
        WHERE a.id_account_admin = r.id_account_admin
          AND r.rn > ${KEEP}
        RETURNING a.id_account_admin, a.email_account
    `;

    const [{ n: after }] = await sql`
        SELECT COUNT(*)::int AS n FROM account_admin
        WHERE admin_status = 'pending'
          AND (is_deleted IS NULL OR is_deleted = 0)
    `;

    const remaining = await sql`
        SELECT id_account_admin, username_account, email_account, created_at
        FROM account_admin
        WHERE admin_status = 'pending'
          AND (is_deleted IS NULL OR is_deleted = 0)
        ORDER BY created_at ASC
    `;

    console.log(JSON.stringify({
        status: 'success',
        message: `แอดมินรออนุมัติ: ${before} → ${after} คน (ลบ ${removed.length} รายการ)`,
        pending_before: before,
        pending_after: after,
        removed: removed.map((r) => ({ id: r.id_account_admin, email: r.email_account })),
        remaining,
    }, null, 2));
} catch (err) {
    console.error(JSON.stringify({ status: 'error', message: err.message }, null, 2));
    process.exit(1);
} finally {
    await sql.end({ timeout: 3 });
}
