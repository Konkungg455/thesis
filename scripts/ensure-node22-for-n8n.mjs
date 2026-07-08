/**
 * Ensure Node.js 18–22 for n8n (system Node 23+ is not supported by n8n).
 * Prints JSON: { nodeExe, npxCmd, nodeDir }
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { arch, platform } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDir, '..');
const toolsDir = join(projectRoot, '.tools');
const nodeVersion = '22.14.0';

function getNodeMajor(exe = 'node') {
  try {
    const v = spawnSync(exe, ['-v'], { encoding: 'utf8' }).stdout?.trim() || '';
    const m = v.match(/v(\d+)/);
    return m ? Number(m[1]) : 0;
  } catch {
    return 0;
  }
}

const sysMajor = getNodeMajor();
if (sysMajor >= 18 && sysMajor <= 22) {
  console.log(JSON.stringify({ nodeExe: 'node', npxCmd: 'npx', nodeDir: '' }));
  process.exit(0);
}

function portableTarget() {
  const plat = platform();
  if (plat === 'win32') {
    return {
      dirName: 'node-v22-win-x64',
      archive: `node-v${nodeVersion}-win-x64.zip`,
      url: `https://nodejs.org/dist/v${nodeVersion}/node-v${nodeVersion}-win-x64.zip`,
      kind: 'zip',
      nodeExe: 'node.exe',
      npxCmd: 'npx.cmd',
    };
  }
  const cpu = arch() === 'arm64' ? 'arm64' : 'x64';
  const base = `node-v${nodeVersion}-darwin-${cpu}`;
  return {
    dirName: `node-v22-darwin-${cpu}`,
    archive: `${base}.tar.gz`,
    url: `https://nodejs.org/dist/v${nodeVersion}/${base}.tar.gz`,
    kind: 'tgz',
    nodeExe: 'bin/node',
    npxCmd: 'bin/npx',
    extractSubdir: base,
  };
}

const target = portableTarget();
const nodeDir = join(toolsDir, target.dirName);
const nodeExe = join(nodeDir, target.nodeExe);
const npxCmd = join(nodeDir, target.npxCmd);

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${url}`);
  await pipeline(res.body, createWriteStream(dest));
}

async function ensurePortableNode() {
  if (existsSync(nodeExe)) return;

  mkdirSync(toolsDir, { recursive: true });
  const archivePath = join(toolsDir, target.archive);
  process.stderr.write(`      Downloading Node.js ${nodeVersion} for n8n (one-time)...\n`);

  await download(target.url, archivePath);

  if (target.kind === 'zip') {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    if (existsSync(nodeDir)) rmSync(nodeDir, { recursive: true, force: true });
    await execFileAsync('powershell', [
      '-NoProfile', '-Command',
      `Expand-Archive -Path '${archivePath}' -DestinationPath '${toolsDir}' -Force`,
    ]);
    const extracted = join(toolsDir, `node-v${nodeVersion}-win-x64`);
    if (existsSync(extracted) && extracted !== nodeDir) {
      const { renameSync } = await import('node:fs');
      renameSync(extracted, nodeDir);
    }
  } else {
    const tmpDir = join(toolsDir, '_node-extract');
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
    mkdirSync(tmpDir, { recursive: true });
    execFileSync('tar', ['-xzf', archivePath, '-C', tmpDir], { stdio: 'inherit' });
    const extracted = join(tmpDir, target.extractSubdir);
    if (existsSync(nodeDir)) rmSync(nodeDir, { recursive: true, force: true });
    renameSync(extracted, nodeDir);
    rmSync(tmpDir, { recursive: true, force: true });
  }

  rmSync(archivePath, { force: true });
}

await ensurePortableNode();

if (!existsSync(nodeExe)) {
  process.stderr.write(' FAIL: could not install portable Node 22\n');
  process.exit(1);
}

process.stderr.write(`      Using portable Node 22 for n8n (${target.dirName})\n`);
console.log(JSON.stringify({ nodeExe, npxCmd, nodeDir }));
