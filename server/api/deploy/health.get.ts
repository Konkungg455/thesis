/** ตรวจ env สำหรับ Vercel deploy */
export default defineEventHandler(() => {
    const config = useRuntimeConfig();
    const dbOk = Boolean(String(process.env.DATABASE_URL || '').trim());
    const supabaseOk = isSupabaseConfigured();
    const n8nUrl = (
        process.env.NUXT_N8N_INTERNAL_URL
        || (config.n8nInternalUrl as string)
        || (config.public.n8nBase as string)
        || ''
    ).replace(/\/$/, '');
    const n8nLocalOnly = !n8nUrl || n8nUrl.includes('127.0.0.1') || n8nUrl.includes('localhost');
    const onVercel = Boolean(process.env.VERCEL);

    const serviceKey = Boolean(String(process.env.SUPABASE_SERVICE_ROLE_KEY || config.supabaseServiceKey || '').trim());
    const storageBucket = String(process.env.SUPABASE_STORAGE_BUCKET || 'media').trim();

    return {
        status: dbOk && supabaseOk ? 'ok' : 'needs_config',
        vercel: onVercel,
        database_url: dbOk ? 'configured' : 'missing',
        supabase: supabaseOk ? 'configured' : 'missing',
        supabase_service_role: serviceKey ? 'configured' : 'missing (uploads need this)',
        storage_bucket: storageBucket,
        n8n: n8nLocalOnly
            ? (onVercel ? 'needs_public_url (NUXT_N8N_INTERNAL_URL)' : 'local_ok')
            : 'configured',
        hints: [
            !dbOk && 'Add DATABASE_URL in Vercel env',
            !supabaseOk && 'Add SUPABASE_URL + SUPABASE_KEY (+ NUXT_PUBLIC_* variants)',
            onVercel && !serviceKey && 'Add SUPABASE_SERVICE_ROLE_KEY for file uploads',
            onVercel && n8nLocalOnly && 'Add NUXT_N8N_INTERNAL_URL=https://your-ngrok-or-vps',
        ].filter(Boolean),
    };
});
