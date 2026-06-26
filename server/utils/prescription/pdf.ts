import puppeteer from 'puppeteer';
import { buildPrescriptionHtml, type PrescriptionRow } from './receiptHtml';

let browserPromise: ReturnType<typeof puppeteer.launch> | null = null;

async function getBrowser() {
    if (!browserPromise) {
        browserPromise = puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
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
