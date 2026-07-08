/**
 * Ensure Ollama + n8n are running (no Docker, no n8n Cloud).
 * Usage: node scripts/ensure-ai-local.mjs [--quiet] [--skip-model-pull]
 */
import { spawn, spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDir, '..');
const n8nData = join(projectRoot, '.tools', 'n8n-data');
const model = 'gemma3:4b';
const n8nVersion = '1.91.2';
const quiet = process.argv.includes('--quiet');
const skipModelPull = process.argv.includes('--skip-model-pull');

function log(text) {
  if (!quiet) process.stderr.write(`${text}\n`);
}

function testPort(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port }, () => {
      socket.end();
      resolve(true);
    });
    socket.setTimeout(2000);
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitForPort(port, seconds) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    if (await testPort(port)) return true;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

async function testOllamaModel(name) {
  try {
    const res = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    return (data.models || []).some((m) => m.name === name || m.name === `${name}:latest`);
  } catch {
    return false;
  }
}

function loadNodeTools() {
  const out = spawnSync(process.execPath, [join(scriptDir, 'ensure-node22-for-n8n.mjs')], {
    encoding: 'utf8',
    cwd: projectRoot,
  });
  const line = (out.stdout || '').trim().split('\n').pop();
  return JSON.parse(line || '{}');
}

function startN8nBackground(nodeTools) {
  const npx = nodeTools.npxCmd?.includes('/') || nodeTools.npxCmd?.includes('\\')
    ? nodeTools.npxCmd
    : 'npx';
  const env = {
    ...process.env,
    N8N_USER_FOLDER: n8nData,
    N8N_HOST: '0.0.0.0',
    N8N_PORT: '5678',
    N8N_SECURE_COOKIE: 'false',
    N8N_DIAGNOSTICS_ENABLED: 'false',
    N8N_PERSONALIZATION_ENABLED: 'false',
    N8N_RUNNERS_ENABLED: 'true',
  };
  if (nodeTools.nodeDir) {
    const sep = process.platform === 'win32' ? ';' : ':';
    env.PATH = `${nodeTools.nodeDir}${sep}${env.PATH || ''}`;
  }
  const child = spawn(npx, ['--yes', `n8n@${n8nVersion}`, 'start'], {
    cwd: projectRoot,
    env,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

function startOllama() {
  if (process.platform === 'darwin') {
    spawn('open', ['-a', 'Ollama'], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  if (process.platform === 'win32') {
    const ollamaExe = join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'Ollama.exe');
    spawn(ollamaExe, [], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  spawn('ollama', ['serve'], { detached: true, stdio: 'ignore' }).unref();
}

if (!quiet) {
  log('');
  log('=== Telebot AI Stack (Ollama + n8n local) ===');
  log('');
}

// --- Ollama ---
if (!quiet) process.stderr.write('[1/2] Ollama (port 11434)...');
if (!(await testPort(11434))) {
  log(' starting Ollama...');
  startOllama();
  const ok = await waitForPort(11434, 30);
  if (!ok && !quiet) {
    process.stderr.write(' NOT RUNNING\n');
    process.stderr.write('  -> Install: https://ollama.com/download\n');
    process.exit(1);
  }
}
if (await testPort(11434)) {
  if (!quiet) process.stderr.write(' OK\n');
} else if (!quiet) {
  process.stderr.write(' FAIL\n');
  process.exit(1);
}

if (!skipModelPull && (await testPort(11434)) && !(await testOllamaModel(model))) {
  log(`      Pulling model ${model} (first time)...`);
  spawnSync('ollama', ['pull', model], { stdio: 'ignore' });
}

// --- n8n workflow ---
spawnSync(process.execPath, [join(scriptDir, 'setup-n8n-workflow.mjs'), ...(quiet ? ['--quiet'] : [])], {
  cwd: projectRoot,
  stdio: 'inherit',
});

// --- n8n ---
if (!quiet) process.stderr.write('[2/2] n8n (port 5678)...');
if (await testPort(5678)) {
  if (!quiet) process.stderr.write(' OK (already running)\n');
} else {
  if (!quiet) process.stderr.write(' starting...\n');
  const nodeTools = loadNodeTools();
  startN8nBackground(nodeTools);
  const waitSec = quiet ? 12 : 45;
  const ok = await waitForPort(5678, waitSec);
  if (ok) {
    if (!quiet) process.stderr.write(' OK\n');
  } else if (!quiet) {
    process.stderr.write(' starting (wait for n8n)...\n');
  }
}

if (await testPort(5678)) {
  spawnSync(process.execPath, [join(scriptDir, 'setup-n8n-workflow.mjs'), ...(quiet ? ['--quiet'] : [])], {
    cwd: projectRoot,
    stdio: 'inherit',
  });
}

if (!quiet) {
  log('');
  log('  Ollama: http://127.0.0.1:11434');
  log('  n8n:    http://127.0.0.1:5678');
  log('');
}
