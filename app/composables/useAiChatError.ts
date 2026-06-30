/** ข้อความ error AI — ภาษาเข้าใจง่าย ไม่โชว์ข้อความ tech ในแชท */
export function getAiChatErrorMessage(err: unknown): string {
    const e = err as {
        statusCode?: number;
        statusMessage?: string;
        message?: string;
        data?: { detail?: string; statusMessage?: string; mode?: string };
    };

    const fromServer = String(
        e?.statusMessage
        || e?.data?.statusMessage
        || '',
    ).replace(/^ไม่สามารถเชื่อมต่อ AI ได้ — /, '').trim();

    if (fromServer && !fromServer.startsWith('[')) {
        if (/workflow|activate|npm run|n8n|5678|NUXT_/i.test(fromServer)) {
            return 'ระบบ AI ยังไม่พร้อมค่ะ — รัน npm run dev แล้วเปิด n8n ที่ http://127.0.0.1:5678 กด Activate workflow (สีเขียว) หรือใส่ NUXT_AI_API_KEY ใน .env';
        }
        return fromServer;
    }

    const statusCode = e?.statusCode;

    if (statusCode === 503) {
        return 'ตั้ง NUXT_AI_API_KEY ใน .env (Groq ฟรี) แล้ว restart npm run dev';
    }

    if (statusCode === 502) {
        return 'ระบบ AI ยังไม่พร้อมค่ะ — รัน npm run dev ให้ n8n + Ollama เปิดอยู่ หรือใส่ NUXT_AI_API_KEY ใน .env';
    }

    return 'ขออภัยค่ะ AI ตอบไม่ได้ในตอนนี้ ลองใหม่อีกครั้งนะคะ';
}
