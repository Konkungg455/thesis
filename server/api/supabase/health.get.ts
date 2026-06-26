export default defineEventHandler(async () => {
    if (!isSupabaseConfigured()) {
        return {
            status: 'error',
            message: 'Supabase is not configured',
        };
    }

    try {
        const supabase = useSupabaseServer();
        const { data, error } = await supabase
            .from('chat_history')
            .select('id')
            .limit(1);

        if (error) {
            throw error;
        }

        return {
            status: 'success',
            backend: 'supabase',
            sample_rows: data?.length ?? 0,
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
            status: 'error',
            message,
        };
    }
});
