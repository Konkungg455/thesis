import { existsSync } from 'node:fs';
import type { Browser } from 'puppeteer-core';
import { buildPrescriptionHtml, type PrescriptionRow } from './receiptHtml';

let browserPromise: Promise<Browser> | null = null;

const DEFAULT_CHROMIUM_PACK_URL =
    'https://github.com/Sparticuz/chromium/releases/download/v141.0.0/chromium-v141.0.0-pack.tar.br';

function isServerlessRuntime(): boolean {
    return !!(
        process.env.VERCEL
        || process.env.AWS_LAMBDA_FUNCTION_NAME
        || process.env.NITRO_PRESET === 'vercel'
    );
}

function resolveLocalChromePath(): string | undefined {
    const fromEnv = String(process.env.PUPPETEER_EXECUTABLE_PATH || '').trim();
    if (fromEnv && existsSync(fromEnv)) return fromEnv;

    const macCandidates = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    ];
    const linuxCandidates = [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/snap/bin/chromium',
    ];
    const windowsCandidates = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ];

    const list =
        process.platform === 'darwin'
            ? macCandidates
            : process.platform === 'win32'
                ? windowsCandidates
                : linuxCandidates;

    for (const candidate of list) {
        if (candidate && existsSync(candidate)) {
            return candidate;
        }
    }
    return undefined;
}

async function resolveBundledPuppeteerChromePathAsync(): Promise<string | undefined> {
    try {
        const puppeteer = await import('puppeteer');
        const bundled = await puppeteer.default.executablePath();
        if (bundled && existsSync(bundled)) {
            return bundled;
        }
    } catch {
        // puppeteer optional at runtime on serverless
    }
    return undefined;
}

async function resolveExecutablePath(): Promise<string> {
    const fromEnv = String(process.env.PUPPETEER_EXECUTABLE_PATH || '').trim();
    if (fromEnv && existsSync(fromEnv)) return fromEnv;

    if (isServerlessRuntime()) {
        const chromium = await import('@sparticuz/chromium-min');
        const packUrl = String(
            process.env.CHROMIUM_REMOTE_EXEC_PATH || DEFAULT_CHROMIUM_PACK_URL,
        ).trim();
        const path = await chromium.default.executablePath(packUrl);
        if (!path) {
            throw new Error('ไม่สามารถเตรียม Chromium บน serverless ได้');
        }
        return path;
    }

    const bundled = await resolveBundledPuppeteerChromePathAsync();
    if (bundled) return bundled;

    const local = resolveLocalChromePath();
    if (local) return local;

    throw new Error(
        'ไม่พบ Chrome/Chromium สำหรับสร้าง PDF. '
        + 'รัน: npm run pdf:install-chrome '
        + 'หรือตั้งค่า PUPPETEER_EXECUTABLE_PATH ไปยังไฟล์ browser ในเครื่อง',
    );
}

async function launchBrowser(): Promise<Browser> {
    const executablePath = await resolveExecutablePath();

    if (isServerlessRuntime()) {
        const [puppeteerCore, chromium] = await Promise.all([
            import('puppeteer-core'),
            import('@sparticuz/chromium-min'),
        ]);

        return puppeteerCore.default.launch({
            args: [
                ...chromium.default.args,
                '--hide-scrollbars',
                '--disable-web-security',
                '--font-render-hinting=none',
                '--disable-dev-shm-usage',
                '--disable-gpu',
            ],
            defaultViewport: { width: 1280, height: 720 },
            executablePath,
            headless: 'shell',
        });
    }

    // Local dev — ใช้ path ที่ resolve แล้ว (puppeteer cache / Chrome ในเครื่อง)
    const puppeteer = await import('puppeteer');
    return puppeteer.default.launch({
        headless: true,
        executablePath,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
    }) as Promise<Browser>;
}

async function getBrowser(): Promise<Browser> {
    if (!browserPromise) {
        browserPromise = launchBrowser().catch((err) => {
            browserPromise = null;
            const msg = String(err?.message || err || '');
            if (msg.includes('Could not find Chrome') || msg.includes('Browser was not found')) {
                throw new Error(
                    'ไม่พบ Chrome/Chromium สำหรับสร้าง PDF. '
                    + 'รัน: npm run pdf:install-chrome '
                    + 'หรือตั้งค่า PUPPETEER_EXECUTABLE_PATH ไปยังไฟล์ browser ในเครื่อง',
                );
            }
            throw err;
        });
    }
    return browserPromise;
}

export async function buildPrescriptionPdfBinary(data: PrescriptionRow): Promise<Buffer> {
    const html = buildPrescriptionHtml(data);
    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '14mm', right: '16mm', bottom: '16mm', left: '16mm' },
        });
        return Buffer.from(pdf);
    } finally {
        await page.close();
    }
}
