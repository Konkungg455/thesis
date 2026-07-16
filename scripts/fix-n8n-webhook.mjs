/**
 * Fix n8n webhook: sync workflow to DB + restart n8n (default Ollama: gemma4:latest).
 * Usage: node scripts/fix-n8n-webhook.mjs
 */
import { spawn, spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDir, '..');

function testPort(port) {
  return new Promise((resolve) => {
    const s = createConnection({ host: '127.0.0.1', port }, () => { s.end(); resolve(true); });
    s.setTimeout(1500);
    s.on('error', () => resolve(false));
    s.on('timeout', () => { s.destroy(); resolve(false); });
  });
}

function killPort5678Win() {
  const out = spawnSync('powershell', [
    '-NoProfile', '-Command',
    "Get-NetTCPConnection -LocalPort 5678 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }",
  ], { encoding: 'utf8' });
  if (out.stderr) process.stderr.write(out.stderr);
}

console.log('Stopping n8n...');
if (process.platform === 'win32') killPort5678Win();
await new Promise((r) => setTimeout(r, 3000));

console.log('Syncing workflow to n8n database (stop n8n first)...');
if (process.platform === 'win32') killPort5678Win();
await new Promise((r) => setTimeout(r, 3000));

console.log('Syncing workflow to n8n database...');
const sync = spawnSync(process.execPath, [join(scriptDir, 'sync-n8n-workflow-db.mjs')], {
  cwd: projectRoot,
  stdio: 'inherit',
});
if (sync.status !== 0) process.exit(sync.status ?? 1);

console.log('Starting n8n...');
if (process.platform === 'win32') {
  spawnSync('powershell', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-File', join(scriptDir, 'ensure-ai-local.ps1'),
    '-Quiet', '-SkipModelPull',
  ], { cwd: projectRoot, stdio: 'inherit' });
} else {
  spawnSync(process.execPath, [join(scriptDir, 'ensure-ai-local.mjs'), '--quiet', '--skip-model-pull'], {
    cwd: projectRoot,
    stdio: 'inherit',
  });
}

console.log('Registering webhook...');
spawnSync(process.execPath, [join(scriptDir, 'setup-n8n-workflow.mjs'), '--quiet'], {
  cwd: projectRoot,
  stdio: 'inherit',
});

console.log('Waiting for n8n...');
for (let i = 0; i < 40; i += 1) {
  if (await testPort(5678)) break;
  await new Promise((r) => setTimeout(r, 3000));
}

if (!(await testPort(5678))) {
  console.error('n8n did not start on :5678');
  process.exit(1);
}

console.log('Testing webhook...');
const res = await fetch('http://127.0.0.1:5678/webhook/1f5ea30f-2ff0-4d32-b211-eccb342ee0df/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ chatInput: 'ping', sessionId: 'fix-test', userName: 'test' }),
  signal: AbortSignal.timeout(120_000),
});
const text = await res.text();
console.log('Webhook status:', res.status);
console.log(text.slice(0, 400));
process.exit(res.ok ? 0 : 1);
