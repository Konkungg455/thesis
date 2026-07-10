import { isDbConfigured, pingDb } from '../utils/db';

/** อุ่น connection ตอน cold start — ลด latency request แรกบน Vercel */
export default defineNitroPlugin(() => {
    if (!isDbConfigured()) return;
    const timeout = process.env.VERCEL ? 10_000 : 5_000;
    void pingDb(timeout).catch(() => {});
});
