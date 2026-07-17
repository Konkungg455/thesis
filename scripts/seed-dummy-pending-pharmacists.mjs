/**
 * เติมเภสัชกร mock รออนุมัติ 3 คน (status_verify = 0)
 * ใช้: npm run db:seed-pending-pharmacists
 */
import postgres from 'postgres';
import { randomBytes } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import argon2 from 'argon2';

const DEMO_PASSWORD = 'Demo@1234';
const DEFAULT_PROFILE_IMAGE = 'default.png';
const DEFAULT_LICENSE = 'default-license.png';

const PENDING_PHARMACISTS = [
    {
        username: 'demo_pharma_pending01',
        email: 'mock.pending.pharma.01@telebot-pharmacy.test',
        firstname: 'ณัฐพล',
        lastname: 'วงศ์เภสัช',
        gender: 'ชาย',
        age: 29,
        phone: '0819002001',
        work_time: 'Monday (08:00-17:00), Tuesday (08:00-17:00), Wednesday (08:00-17:00), Thursday (08:00-17:00), Friday (08:00-17:00)',
    },
    {
        username: 'demo_pharma_pending02',
        email: 'mock.pending.pharma.02@telebot-pharmacy.test',
        firstname: 'สุภาวดี',
        lastname: 'ใจดี',
        gender: 'หญิง',
        age: 31,
        phone: '0819002002',
        work_time: 'Monday (08:30-18:00), Tuesday (08:30-18:00), Wednesday (08:30-18:00), Thursday (08:30-18:00), Friday (08:30-18:00), Saturday (09:00-15:00)',
    },
    {
        username: 'demo_pharma_pending03',
        email: 'mock.pending.pharma.03@telebot-pharmacy.test',
        firstname: 'ธีระ',
        lastname: 'รักษ์สุข',
        gender: 'ชาย',
        age: 34,
        phone: '0819002003',
        work_time: 'Tuesday (09:00-18:00), Wednesday (09:00-18:00), Thursday (09:00-18:00), Friday (09:00-18:00), Saturday (09:00-16:00)',
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

async function hashPassword(password, salt) {
    return argon2.hash(password + salt, { type: argon2.argon2id });
}

async function syncSerialSequence(sql, table, column) {
    await sql.unsafe(`
        SELECT setval(
            pg_get_serial_sequence('${table}', '${column}'),
            GREATEST(COALESCE((SELECT MAX(${column}) FROM ${table}), 1), 1)
        )
    `);
}

loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
    console.error('ต้องมี DATABASE_URL ใน .env');
    process.exit(1);
}

const sql = postgres(url, { ssl: 'require', prepare: false, connect_timeout: 20 });

try {
    await syncSerialSequence(sql, 'pharmacist_account', 'id_pharma');

    const stores = await sql`
        SELECT a.id_store_accounts AS id, d.store_name
        FROM phamacy_store_accounts a
        JOIN phamacy_store_details d ON d.id_store_accounts = a.id_store_accounts
        WHERE COALESCE(a.is_deleted, 0) = 0
          AND COALESCE(a.admin_status, '') = 'approved'
        ORDER BY a.id_store_accounts ASC
        LIMIT 3
    `;

    if (!stores.length) {
        throw new Error('ไม่พบร้านยาที่อนุมัติแล้วสำหรับผูกเภสัชกรรออนุมัติ');
    }

    const upserted = [];

    for (let i = 0; i < PENDING_PHARMACISTS.length; i++) {
        const p = PENDING_PHARMACISTS[i];
        const store = stores[i % stores.length];
        const storeName = String(store.store_name || `ร้าน #${store.id}`).trim();

        const existing = await sql`
            SELECT id_pharma FROM pharmacist_account
            WHERE email_pharma = ${p.email} OR username_pharma = ${p.username}
            LIMIT 1
        `;

        if (existing[0]) {
            await sql`
                UPDATE pharmacist_account SET
                    username_pharma = ${p.username},
                    firstname_pharma = ${p.firstname},
                    lastname_pharma = ${p.lastname},
                    gender_pharma = ${p.gender},
                    age_pharma = ${p.age},
                    phone_pharma = ${p.phone},
                    work_time = ${p.work_time},
                    license_image = ${DEFAULT_LICENSE},
                    id_store = ${store.id},
                    store_name = ${storeName},
                    images_pharma = ${DEFAULT_PROFILE_IMAGE},
                    status_verify = 0
                WHERE id_pharma = ${existing[0].id_pharma}
            `;
            upserted.push({
                id_pharma: Number(existing[0].id_pharma),
                ...p,
                store_id: store.id,
                store_name: storeName,
                action: 'updated',
            });
        } else {
            const salt = randomBytes(16).toString('hex');
            const hash = await hashPassword(DEMO_PASSWORD, salt);
            const [row] = await sql`
                INSERT INTO pharmacist_account (
                    username_pharma, email_pharma, password_pharma, salt_pharma,
                    firstname_pharma, lastname_pharma, gender_pharma, age_pharma,
                    height_pharma, weight_pharma, phone_pharma, work_time, license_image,
                    id_store, store_name, images_pharma, status_verify
                ) VALUES (
                    ${p.username}, ${p.email}, ${hash}, ${salt},
                    ${p.firstname}, ${p.lastname}, ${p.gender}, ${p.age},
                    170, 65, ${p.phone}, ${p.work_time}, ${DEFAULT_LICENSE},
                    ${store.id}, ${storeName}, ${DEFAULT_PROFILE_IMAGE}, 0
                )
                RETURNING id_pharma
            `;
            upserted.push({
                id_pharma: Number(row.id_pharma),
                ...p,
                store_id: store.id,
                store_name: storeName,
                action: 'inserted',
            });
        }
    }

    const [{ n: pendingCount }] = await sql`
        SELECT COUNT(*)::int AS n FROM pharmacist_account
        WHERE COALESCE(status_verify, 0) = 0
    `;

    const pending = await sql`
        SELECT id_pharma, username_pharma, email_pharma,
               firstname_pharma, lastname_pharma, store_name, status_verify
        FROM pharmacist_account
        WHERE COALESCE(status_verify, 0) = 0
        ORDER BY id_pharma ASC
    `;

    console.log(JSON.stringify({
        status: 'success',
        message: `upsert เภสัชกรรออนุมัติ ${upserted.length} คน · รออนุมัติทั้งหมด ${pendingCount} คน`,
        password: DEMO_PASSWORD,
        upserted,
        pending_count: pendingCount,
        pending,
    }, null, 2));
} catch (err) {
    console.error(JSON.stringify({ status: 'error', message: err.message }, null, 2));
    process.exit(1);
} finally {
    await sql.end({ timeout: 3 });
}
