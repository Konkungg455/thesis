/**
 * Proxy AI — n8n+Ollama เป็นหลัก, fallback Groq ถ้า n8n ล้ม
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function looksLikeErrorOutput(text: string): boolean {
    const t = String(text || '').trim().toLowerCase();
    if (!t || t.length > 600) return false;
    return /workflow.*activ|npm run dev|n8n.*5678|502|404 not found|cannot (post|get)|econnrefused|fetch failed|ไม่สามารถเชื่อมต่อ ai/i.test(t);
}

export default defineEventHandler(async (event) => {
    const config = useRuntimeConfig();
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

    if (shouldUseCloudAi(config)) {
        if (!hasAiApiKey(config)) {
            throw createError({
                statusCode: 503,
                statusMessage: 'ตั้ง NUXT_AI_API_KEY แล้ว Redeploy',
                data: { detail: 'NUXT_AI_API_KEY missing', mode: 'cloud' },
            });
        }
        try {
            return await callCloudAi(config, chatInput);
        } catch (err: unknown) {
            const e = err as { statusCode?: number; message?: string; statusMessage?: string };
            console.error('[api/ai-chat] cloud failed:', e?.message || err);
            throw createError({
                statusCode: e?.statusCode || 502,
                statusMessage: e?.statusMessage || `Cloud AI ล้มเหลว — ${e?.message || 'ลองใหม่'}`,
                data: { detail: e?.message || String(err), mode: 'cloud' },
            });
        }
    }

    const webhookId =
        (config.public.n8nChatWebhookId as string) ||
        '1f5ea30f-2ff0-4d32-b211-eccb342ee0df';

    const n8nBase = (
        process.env.NUXT_N8N_INTERNAL_URL
        || (config.n8nInternalUrl as string)
        || (config.public.n8nBase as string)
        || 'http://127.0.0.1:5678'
    ).replace(/\/$/, '');

    const url = `${n8nBase}/webhook/${webhookId}/chat`;
    const payload = { chatInput, sessionId, userName };
    let lastErr: unknown;

    const n8nHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (/ngrok/i.test(n8nBase)) {
        n8nHeaders['ngrok-skip-browser-warning'] = 'true';
    }

    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const data = await $fetch<Record<string, unknown>>(url, {
                method: 'POST',
                headers: n8nHeaders,
                body: payload,
                timeout: 180_000,
            });

            let output = '';
            if (typeof data === 'string') {
                output = data;
            } else if (data && typeof data === 'object' && 'output' in data) {
                output = String((data as { output?: unknown }).output ?? '');
            } else {
                output = String(
                    (data as { text?: string })?.text
                    || (data as { message?: string })?.message
                    || JSON.stringify(data),
                );
            }

            if (output && !looksLikeErrorOutput(output)) {
                if (typeof data === 'object' && data && 'output' in data) {
                    return data;
                }
                return { output };
            }

            lastErr = new Error(output || 'empty n8n output');
            break;
        } catch (err: unknown) {
            lastErr = err;
            const e = err as { statusCode?: number; message?: string };
            const is404 =
                e?.statusCode === 404 ||
                String(e?.message || '').includes('404');
            if (is404 && attempt < 2) {
                await sleep(2000);
                continue;
            }
            break;
        }
    }

    // n8n ล้ม → ใช้ Groq อัตโนมัติถ้ามี key (ไม่ต้องรอ activate workflow)
    if (hasAiApiKey(config)) {
        try {
            console.warn('[api/ai-chat] n8n failed — fallback Groq');
            return await callCloudAi(config, chatInput);
        } catch (groqErr) {
            console.error('[api/ai-chat] groq fallback failed:', groqErr);
        }
    }

    const e = lastErr as { statusCode?: number; message?: string };
    console.error('[api/ai-chat] n8n failed:', url, e?.message || lastErr);

    const is404 =
        e?.statusCode === 404 || String(e?.message || '').includes('404');

    throw createError({
        statusCode: 502,
        statusMessage: is404
            ? 'AI ยังไม่พร้อม — เปิด http://127.0.0.1:5678 แล้ว Activate workflow (สีเขียว) หรือตั้ง NUXT_AI_API_KEY'
            : 'AI ยังไม่พร้อม — รัน npm run dev ให้ n8n + Ollama เปิดอยู่ หรือตั้ง NUXT_AI_API_KEY (Groq)',
        data: {
            detail: e?.message || String(lastErr),
            n8nUrl: url,
            mode: 'n8n',
        },
    });
});
