import puppeteer from 'puppeteer';
import { existsSync } from 'node:fs';
import { buildPrescriptionHtml, type PrescriptionRow } from './receiptHtml';

let browserPromise: ReturnType<typeof puppeteer.launch> | null = null;

function resolveLocalChromePath(): string | undefined {
    const fromEnv = String(process.env.PUPPETEER_EXECUTABLE_PATH || '').trim();
    if (fromEnv) return fromEnv;

    const macCandidates = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
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

async function getBrowser() {
    if (!browserPromise) {
        const executablePath = resolveLocalChromePath();
        browserPromise = puppeteer.launch({
            headless: true,
            ...(executablePath ? { executablePath } : {}),
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
        }).catch((err) => {
            browserPromise = null;
            const msg = String(err?.message || err || '');
            if (msg.includes('Could not find Chrome')) {
                throw new Error(
                    'ไม่พบ Chrome/Chromium สำหรับสร้าง PDF. ' +
                    'ให้ติดตั้งด้วยคำสั่ง: npx puppeteer browsers install chrome ' +
                    'หรือกำหนด env PUPPETEER_EXECUTABLE_PATH ไปยังไฟล์ browser ที่มีในเครื่อง',
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
