/** ตรวจ env + ทดสอบเชื่อมต่อ Supabase จริง (มี timeout กัน hang) */
export default defineEventHandler(async () => {
    const config = useRuntimeConfig();
    const dbOk = Boolean(String(process.env.DATABASE_URL || '').trim());
    const supabaseOk = isSupabaseConfigured();
    const onVercel = Boolean(process.env.VERCEL);
    const serviceKey = Boolean(String(process.env.SUPABASE_SERVICE_ROLE_KEY || config.supabaseServiceKey || '').trim());
    const cloud = cloudAiStatus(config);
    const siteOrigin = String(
        process.env.NUXT_PUBLIC_SITE_ORIGIN
        || config.public.siteOrigin
        || config.siteOrigin
        || '',
    ).trim();

    const dbPing = dbOk ? await pingDb(8000) : { ok: false as const, error: 'DATABASE_URL missing' };

    let supabasePing: { ok: boolean; error?: string } = { ok: false, error: 'not configured' };
    if (supabaseOk) {
        try {
            const supabase = useSupabaseServer();
            const result = await Promise.race([
                supabase.from('chat_history').select('id').limit(1),
                new Promise<never>((_, reject) => {
                    setTimeout(() => reject(new Error('Supabase ping timeout after 8000ms')), 8000);
                }),
            ]);
            supabasePing = result.error
                ? { ok: false, error: result.error.message }
                : { ok: true };
        } catch (err: unknown) {
            supabasePing = { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    const allOk = dbPing.ok && supabasePing.ok && (!onVercel || cloud.hasKey);

    return {
        status: allOk ? 'ok' : 'needs_config',
        vercel: onVercel,
        site_origin: siteOrigin || 'missing NUXT_PUBLIC_SITE_ORIGIN',
        database_url: dbOk ? 'configured' : 'missing',
        db_ping: dbPing.ok ? 'ok' : 'fail',
        db_error: dbPing.error || null,
        pharmacists_verified: dbPing.pharmacists_verified ?? null,
        supabase: supabaseOk ? 'configured' : 'missing',
        supabase_ping: supabasePing.ok ? 'ok' : 'fail',
        supabase_error: supabasePing.error || null,
        supabase_service_role: serviceKey ? 'configured' : 'missing (uploads need this)',
        storage_buckets: ['images-pharma', 'images-account', 'uploads'],
        ai: onVercel
            ? (cloud.hasKey ? `cloud/${cloud.provider} (${cloud.model})` : 'missing NUXT_AI_API_KEY')
            : 'local n8n (npm run dev)',
        hints: [
            !siteOrigin && 'Add NUXT_PUBLIC_SITE_ORIGIN=https://thesis-telebot-pharmacy.vercel.app',
            !dbOk && 'Add DATABASE_URL (Supabase pooler port 6543)',
            dbOk && !dbPing.ok && `DB connection failed: ${dbPing.error}`,
            !supabaseOk && 'Add SUPABASE_URL + SUPABASE_KEY (+ NUXT_PUBLIC_* variants)',
            supabaseOk && !supabasePing.ok && `Supabase API failed: ${supabasePing.error}`,
            onVercel && !serviceKey && 'Add SUPABASE_SERVICE_ROLE_KEY for file uploads',
            onVercel && !cloud.hasKey && 'Add NUXT_AI_API_KEY (Groq free: console.groq.com)',
        ].filter(Boolean),
    };
});
