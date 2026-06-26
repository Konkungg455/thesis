/**
 * อัปโหลดรูปจาก XAMPP (MEDIA_ROOT) ไป Supabase Storage buckets จริง
 * images-pharma | images-account | uploads/*
 * ใช้: npm run media:migrate
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

function resolveSupabaseObject(folder, filename) {
    const normalizedFolder = folder.replace(/^\/+|\/+$/g, '');
    const name = String(filename || 'default.png').trim() || 'default.png';
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
const mediaRoot = process.env.MEDIA_ROOT || 'C:/xampp/htdocs/4';

const MIME = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.pdf': 'application/pdf',
};

if (!supabaseUrl || !serviceKey) {
    console.error('ต้องมี SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY ใน .env');
    process.exit(1);
}

const headers = {
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
};

async function uploadFolder(folder, localDir) {
    if (!existsSync(localDir)) return 0;
    let count = 0;
    for (const name of readdirSync(localDir)) {
        const filePath = join(localDir, name);
        if (!statSync(filePath).isFile()) continue;
        const { bucket, objectPath } = resolveSupabaseObject(folder, name);
        const ext = extname(name).toLowerCase();
        const contentType = MIME[ext] || 'application/octet-stream';
        const data = readFileSync(filePath);

        const res = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': contentType, 'x-upsert': 'true' },
            body: data,
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`${bucket}/${objectPath}: ${res.status} ${text}`);
        }

        console.log('OK', `${supabaseUrl}/storage/v1/object/public/${bucket}/${objectPath}`);
        count++;
    }
    return count;
}

async function uploadUploadsSubdirs() {
    const uploadsRoot = join(mediaRoot, 'uploads');
    if (!existsSync(uploadsRoot)) return 0;
    let count = 0;
    for (const sub of readdirSync(uploadsRoot)) {
        const subPath = join(uploadsRoot, sub);
        if (!statSync(subPath).isDirectory()) continue;
        count += await uploadFolder(`uploads/${sub}`, subPath);
    }
    return count;
}

let total = 0;
total += await uploadFolder('images_pharma', join(mediaRoot, 'images_pharma'));
total += await uploadFolder('images_account', join(mediaRoot, 'images_account'));
total += await uploadUploadsSubdirs();

console.log(`\nเสร็จ — อัปโหลด ${total} ไฟล์ → buckets images-pharma / images-account / uploads`);
