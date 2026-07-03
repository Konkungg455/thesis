/**
 * อัปโหลด default media ไป Supabase Storage + อัปเดตค่าในฐานข้อมูล dummy
 * ใช้: npm run media:seed
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const DEFAULT_PROFILE_IMAGE = 'default.png';
const DEFAULT_PHARMACIST_LICENSE = 'default-license.png';
const DEFAULT_STORE_LICENSE = 'default-store-license.png';
const PROFILE_AVATAR_SOURCE = 'default-profile-avatar.png';
const PHARMACIST_LICENSE_SOURCE = 'default-pharmacist-license.png';
const STORE_LICENSE_SOURCE = 'default-store-license.png';
const MEDIA_VERSION = '20260703a';

function resolveSupabaseObject(folder, filename) {
    const normalizedFolder = folder.replace(/^\/+|\/+$/g, '');
    const name = String(filename || DEFAULT_PROFILE_IMAGE).trim() || DEFAULT_PROFILE_IMAGE;
    if (normalizedFolder === 'images_account') return { bucket: 'images-account', objectPath: name };
    if (normalizedFolder === 'images_pharma') return { bucket: 'images-pharma', objectPath: name };
    if (normalizedFolder.startsWith('uploads/')) {
        const sub = normalizedFolder.slice('uploads/'.length);
        return { bucket: 'uploads', objectPath: sub ? `${sub}/${name}` : name };
    }
    return { bucket: 'uploads', objectPath: name };
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadEnv() {
    const envPath = join(root, '.env');
    if (!existsSync(envPath)) return;
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
        const m = line.match(/^([^#=]+)=(.*)$/);
        if (!m) continue;
        const key = m[1].trim();
        if (!process.env[key]) process.env[key] = m[2].trim().replace(/^["']|["']$/g, '');
    }
}

loadEnv();

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dbUrl = process.env.DATABASE_URL;

if (!supabaseUrl || !serviceKey) {
    console.error('ต้องมี SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY ใน .env');
    process.exit(1);
}

const profileAvatarSource = join(__dirname, 'assets', PROFILE_AVATAR_SOURCE);
const pharmacistLicenseSource = join(__dirname, 'assets', PHARMACIST_LICENSE_SOURCE);
const storeLicenseSource = join(__dirname, 'assets', STORE_LICENSE_SOURCE);

const headers = {
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
};

/** เงื่อนไขบัญชี dummy / ตัวอย่าง */
const DEMO_EMAIL_SQL = `
    email_account LIKE '%@telebot-pharmacy.test'
    OR email_account LIKE '%@example.test'
    OR username_account LIKE 'dummy_%'
    OR username_account LIKE 'demo_%'
`;

const DEMO_PHARMA_EMAIL_SQL = `
    email_pharma LIKE '%@telebot-pharmacy.test'
    OR email_pharma LIKE '%@example.test'
    OR username_pharma LIKE 'dummy_%'
    OR username_pharma LIKE 'demo_%'
`;

const DEMO_STORE_EMAIL_SQL = `
    personal_email LIKE '%@telebot-pharmacy.test'
    OR personal_email LIKE '%@example.test'
    OR username LIKE 'dummy_%'
    OR username LIKE 'demo_%'
`;

