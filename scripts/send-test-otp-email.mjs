import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// โหลด .env
const envPath = join(root, '.env');
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
}

const to = process.argv[2] || process.env.SMTP_USER || 'konkon488@gmail.com';
const jiti = createJiti(import.meta.url, { interopDefault: true });
const { sendOtpEmail } = jiti('../server/utils/mail.ts');

const roles = [
    { role: 'user', name: 'ทดสอบผู้ใช้' },
    { role: 'pharmacist', name: 'ทดสอบเภสัช' },
    { role: 'store', name: 'ทดสอบร้าน' },
    { role: 'admin', name: 'ทดสอบแอดมิน' },
];

console.log(`Sending OTP test emails to: ${to}`);

for (const item of roles) {
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const ok = await sendOtpEmail(to, otp, {
        role: item.role,
        purpose: 'สมัครสมาชิก',
        recipientName: item.name,
    });
    console.log(`${item.role}: ${ok ? 'OK' : 'FAIL'} (OTP ${otp})`);
}

console.log('Done — check inbox (and spam).');
