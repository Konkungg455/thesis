import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let serverClient: SupabaseClient | null = null;

export function useSupabaseServer(): SupabaseClient {
    if (serverClient) {
        return serverClient;
    }

    const config = useRuntimeConfig();
    const url = String(config.public.supabaseUrl || '').trim();
    const key = String(
        config.supabaseServiceKey
        || config.public.supabaseKey
        || '',
    ).trim();

    if (!url || !key) {
        throw createError({
            statusCode: 500,
            statusMessage: 'Supabase is not configured (SUPABASE_URL / SUPABASE_KEY)',
        });
    }

    serverClient = createClient(url, key, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    });

    return serverClient;
}

export function isSupabaseConfigured(): boolean {
    const config = useRuntimeConfig();
    return Boolean(
        String(config.public.supabaseUrl || '').trim()
        && String(config.public.supabaseKey || config.supabaseServiceKey || '').trim(),
    );
}
