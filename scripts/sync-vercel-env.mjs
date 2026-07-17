/**
 * Sync import.env → Vercel (production + preview + development)
 * Import ใน dashboard ไม่ overwrite ค่าเดิม → ขึ้น "No environment variables were created"
 * ใช้: npm run vercel:sync-env
 */
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(root, 'import.env');
const ENVS = 'production,preview,development';

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

function runVercel(args, input) {
    const result = spawnSync('npx', ['vercel', ...args], {
        cwd: root,
        encoding: 'utf8',
        shell: false,
        input: input ?? undefined,
        stdio: ['pipe', 'pipe', 'pipe'],
    });
    return {
        ok: result.status === 0,
        stdout: String(result.stdout || '').trim(),
        stderr: String(result.stderr || '').trim(),
        status: result.status ?? 1,
    };
}

const PUBLIC_KEYS = new Set([
    'NUXT_PUBLIC_SUPABASE_URL',
    'NUXT_PUBLIC_SUPABASE_KEY',
    'NUXT_PUBLIC_USE_SUPABASE_BACKEND',
    'NUXT_PUBLIC_N8N_CHAT_WEBHOOK_ID',
    'NUXT_PUBLIC_USE_AGORA_RTC',
    'NUXT_PUBLIC_AGORA_APP_ID',
    'NUXT_PUBLIC_SITE_ORIGIN',
    'NUXT_AI_MODE',
    'NUXT_AI_PROVIDER',
    'NUXT_AI_MODEL',
    'SUPABASE_STORAGE_BUCKET',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_SECURE',
    'SMTP_FROM',
    'SMTP_FROM_NAME',
]);

function syncVar(key, value) {
    const targets = [];
    const isPublic = PUBLIC_KEYS.has(key);

    const prodPreview = runVercel([
        'env', 'add', key, 'production,preview',
        '--force', '--yes',
        ...(isPublic ? ['--no-sensitive'] : ['--sensitive']),
    ], value);
    if (prodPreview.ok) targets.push('production', 'preview');

    const dev = runVercel([
        'env', 'add', key, 'development',
        '--force', '--yes', '--no-sensitive',
    ], value);
    if (dev.ok) targets.push('development');

    if (targets.length) return { ok: true, targets: [...new Set(targets)] };

    return {
        ok: false,
        error: (prodPreview.stderr || prodPreview.stdout || dev.stderr || dev.stdout || 'sync failed').slice(0, 300),
    };
}

if (!existsSync(sourcePath)) {
    console.error(JSON.stringify({ status: 'error', message: 'ไม่พบ import.env' }, null, 2));
    process.exit(1);
}

const raw = readFileSync(sourcePath, 'utf8').replace(/^\uFEFF/, '');
const vars = parseEnvFile(raw);
vars.set('NUXT_AI_MODE', 'cloud');
vars.delete('NUXT_N8N_INTERNAL_URL');

if (!vars.size) {
    console.error(JSON.stringify({ status: 'error', message: 'import.env ไม่มี KEY=VALUE' }, null, 2));
    process.exit(1);
}

const linked = runVercel(['env', 'ls', 'production']);
if (!linked.ok) {
    console.error(JSON.stringify({
        status: 'error',
        message: 'ยังไม่ได้ link Vercel project — รัน npx vercel link ก่อน',
        detail: linked.stderr || linked.stdout,
    }, null, 2));
    process.exit(1);
}

const updated = [];
const failed = [];

for (const [key, value] of vars) {
    const res = syncVar(key, value);
    if (res.ok) {
        updated.push({ key, environments: res.targets });
    } else {
        failed.push({ key, error: res.error });
    }
}

console.log(JSON.stringify({
    status: failed.length ? 'partial' : 'success',
    message: failed.length
        ? `sync จาก import.env · สำเร็จ ${updated.length} · ล้มเหลว ${failed.length}`
        : `sync จาก import.env ครบ ${updated.length} ตัวแปร → Vercel (${ENVS})`,
    updated,
    failed,
    next: 'Redeploy บน Vercel แล้วเช็ค /api/deploy/health',
}, null, 2));

process.exit(failed.length ? 1 : 0);
