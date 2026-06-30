/** ตรวจ env + ทดสอบเชื่อมต่อ Supabase จริง (มี timeout กัน hang) */
export default defineEventHandler(async (event) => {
    const config = useRuntimeConfig();
    const dbOk = Boolean(String(process.env.DATABASE_URL || '').trim());
    const supabaseOk = isSupabaseConfigured();
    const onVercel = Boolean(process.env.VERCEL);
    const serviceKey = Boolean(String(process.env.SUPABASE_SERVICE_ROLE_KEY || config.supabaseServiceKey || '').trim());
    const cloud = cloudAiStatus(config);
    const useCloud = shouldUseCloudAi(config);
    const n8nUrl = String(process.env.NUXT_N8N_INTERNAL_URL || config.n8nInternalUrl || '').trim();
    const siteOrigin = resolveRequestOrigin(event) || '(from request headers at runtime)';

    const dbPing = dbOk ? await pingDb(18000) : { ok: false as const, error: 'DATABASE_URL missing' };

    let supabasePing: { ok: boolean; error?: string } = { ok: false, error: 'not configured' };
    if (supabaseOk) {
        try {
            const supabase = useSupabaseServer();
            const result = await Promise.race([
                supabase.from('chat_history').select('id').limit(1),
                new Promise<never>((_, reject) => {
                    setTimeout(() => reject(new Error('Supabase ping timeout after 10000ms')), 10000);
                }),
            ]);
            supabasePing = result.error
                ? { ok: false, error: result.error.message }
                : { ok: true };
        } catch (err: unknown) {
            supabasePing = { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    const aiOk = useCloud ? cloud.hasKey : (onVercel ? Boolean(n8nUrl) : true);
    const allOk = dbPing.ok && supabasePing.ok && aiOk;

    return {
        status: allOk ? 'ok' : 'needs_config',
        vercel: onVercel,
        site_origin: siteOrigin,
        database_url: dbOk ? 'configured' : 'missing',
        db_ping: dbPing.ok ? 'ok' : 'fail',
        db_error: dbPing.error || null,
        db_url_mode: dbPing.url_mode || null,
        pharmacists_verified: dbPing.pharmacists_verified ?? null,
        supabase: supabaseOk ? 'configured' : 'missing',
        supabase_ping: supabasePing.ok ? 'ok' : 'fail',
        supabase_error: supabasePing.error || null,
        supabase_service_role: serviceKey ? 'configured' : 'missing (uploads need this)',
        storage_buckets: ['images-pharma', 'images-account', 'uploads'],
        ai: useCloud
            ? (cloud.hasKey ? `cloud/${cloud.provider} (${cloud.model})` : 'missing NUXT_AI_API_KEY')
            : (n8nUrl ? `n8n (${n8nUrl})` : 'n8n (local / npm run dev)'),
        hints: [
            !dbOk && 'Add DATABASE_URL (Supabase pooler port 6543)',
            dbOk && !dbPing.ok && `DB connection failed: ${dbPing.error}`,
            !supabaseOk && 'Add SUPABASE_URL + SUPABASE_KEY (+ NUXT_PUBLIC_* variants)',
            supabaseOk && !supabasePing.ok && `Supabase API failed: ${supabasePing.error}`,
            onVercel && !serviceKey && 'Add SUPABASE_SERVICE_ROLE_KEY for file uploads',
            onVercel && !useCloud && !n8nUrl && 'Add NUXT_N8N_INTERNAL_URL (ngrok URL of n8n port 5678)',
            onVercel && useCloud && n8nUrl && 'Remove NUXT_N8N_INTERNAL_URL when NUXT_AI_MODE=cloud',
            onVercel && useCloud && !cloud.hasKey && 'Add NUXT_AI_API_KEY for Groq cloud AI',
        ].filter(Boolean),
    };
});
