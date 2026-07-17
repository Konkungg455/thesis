/**
 * สร้างไฟล์ .env สะอาดสำหรับ Vercel → Settings → Environment Variables → Import .env
 * ใช้: npm run vercel:prepare-import
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(root, 'import.env');
const outPath = resolve(root, '.env.vercel-import');

function parseEnvFile(content) {
    const vars = new Map();
    for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
        let value = trimmed.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"'))
            || (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        vars.set(key, value);
    }
    return vars;
}

if (!existsSync(sourcePath)) {
    console.error(JSON.stringify({
        status: 'error',
        message: 'ไม่พบ import.env — สร้างจาก vercel.env.template แล้วใส่ค่าจริง',
    }, null, 2));
    process.exit(1);
}

const raw = readFileSync(sourcePath, 'utf8').replace(/^\uFEFF/, '');
const vars = parseEnvFile(raw);

if (!vars.size) {
    console.error(JSON.stringify({
        status: 'error',
        message: 'parse ไม่ได้ตัวแปรจาก import.env — ตรวจว่ามีบรรทัด KEY=VALUE ที่ไม่ขึ้นต้นด้วย #',
    }, null, 2));
    process.exit(1);
}

// Vercel ใช้ Groq โดยตรง — ไม่มี n8n ใน serverless
vars.set('NUXT_AI_MODE', 'cloud');
vars.delete('NUXT_N8N_INTERNAL_URL');

// บน Vercel ไม่จำเป็น — resolveRequestOrigin() ใช้ domain จาก request อัตโนมัติ
// ถ้ามีอยู่แล้วใน Vercel การ import ซ้ำจะขึ้น "No environment variables were created"
if (!process.env.VERCEL_IMPORT_INCLUDE_SITE_ORIGIN) {
    vars.delete('NUXT_PUBLIC_SITE_ORIGIN');
}

const preferredOrder = [
    'NUXT_PUBLIC_SITE_ORIGIN',
    'DATABASE_URL',
    'SUPABASE_URL',
    'SUPABASE_KEY',
    'NUXT_PUBLIC_SUPABASE_URL',
    'NUXT_PUBLIC_SUPABASE_KEY',
    'NUXT_PUBLIC_USE_SUPABASE_BACKEND',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_STORAGE_BUCKET',
    'NUXT_AI_MODE',
    'NUXT_AI_API_KEY',
    'NUXT_AI_PROVIDER',
    'NUXT_AI_MODEL',
    'NUXT_PUBLIC_N8N_CHAT_WEBHOOK_ID',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_SECURE',
    'SMTP_USER',
    'SMTP_PASS',
    'SMTP_FROM',
    'SMTP_FROM_NAME',
    'NUXT_PUBLIC_USE_AGORA_RTC',
    'NUXT_PUBLIC_AGORA_APP_ID',
    'NUXT_AGORA_APP_CERTIFICATE',
    'ADMIN_NOTIFY_EMAIL',
];

const lines = [];
const written = new Set();
for (const key of preferredOrder) {
    if (!vars.has(key)) continue;
    lines.push(`${key}=${vars.get(key)}`);
    written.add(key);
}
for (const [key, value] of vars) {
    if (written.has(key)) continue;
    lines.push(`${key}=${value}`);
}

writeFileSync(outPath, `${lines.join('\n')}\n`, 'utf8');

console.log(JSON.stringify({
    status: 'success',
    message: `สร้าง ${lines.length} ตัวแปรใน .env.vercel-import — อัปโหลดไฟล์นี้ใน Vercel (เลือก Production + Preview + Development)`,
    output: '.env.vercel-import',
    count: lines.length,
    keys: lines.map((l) => l.split('=')[0]),
    vercel_ai_mode: 'cloud',
    tips: [
        'NUXT_PUBLIC_SITE_ORIGIN ไม่จำเป็นบน Vercel (ระบบใช้ domain จาก request) — ถ้า import แล้วขึ้น "No environment variables were created" ที่ตัวนี้ = มีอยู่แล้วหรือข้ามได้',
        'ถ้า Vercel บอก "No environment variables were created" มักเพราะตัวแปรชื่อเดิมมีอยู่แล้ว — ลบ/แก้ใน Settings แล้ว import ใหม่',
        'เลือก checkbox Production, Preview, Development ก่อนกด Import',
        'หลัง import ต้อง Redeploy ถึงจะมีผล',
    ],
}, null, 2));
