/**
 * อัปโหลด default.png ไป Supabase Storage (รันครั้งเดียวบนเครื่อง dev)
 * ใช้: node scripts/seed-supabase-media.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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
const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'media';

if (!supabaseUrl || !serviceKey) {
    console.error('ต้องมี SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY ใน .env');
    process.exit(1);
}

const candidates = [
    join(process.env.MEDIA_ROOT || 'C:/xampp/htdocs/4', 'images_pharma', 'default.png'),
    join(process.env.MEDIA_ROOT || 'C:/xampp/htdocs/4', 'images_account', 'default.png'),
    join(root, 'public', 'favicon.ico'),
    join(root, 'public', 'logo.png'),
];

const source = candidates.find((p) => existsSync(p));
if (!source) {
    console.error('ไม่พบไฟล์ default — ใส่ public/logo.png หรือ favicon.ico');
    process.exit(1);
}

const data = readFileSync(source);
const contentType = source.endsWith('.png') ? 'image/png' : 'image/x-icon';

const targets = ['images_account/default.png', 'images_pharma/default.png'];

async function upload(path) {
    const url = `${supabaseUrl}/storage/v1/object/${bucket}/${path}`;
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
        throw new Error(`${path}: ${res.status} ${text}`);
    }
    console.log('OK', `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`);
}

for (const t of targets) {
    await upload(t);
}

console.log('Seed เสร็จ — redeploy Vercel แล้วรีเฟรช');
