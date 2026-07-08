import type { SupabaseClient } from '@supabase/supabase-js';

export function useSupabase(): SupabaseClient {
    const { $supabase } = useNuxtApp();

    if (!$supabase) {
        throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_KEY in .env');
    }

    return $supabase;
}
