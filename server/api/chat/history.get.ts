export default defineEventHandler(async (event) => {
    if (!isSupabaseConfigured()) {
        throw createError({
            statusCode: 503,
            statusMessage: 'Supabase is not configured',
        });
    }

    const query = getQuery(event);
    const idAccount = resolveAccountId(event, query);

    let sessionIds: string[] | null = null;
    if (idAccount === null) {
        const raw = String(query.sessions ?? '').trim();
        if (raw) {
            sessionIds = raw.split(',').map((s) => s.trim()).filter(Boolean);
        }
    }

    const data = await listChatSessions(idAccount, sessionIds);

    return {
        status: 'success',
        data,
        backend: 'supabase',
    };
});
