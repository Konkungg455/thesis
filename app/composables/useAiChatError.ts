/** ข้อความ error AI ที่เข้าใจง่าย (local vs Vercel) */
export function getAiChatErrorMessage(err: unknown): string {
    const onVercel = import.meta.client && window.location.hostname.endsWith('.vercel.app');
    const statusCode = (err as { statusCode?: number })?.statusCode;
    const detail = String((err as { data?: { detail?: string } })?.data?.detail || '');

    if (statusCode === 502 && onVercel) {
        if (detail.includes('127.0.0.1') || detail.includes('NUXT_N8N')) {
            return 'AI บนเว็บ Vercel ต้องตั้ง NUXT_N8N_INTERNAL_URL ชี้ไป ngrok (ngrok http 5678) และเปิด n8n ในเครื่องไว้ครับ';
        }
        return 'ไม่สามารถเชื่อมต่อ AI ได้ — ตรวจว่า n8n + ngrok เปิดอยู่และ workflow ถูก Activate ครับ';
    }

    if (statusCode === 502) {
        return 'ไม่สามารถเชื่อมต่อ AI ได้ — ตรวจว่า n8n เปิดอยู่และ workflow ถูก Activate ครับ';
    }

    return 'ไม่สามารถเชื่อมต่อ AI ได้ในขณะนี้ค่ะ ลองใหม่อีกครั้งนะคะ';
}
