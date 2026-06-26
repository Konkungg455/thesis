/**
 * อัปโหลดรูปจาก XAMPP (MEDIA_ROOT) ไป Supabase Storage bucket `media`
 * ใช้: npm run media:migrate
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
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
const mediaRoot = process.env.MEDIA_ROOT || 'C:/xampp/htdocs/4';

const MIME = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
};

if (!supabaseUrl || !serviceKey) {
    console.error('ต้องมี SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY ใน .env');
    process.exit(1);
}

const headers = {
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
};

async function ensureBucket() {
    const list = await fetch(`${supabaseUrl}/storage/v1/bucket`, { headers });
    if (list.ok) {
        const buckets = await list.json();
        if (Array.isArray(buckets) && buckets.some((b) => b.id === bucket || b.name === bucket)) {
            console.log(`bucket "${bucket}" มีอยู่แล้ว`);
            return;
        }
    }

    const res = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: bucket, name: bucket, public: true }),
    });

    if (!res.ok && res.status !== 409) {
        const text = await res.text();
        throw new Error(`สร้าง bucket ไม่ได้: ${res.status} ${text}`);
    }
    console.log(`สร้าง bucket "${bucket}" (public) แล้ว`);
}

async function uploadFile(storagePath, filePath) {
    const data = readFileSync(filePath);
    const ext = extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';

    const res = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${storagePath}`, {
        method: 'POST',
        headers: {
            ...headers,
            'Content-Type': contentType,
            'x-upsert': 'true',
        },
        body: data,
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`${storagePath}: ${res.status} ${text}`);
    }

    console.log('OK', `${supabaseUrl}/storage/v1/object/public/${bucket}/${storagePath}`);
}

function listFiles(folder) {
    const dir = join(mediaRoot, folder);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
        .filter((name) => statSync(join(dir, name)).isFile())
        .map((name) => ({ name, path: join(dir, name) }));
}

await ensureBucket();

const folders = ['images_pharma', 'images_account'];
let total = 0;

for (const folder of folders) {
    const files = listFiles(folder);
    console.log(`\n${folder}: ${files.length} ไฟล์`);
    for (const f of files) {
        await uploadFile(`${folder}/${f.name}`, f.path);
        total++;
    }
}

console.log(`\nเสร็จ — อัปโหลด ${total} ไฟล์`);
