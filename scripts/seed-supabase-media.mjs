/**
 * อัปโหลด default.png ไป Supabase buckets images-pharma + images-account
 * ใช้: npm run media:seed
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

function resolveSupabaseObject(folder, filename) {
    const normalizedFolder = folder.replace(/^\/+|\/+$/g, '');
    const name = String(filename || 'default.png').trim() || 'default.png';
    if (normalizedFolder === 'images_account') return { bucket: 'images-account', objectPath: name };
    if (normalizedFolder === 'images_pharma') return { bucket: 'images-pharma', objectPath: name };
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

if (!supabaseUrl || !serviceKey) {
    console.error('ต้องมี SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY ใน .env');
    process.exit(1);
}

const mediaRoot = process.env.MEDIA_ROOT || 'C:/xampp/htdocs/4';
const candidates = [
    join(mediaRoot, 'images_pharma', 'default.png'),
    join(mediaRoot, 'images_account', 'default.png'),
];

const source = candidates.find((p) => existsSync(p));
if (!source) {
    console.error('ไม่พบ default.png ใน XAMPP images_*');
    process.exit(1);
}

const data = readFileSync(source);
const contentType = 'image/png';
const targets = ['images_pharma', 'images_account'];

async function upload(folder) {
    const { bucket, objectPath } = resolveSupabaseObject(folder, 'default.png');
    const url = `${supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${serviceKey}`,
            'Content-Type': contentType,
            'x-upsert': 'true',
        },
        body: data,
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`${bucket}/${objectPath}: ${res.status} ${text}`);
    }
    console.log('OK', `${supabaseUrl}/storage/v1/object/public/${bucket}/${objectPath}`);
}

for (const t of targets) {
    await upload(t);
}

console.log('Seed เสร็จ');
