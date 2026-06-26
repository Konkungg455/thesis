/**
 * Proxy ไป n8n webhook — เรียกจาก browser เป็น same-origin (/api/ai-chat)
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default defineEventHandler(async (event) => {
    const config = useRuntimeConfig();
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

    const payload = { chatInput, sessionId, userName };
    let lastErr: unknown;

    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const data = await $fetch<Record<string, unknown>>(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
    const hint = is404
        ? 'workflow ยังไม่ Activate — รัน npm run dev ใหม่ (สคริปต์จะ import + activate ให้อัตโนมัติ)'
        : onVercel && n8nBase.includes('127.0.0.1')
            ? 'ตั้ง NUXT_N8N_INTERNAL_URL ใน Vercel ชี้ไป n8n สาธารณะ (เช่น ngrok http 5678)'
            : 'ตรวจว่า n8n เปิดอยู่และ Ollama ทำงาน';

    throw createError({
        statusCode: 502,
        statusMessage: `ไม่สามารถเชื่อมต่อ AI ได้ — ${hint}`,
        data: {
            detail: e?.message || String(lastErr),
            n8nUrl: url,
        },
    });
});
