import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

async function resolveExecutablePath() {
    const fromEnv = String(process.env.PUPPETEER_EXECUTABLE_PATH || '').trim();
    if (fromEnv && existsSync(fromEnv)) return fromEnv;

    const bundled = await puppeteer.executablePath();
    if (bundled && existsSync(bundled)) return bundled;

    const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    if (existsSync(mac)) return mac;

    throw new Error('no chrome found');
}

const executablePath = await resolveExecutablePath();
console.log('[test-pdf] using', executablePath);

const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
await page.setContent('<html><body><h1>PDF OK</h1></body></html>', { waitUntil: 'networkidle0' });
const pdf = await page.pdf({ format: 'A4' });
await browser.close();

const out = join(root, 'scripts/_tmp-test.pdf');
writeFileSync(out, pdf);
console.log('[test-pdf] wrote', out, 'bytes', pdf.length);
