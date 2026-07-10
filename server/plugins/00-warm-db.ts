import { isDbConfigured, pingDb } from '../utils/db';
import { fetchHomeSummary } from '../utils/bff/homeSummary';

/** อุ่น connection + cache หน้าแรก ตอน cold start — ลด latency request แรกบน Vercel */
export default defineNitroPlugin(() => {
    if (!isDbConfigured()) return;
    const timeout = process.env.VERCEL ? 10_000 : 5_000;
    void pingDb(timeout).catch(() => {});
    void fetchHomeSummary().catch(() => {});
});
