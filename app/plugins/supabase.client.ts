import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export default defineNuxtPlugin(() => {
    const config = useRuntimeConfig();
    const url = (config.public.supabaseUrl as string || '').trim();
    const key = (config.public.supabaseKey as string || '').trim();

    let supabase: SupabaseClient | null = null;

    if (url && key) {
        supabase = createClient(url, key);
    }

    return {
        provide: {
            supabase,
        },
    };
});