async function uploadBuffer(folder, filename, data, contentType = 'image/png') {
    const { bucket, objectPath } = resolveSupabaseObject(folder, filename);
    const url = `${supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            ...headers,
            'Content-Type': contentType,
            'x-upsert': 'true',
            'cache-control': 'max-age=60',
        },
        body: data,
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`${bucket}/${objectPath}: ${res.status} ${text}`);
    }
    console.log('OK', `${supabaseUrl}/storage/v1/object/public/${bucket}/${objectPath}?v=${MEDIA_VERSION}`);
}

async function patchDemoProfileImages() {
    if (!dbUrl) {
        console.log('ข้าม patch DB — ไม่มี DATABASE_URL');
        return;
    }
    const sql = postgres(dbUrl, { ssl: 'require', prepare: false, connect_timeout: 15 });
    try {
        const users = await sql.unsafe(`
            UPDATE account
            SET images_account = '${DEFAULT_PROFILE_IMAGE}'
            WHERE COALESCE(TRIM(images_account), '') = ''
               OR images_account IN ('default.jpg', 'default.png')
               OR ${DEMO_EMAIL_SQL}
            RETURNING id_account
        `);
        const admins = await sql.unsafe(`
            UPDATE account_admin
            SET images_account = '${DEFAULT_PROFILE_IMAGE}'
            WHERE COALESCE(TRIM(images_account), '') = ''
               OR images_account IN ('default.jpg', 'default.png')
               OR admin_status = 'pending'
               OR ${DEMO_EMAIL_SQL}
            RETURNING id_account_admin
        `);
        const stores = await sql.unsafe(`
            UPDATE phamacy_store_accounts
            SET profile_store_account = '${DEFAULT_PROFILE_IMAGE}'
            WHERE COALESCE(is_deleted, 0) = 0
            RETURNING id_store_accounts
        `);
        const pharmacists = await sql.unsafe(`
            UPDATE pharmacist_account
            SET images_pharma = '${DEFAULT_PROFILE_IMAGE}'
            WHERE COALESCE(TRIM(images_pharma), '') = ''
               OR images_pharma IN ('default.jpg', 'default.png')
               OR ${DEMO_PHARMA_EMAIL_SQL}
            RETURNING id_pharma
        `);
        console.log(`อัปเดต images_account user ${users.length} รายการ → ${DEFAULT_PROFILE_IMAGE}`);
        console.log(`อัปเดต images_account admin ${admins.length} รายการ → ${DEFAULT_PROFILE_IMAGE}`);
        console.log(`อัปเดต profile_store_account ร้าน ${stores.length} รายการ → ${DEFAULT_PROFILE_IMAGE}`);
        console.log(`อัปเดต images_pharma เภสัช ${pharmacists.length} รายการ → ${DEFAULT_PROFILE_IMAGE}`);
    } finally {
        await sql.end({ timeout: 2 });
    }
}

async function patchDemoStoreLicenses() {
    if (!dbUrl) return;
    const sql = postgres(dbUrl, { ssl: 'require', prepare: false, connect_timeout: 15 });
    try {
        const rows = await sql.unsafe(`
            UPDATE phamacy_store_accounts
            SET license_file = '${DEFAULT_STORE_LICENSE}'
            WHERE COALESCE(TRIM(license_file), '') = ''
               OR license_file IN ('license_69c517754e074.png', 'default.png')
               OR ${DEMO_STORE_EMAIL_SQL}
            RETURNING id_store_accounts
        `);
        console.log(`อัปเดต license_file ร้านยา ${rows.length} รายการ → ${DEFAULT_STORE_LICENSE}`);
    } finally {
        await sql.end({ timeout: 2 });
    }
}

async function patchDemoPharmacistLicenses() {
    if (!dbUrl) return;
    const sql = postgres(dbUrl, { ssl: 'require', prepare: false, connect_timeout: 15 });
    try {
        const rows = await sql.unsafe(`
            UPDATE pharmacist_account
            SET license_image = '${DEFAULT_PHARMACIST_LICENSE}'
            WHERE COALESCE(TRIM(license_image), '') = ''
               OR license_image IN ('default.png', 'license_69ce44ed3b232.png')
               OR ${DEMO_PHARMA_EMAIL_SQL}
            RETURNING id_pharma
        `);
        console.log(`อัปเดต license_image เภสัช ${rows.length} รายการ → ${DEFAULT_PHARMACIST_LICENSE}`);
    } finally {
        await sql.end({ timeout: 2 });
    }
}

if (!existsSync(profileAvatarSource)) {
    console.error(`ไม่พบ scripts/assets/${PROFILE_AVATAR_SOURCE}`);
    process.exit(1);
}

const profileAvatarData = readFileSync(profileAvatarSource);

// user + admin avatar
await uploadBuffer('images_account', DEFAULT_PROFILE_IMAGE, profileAvatarData);
// เภสัช avatar
await uploadBuffer('images_pharma', DEFAULT_PROFILE_IMAGE, profileAvatarData);
// เจ้าของร้าน avatar
await uploadBuffer('uploads/store_profiles', DEFAULT_PROFILE_IMAGE, profileAvatarData);

if (!existsSync(pharmacistLicenseSource)) {
    console.error(`ไม่พบ scripts/assets/${PHARMACIST_LICENSE_SOURCE}`);
    process.exit(1);
}
const pharmacistLicenseData = readFileSync(pharmacistLicenseSource);
await uploadBuffer('uploads/licenses', DEFAULT_PHARMACIST_LICENSE, pharmacistLicenseData);

if (!existsSync(storeLicenseSource)) {
    console.error(`ไม่พบ scripts/assets/${STORE_LICENSE_SOURCE}`);
    process.exit(1);
}
const storeLicenseData = readFileSync(storeLicenseSource);
await uploadBuffer('uploads/licenses', DEFAULT_STORE_LICENSE, storeLicenseData);

await patchDemoProfileImages();
await patchDemoStoreLicenses();
await patchDemoPharmacistLicenses();

console.log('Seed media เสร็จ');
