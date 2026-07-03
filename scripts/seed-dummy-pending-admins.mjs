/**
 * แทนที่แอดมิน dummy เก่า (@example.test / dummy_admin_*) ด้วยชุด demo รออนุมัติ
 * ใช้: npm run db:seed-dummy-admins
 */
import postgres from 'postgres';
import { randomBytes } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import argon2 from 'argon2';

const DEMO_PASSWORD = 'Demo@1234';
const DEFAULT_PROFILE_IMAGE = 'default.png';

const PENDING_DEMO_ADMINS = [
    {
        username: 'demo_admin_pending01',
        email: 'demo.admin.pending01@telebot-pharmacy.test',
        firstname: 'กัญญา',
        lastname: 'ศรีสุวรรณ',
        gender: 'หญิง',
        age: 32,
        phone: '0850001046',
    },
    {
        username: 'demo_admin_pending02',
        email: 'demo.admin.pending02@telebot-pharmacy.test',
        firstname: 'พิมพ์ชนก',
        lastname: 'จันทร์เพ็ญ',
        gender: 'หญิง',
        age: 28,
        phone: '0850001048',
    },
    {
        username: 'demo_admin_pending03',
        email: 'demo.admin.pending03@telebot-pharmacy.test',
        firstname: 'ชัชวาล',
        lastname: 'พิทักษ์ไทย',
        gender: 'ชาย',
        age: 35,
        phone: '0850001049',
    },
    {
        username: 'demo_admin_pending04',
        email: 'demo.admin.pending04@telebot-pharmacy.test',
        firstname: 'รัตนา',
        lastname: 'พิทักษ์ไทย',
        gender: 'หญิง',
        age: 30,
        phone: '0850001050',
    },
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

async function hashPassword(password, salt) {
    return argon2.hash(password + salt, { type: argon2.argon2id });
}

const sql = postgres(url, { ssl: 'require', prepare: false, connect_timeout: 20 });

try {
    const removed = await sql`
        UPDATE account_admin
        SET is_deleted = 1
        WHERE (is_deleted IS NULL OR is_deleted = 0)
          AND admin_status = 'pending'
          AND (
              email_account LIKE '%@example.test'
              OR username_account LIKE 'dummy_admin%'
          )
        RETURNING id_account_admin, username_account, email_account
    `;

    const upserted = [];
    for (const a of PENDING_DEMO_ADMINS) {
        const existing = await sql`
            SELECT id_account_admin FROM account_admin
            WHERE email_account = ${a.email}
            LIMIT 1
        `;
        if (existing.length) {
            const id = existing[0].id_account_admin;
            await sql`
                UPDATE account_admin SET
                    username_account = ${a.username},
                    firstname = ${a.firstname},
                    lastname = ${a.lastname},
                    gender = ${a.gender},
                    old = ${a.age},
                    phone_number = ${a.phone},
                    images_account = ${DEFAULT_PROFILE_IMAGE},
                    admin_status = 'pending',
                    is_super_admin = 0,
                    is_deleted = 0
                WHERE id_account_admin = ${id}
            `;
            upserted.push({ id, ...a, action: 'updated' });
        } else {
            const salt = randomBytes(16).toString('hex');
            const hash = await hashPassword(DEMO_PASSWORD, salt);
            const [row] = await sql`
                INSERT INTO account_admin (
                    username_account, email_account, password_account, salt_account,
                    firstname, lastname, gender, old, phone_number,
                    images_account, admin_status, is_super_admin, is_deleted
                ) VALUES (
                    ${a.username}, ${a.email}, ${hash}, ${salt},
                    ${a.firstname}, ${a.lastname}, ${a.gender}, ${a.age}, ${a.phone},
                    ${DEFAULT_PROFILE_IMAGE}, 'pending', 0, 0
                )
                RETURNING id_account_admin
            `;
            upserted.push({ id: row.id_account_admin, ...a, action: 'inserted' });
        }
    }

    const [{ n: pendingCount }] = await sql`
        SELECT COUNT(*)::int AS n FROM account_admin
        WHERE admin_status = 'pending'
          AND (is_deleted IS NULL OR is_deleted = 0)
    `;

    const pending = await sql`
        SELECT id_account_admin, username_account, email_account, firstname, lastname, images_account
        FROM account_admin
        WHERE admin_status = 'pending'
          AND (is_deleted IS NULL OR is_deleted = 0)
        ORDER BY created_at ASC NULLS LAST, id_account_admin ASC
    `;

    console.log(JSON.stringify({
        status: 'success',
        message: `ลบ dummy เก่า ${removed.length} รายการ · upsert demo pending ${upserted.length} รายการ · รออนุมัติทั้งหมด ${pendingCount} คน`,
        password: DEMO_PASSWORD,
        removed,
        upserted,
        pending,
    }, null, 2));
} catch (err) {
    console.error(JSON.stringify({ status: 'error', message: err.message }, null, 2));
    process.exit(1);
} finally {
    await sql.end({ timeout: 3 });
}
