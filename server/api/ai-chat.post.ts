/**
 * Proxy AI — local: n8n+Ollama | Vercel: cloud LLM (Groq/Gemini) ไม่ต้อง ngrok
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

    // Vercel → cloud Groq (ไม่เรียก n8n/ngrok)
    if (shouldUseCloudAi(config)) {
        if (!hasAiApiKey(config)) {
            throw createError({
                statusCode: 503,
                statusMessage: 'ตั้ง NUXT_AI_API_KEY บน Vercel แล้วกด Redeploy (Groq ฟรี: console.groq.com)',
                data: { detail: 'NUXT_AI_API_KEY missing on Vercel', mode: 'cloud' },
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

            if (typeof data === 'string') {
                return { output: data };
            }
            if (data && typeof data === 'object' && 'output' in data) {
                return data;
            }
            const text =
                (data as { text?: string })?.text ||
                (data as { message?: string })?.message ||
                JSON.stringify(data);
            return { output: text };
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

    const e = lastErr as { statusCode?: number; message?: string };
    console.error('[api/ai-chat] n8n failed:', url, e?.message || lastErr);

    const is404 =
        e?.statusCode === 404 || String(e?.message || '').includes('404');
    const onVercel = Boolean(process.env.VERCEL);
    const hint = onVercel
        ? 'ตั้ง NUXT_AI_API_KEY บน Vercel (Groq ฟรี) — ไม่ต้อง ngrok'
        : is404
            ? 'workflow ยังไม่ Activate — รัน npm run dev ใหม่'
            : 'ตรวจว่า n8n เปิดอยู่และ Ollama ทำงาน';

    throw createError({
        statusCode: 502,
        statusMessage: `ไม่สามารถเชื่อมต่อ AI ได้ — ${hint}`,
        data: {
            detail: e?.message || String(lastErr),
            n8nUrl: url,
            mode: 'n8n',
        },
    });
});
