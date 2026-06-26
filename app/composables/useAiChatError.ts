/** ข้อความ error AI ที่เข้าใจง่าย (local vs Vercel) */
export function getAiChatErrorMessage(err: unknown): string {
    const onVercel = import.meta.client && window.location.hostname.endsWith('.vercel.app');
    const statusCode = (err as { statusCode?: number })?.statusCode;
    const detail = String((err as { data?: { detail?: string } })?.data?.detail || '');

    if (statusCode === 502 && onVercel) {
        if (detail.includes('NUXT_AI_API_KEY') || detail.includes('Cloud AI')) {
            return 'ตั้ง NUXT_AI_API_KEY บน Vercel (สมัครฟรีที่ console.groq.com) — ไม่ต้องเปิด ngrok';
        }
        if (detail.includes('127.0.0.1') || detail.includes('NUXT_N8N')) {
            return 'บน Vercel ใช้ NUXT_AI_API_KEY แทน ngrok — ดู VERCEL_DEPLOY.md';
        }
        return 'ไม่สามารถเชื่อมต่อ AI ได้ — ตรวจ NUXT_AI_API_KEY บน Vercel';
    }

    if (statusCode === 502) {
        return 'ไม่สามารถเชื่อมต่อ AI ได้ — ตรวจว่า n8n เปิดอยู่และ workflow ถูก Activate ครับ';
    }

    return 'ไม่สามารถเชื่อมต่อ AI ได้ในขณะนี้ค่ะ ลองใหม่อีกครั้งนะคะ';
}
