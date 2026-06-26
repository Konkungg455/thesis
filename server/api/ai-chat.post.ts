/**
 * Proxy ไป n8n webhook — เรียกจาก browser เป็น same-origin (/api/ai-chat)
 * แก้ปัญหา ngrok + Vite proxy /n8n ไม่เสถียร และ timeout สั้นเกิน (Ollama ช้า)
 */
export default defineEventHandler(async (event) => {
    const config = useRuntimeConfig();
    const webhookId =
        (config.public.n8nChatWebhookId as string) ||
        '1f5ea30f-2ff0-4d32-b211-eccb342ee0df';

    const n8nBase = (
        process.env.NUXT_N8N_INTERNAL_URL ||
        'http://127.0.0.1:5678'
    ).replace(/\/$/, '');

    const url = `${n8nBase}/webhook/${webhookId}/chat`;
    const body = await readBody(event);

    const chatInput = String(body?.chatInput ?? '').trim();
    const sessionId = String(body?.sessionId ?? 'guest-session');
    const userName = String(body?.userName ?? body?.user ?? 'guest');

    if (!chatInput) {
        throw createError({
            statusCode: 400,
            statusMessage: 'chatInput is required',
        });
    }

    try {
        const data = await $fetch<Record<string, unknown>>(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: { chatInput, sessionId, userName },
            timeout: 180_000, // Ollama ครั้งแรกอาจใช้เวลานาน
        });

        // n8n chatTrigger คืน { output: "..." } — normalize ให้ frontend
        if (typeof data === 'string') {
            return { output: data };
        }
        if (data && typeof data === 'object' && 'output' in data) {
            return data;
        }
        // บาง workflow คืน text ตรง ๆ
        const text =
            (data as { text?: string })?.text ||
            (data as { message?: string })?.message ||
            JSON.stringify(data);
        return { output: text };
    } catch (err: unknown) {
        const e = err as { statusCode?: number; message?: string; data?: unknown };
        console.error('[api/ai-chat] n8n failed:', url, e?.message || err);

        throw createError({
            statusCode: 502,
            statusMessage:
                'ไม่สามารถเชื่อมต่อ AI ได้ — ตรวจว่า n8n เปิดอยู่และ workflow ถูก Activate',
            data: {
                detail: e?.message || String(err),
                n8nUrl: url,
            },
        });
    }
});
