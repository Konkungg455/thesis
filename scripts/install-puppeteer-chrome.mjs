import { execSync } from 'node:child_process';

if (process.env.VERCEL || process.env.SKIP_PUPPETEER_CHROME === '1') {
    console.log('[pdf] skip puppeteer chrome install on serverless/CI');
    process.exit(0);
}

try {
    console.log('[pdf] installing puppeteer chrome for local PDF generation...');
    execSync('npx puppeteer browsers install chrome', { stdio: 'inherit' });
    console.log('[pdf] puppeteer chrome ready');
} catch (err) {
    console.warn('[pdf] puppeteer chrome install failed — use system Chrome or set PUPPETEER_EXECUTABLE_PATH');
    console.warn(String(err?.message || err));
}
