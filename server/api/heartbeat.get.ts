/**
 * /api/heartbeat
 * คืน "boot ID" ที่สุ่มขึ้นมาตอน server start ครั้งล่าสุด
 * ถ้า server restart → boot ID เปลี่ยน → client รู้ทันทีว่าต้อง logout
 */

// boot ID — สร้างครั้งเดียวตอน Nuxt server เริ่มทำงาน
// จะเปลี่ยนใหม่ทุกครั้งที่ npm run dev ถูก restart / shut down แล้วเปิดใหม่
const BOOT_ID = process.env.VERCEL
    ? `vercel-${process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_ENV || 'prod'}`
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const BOOT_TIME = Date.now();

export default defineEventHandler(() => {
    return {
        ok: true,
        bootId: BOOT_ID,
        bootTime: BOOT_TIME,
        now: Date.now()
    };
});
