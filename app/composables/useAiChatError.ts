/** ข้อความ error AI — อ่านจาก server ก่อน ไม่บอก ngrok บน Vercel */
export function getAiChatErrorMessage(err: unknown): string {
    const e = err as {
        statusCode?: number;
        statusMessage?: string;
        message?: string;
        data?: { detail?: string; statusMessage?: string; mode?: string };
    };

    const fromServer =
        e?.statusMessage
        || e?.data?.statusMessage
        || (typeof e?.data === 'object' && e?.data && 'message' in e.data ? String((e.data as { message?: string }).message) : '');

    if (fromServer && !fromServer.startsWith('[')) {
        return fromServer.replace(/^ไม่สามารถเชื่อมต่อ AI ได้ — /, '');
    }

    const onHosted =
        import.meta.client
        && (window.location.hostname.endsWith('.vercel.app')
            || !/localhost|127\.0\.0\.1|^192\.168\./.test(window.location.hostname));

    const statusCode = e?.statusCode;
    const detail = String(e?.data?.detail || e?.message || '');

    if (onHosted) {
        if (statusCode === 503 || detail.includes('NUXT_AI_API_KEY')) {
            return 'ตั้ง NUXT_AI_API_KEY บน Vercel แล้วกด Redeploy (Groq ฟรี: console.groq.com) — ไม่ต้อง ngrok';
        }
        if (statusCode === 502) {
            return 'AI บน Vercel ใช้ Groq — ตรวจ NUXT_AI_API_KEY แล้ว Redeploy (ไม่ต้องเปิด n8n/ngrok)';
        }
    }

    if (statusCode === 502) {
        return 'ไม่สามารถเชื่อมต่อ AI ได้ — รัน npm run dev ให้ n8n + Ollama เปิดอยู่';
    }

    return 'ไม่สามารถเชื่อมต่อ AI ได้ในขณะนี้ค่ะ ลองใหม่อีกครั้งนะคะ';
}
