/**
 * npm run dev — start Nuxt; Ollama + n8n run in background unless SKIP_AI=1
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDir, '..');
const isWin = process.platform === 'win32';
const nuxiEntry = join(projectRoot, 'node_modules', '@nuxt', 'cli', 'bin', 'nuxi.mjs');

if (process.env.SKIP_AI !== '1') {
  console.log('Starting AI services in background (Ollama + n8n)...');
  if (isWin) {
    spawn('powershell', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', join(scriptDir, 'ensure-ai-local.ps1'),
      '-Quiet',
    ], { cwd: projectRoot, detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn(process.execPath, [join(scriptDir, 'ensure-ai-local.mjs'), '--quiet'], {
      cwd: projectRoot,
      detached: true,
      stdio: 'ignore',
    }).unref();
  }
} else {
  console.log('SKIP_AI=1 - Nuxt only');
}

console.log('Starting Nuxt...');
const nuxtArgs = existsSync(nuxiEntry)
  ? [nuxiEntry, 'dev']
  : ['exec', '--', 'nuxt', 'dev'];
const nuxtCmd = existsSync(nuxiEntry) ? process.execPath : 'npm';
const nuxt = spawn(nuxtCmd, nuxtArgs, {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: isWin && !existsSync(nuxiEntry),
});
nuxt.on('exit', (code) => process.exit(code ?? 0));
