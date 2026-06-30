/**
 * /api/heartbeat
 * คืน "boot ID" ที่สุ่มขึ้นมาตอน server start ครั้งล่าสุด
 * ถ้า server restart → boot ID เปลี่ยน → client รู้ทันทีว่าต้อง logout
 */

declare global {
    // eslint-disable-next-line no-var
    var __telebotBootId: string | undefined;
    // eslint-disable-next-line no-var
    var __telebotBootTime: number | undefined;
}

function resolveBootId(): string {
    if (process.env.VERCEL) {
        return `vercel-${process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_ENV || 'prod'}`;
    }
    // คง bootId ข้าม Nitro HMR reload — กัน logout ผิดตอนแก้โค้ดใน dev
    if (!globalThis.__telebotBootId) {
        globalThis.__telebotBootId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        globalThis.__telebotBootTime = Date.now();
    }
    return globalThis.__telebotBootId;
}

const BOOT_ID = resolveBootId();
const BOOT_TIME = globalThis.__telebotBootTime ?? Date.now();

export default defineEventHandler(() => {
    return {
        ok: true,
        bootId: BOOT_ID,
        bootTime: BOOT_TIME,
        now: Date.now()
    };
});
