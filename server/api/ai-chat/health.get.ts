/** ตรวจว่า AI พร้อมใช้ (Vercel = Groq, local = n8n) */
export default defineEventHandler(() => {
    const config = useRuntimeConfig();
    const cloud = cloudAiStatus(config);
    const onVercel = Boolean(process.env.VERCEL);

    return {
        mode: onVercel ? 'cloud' : (cloud.enabled ? 'cloud' : 'n8n'),
        vercel: onVercel,
        groq: {
            configured: cloud.hasKey,
            provider: cloud.provider,
            model: cloud.model,
        },
        hint: onVercel && !cloud.hasKey
            ? 'Add NUXT_AI_API_KEY on Vercel then Redeploy — no ngrok needed'
            : null,
    };
});
