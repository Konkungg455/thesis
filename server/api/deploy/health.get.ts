/** ตรวจ env สำหรับ Vercel deploy */
export default defineEventHandler(() => {
    const config = useRuntimeConfig();
    const dbOk = Boolean(String(process.env.DATABASE_URL || '').trim());
    const supabaseOk = isSupabaseConfigured();
    const onVercel = Boolean(process.env.VERCEL);
    const serviceKey = Boolean(String(process.env.SUPABASE_SERVICE_ROLE_KEY || config.supabaseServiceKey || '').trim());
    const cloud = cloudAiStatus(config);

    return {
        status: dbOk && supabaseOk && (!onVercel || cloud.hasKey) ? 'ok' : 'needs_config',
        vercel: onVercel,
        database_url: dbOk ? 'configured' : 'missing',
        supabase: supabaseOk ? 'configured' : 'missing',
        supabase_service_role: serviceKey ? 'configured' : 'missing (uploads need this)',
        storage_buckets: ['images-pharma', 'images-account', 'uploads'],
        ai: onVercel
            ? (cloud.hasKey ? `cloud/${cloud.provider} (${cloud.model})` : 'missing NUXT_AI_API_KEY')
            : 'local n8n (npm run dev)',
        hints: [
            !dbOk && 'Add DATABASE_URL in Vercel env',
            !supabaseOk && 'Add SUPABASE_URL + SUPABASE_KEY (+ NUXT_PUBLIC_* variants)',
            onVercel && !serviceKey && 'Add SUPABASE_SERVICE_ROLE_KEY for file uploads',
            onVercel && !cloud.hasKey && 'Add NUXT_AI_API_KEY (Groq free: console.groq.com) — no ngrok needed',
        ].filter(Boolean),
    };
});
