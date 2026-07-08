/** ตรวจว่า AI พร้อมใช้ — ค่าเริ่มต้น n8n+Ollama (แบบ 26 มิ.ย.) */
export default defineEventHandler(() => {
    const config = useRuntimeConfig();
    const cloud = cloudAiStatus(config);
    const useCloud = shouldUseCloudAi(config);
    const n8nUrl = String(
        process.env.NUXT_N8N_INTERNAL_URL
        || config.n8nInternalUrl
        || config.public.n8nBase
        || '',
    ).trim();

    return {
        mode: useCloud ? 'cloud' : 'n8n',
        vercel: Boolean(process.env.VERCEL),
        n8n: {
            configured: Boolean(n8nUrl) || !process.env.VERCEL,
            url: n8nUrl || 'http://127.0.0.1:5678 (local dev)',
            webhookId: config.public.n8nChatWebhookId,
        },
        cloud: {
            enabled: useCloud,
            configured: cloud.hasKey,
            provider: cloud.provider,
            model: cloud.model,
        },
        hint: useCloud && !cloud.hasKey
            ? 'Add NUXT_AI_API_KEY or set NUXT_AI_MODE=n8n'
            : (!useCloud && process.env.VERCEL && !n8nUrl
                ? 'Add NUXT_N8N_INTERNAL_URL (ngrok URL of n8n) on Vercel'
                : null),
    };
});
