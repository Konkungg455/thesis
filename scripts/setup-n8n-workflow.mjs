/**
 * Import + activate n8n workflow (fixes webhook 404).
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDir, '..');
const n8nData = join(projectRoot, '.tools', 'n8n-data');
const workflowFile = existsSync(join(projectRoot, 'n8n_workflow_32_symptoms.json'))
  ? join(projectRoot, 'n8n_workflow_32_symptoms.json')
  : join(projectRoot, 'n8n_workflow_telebot_chat.json');
const credsFile = join(projectRoot, 'n8n_credentials_ollama.json');
const webhookId = '1f5ea30f-2ff0-4d32-b211-eccb342ee0df';
const n8nVersion = '1.91.2';
const quiet = process.argv.includes('--quiet');

function log(text, color = '') {
  if (!quiet) process.stderr.write(`${text}\n`);
}

function loadNodeTools() {
  const out = spawnSync(process.execPath, [join(scriptDir, 'ensure-node22-for-n8n.mjs')], {
    encoding: 'utf8',
    cwd: projectRoot,
  });
  const line = (out.stdout || '').trim().split('\n').pop();
  return JSON.parse(line || '{}');
}

function n8nEnv(nodeTools) {
  const env = {
    ...process.env,
    N8N_USER_FOLDER: n8nData,
    N8N_RUNNERS_ENABLED: 'true',
    N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE: 'true',
  };
  if (nodeTools.nodeDir) {
    const sep = process.platform === 'win32' ? ';' : ':';
    env.PATH = `${nodeTools.nodeDir}${sep}${env.PATH || ''}`;
  }
  return env;
}

function invokeN8nCli(nodeTools, args) {
  const npx = nodeTools.npxCmd?.includes('/') || nodeTools.npxCmd?.includes('\\')
    ? nodeTools.npxCmd
    : 'npx';
  return spawnSync(npx, ['--yes', `n8n@${n8nVersion}`, ...args], {
    cwd: projectRoot,
    env: n8nEnv(nodeTools),
    stdio: 'ignore',
  }).status ?? 1;
}

async function testWebhookReady() {
  try {
    const res = await fetch(`http://127.0.0.1:5678/webhook/${webhookId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatInput: 'ping', sessionId: 'setup', userName: 'test' }),
      signal: AbortSignal.timeout(15000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function getActiveWorkflowCount(nodeTools) {
  const npx = nodeTools.npxCmd?.includes('/') || nodeTools.npxCmd?.includes('\\')
    ? nodeTools.npxCmd
    : 'npx';
  const out = spawnSync(npx, ['--yes', `n8n@${n8nVersion}`, 'list:workflow', '--active=true', '--onlyId'], {
    cwd: projectRoot,
    env: n8nEnv(nodeTools),
    encoding: 'utf8',
  });
  return (out.stdout || '').split('\n').map((l) => l.trim()).filter(Boolean).length;
}

function killPort5678() {
  if (process.platform === 'win32') return;
  spawnSync('sh', ['-c', "lsof -ti :5678 | xargs kill -9 2>/dev/null || true"], { stdio: 'ignore' });
}

function startN8n(nodeTools) {
  const npx = nodeTools.npxCmd?.includes('/') || nodeTools.npxCmd?.includes('\\')
    ? nodeTools.npxCmd
    : 'npx';
  const env = {
    ...n8nEnv(nodeTools),
    N8N_HOST: '0.0.0.0',
    N8N_PORT: '5678',
    N8N_SECURE_COOKIE: 'false',
    N8N_DIAGNOSTICS_ENABLED: 'false',
    N8N_PERSONALIZATION_ENABLED: 'false',
  };
  const child = spawn(npx, ['--yes', `n8n@${n8nVersion}`, 'start'], {
    cwd: projectRoot,
    env,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

mkdirSync(n8nData, { recursive: true });

if (await testWebhookReady()) {
  log('      n8n webhook OK');
  process.exit(0);
}

log('      Setting up n8n workflow (import + activate)...');
const nodeTools = loadNodeTools();

if (existsSync(credsFile)) invokeN8nCli(nodeTools, ['import:credentials', `-i=${credsFile}`]);
if (existsSync(workflowFile)) invokeN8nCli(nodeTools, ['import:workflow', `-i=${workflowFile}`]);
invokeN8nCli(nodeTools, ['update:workflow', '--all', '--active=true']);

log(`      Active workflows: ${getActiveWorkflowCount(nodeTools)}`);

if (await testWebhookReady()) {
  log('      n8n webhook OK after setup');
  process.exit(0);
}

log('      Restarting n8n to register webhook...');
killPort5678();
await new Promise((r) => setTimeout(r, 3000));
startN8n(nodeTools);

const deadline = Date.now() + 60_000;
while (Date.now() < deadline) {
  if (await testWebhookReady()) {
    log('      n8n webhook OK after restart');
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 3000));
}

log('      WARN: open http://127.0.0.1:5678 and Activate workflow manually');
process.exit(1);
