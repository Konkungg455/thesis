export default defineEventHandler(async (event) => {
    if (!isSupabaseConfigured()) {
        throw createError({
            statusCode: 503,
            statusMessage: 'Supabase is not configured',
        });
    }

    const query = getQuery(event);
    const sessionId = String(query.session_id ?? '').trim();
    if (!sessionId) {
        throw createError({ statusCode: 400, statusMessage: 'Missing session_id' });
    }

    const idAccount = resolveAccountId(event, query);
    const messages = await getChatDetail(idAccount, sessionId);

    if (messages.length === 0) {
        return { status: 'error', message: 'No chat history found' };
    }

    return {
        status: 'success',
        data: messages,
        symptom_name: messages[0]?.symptom_name || 'ทั่วไป',
        backend: 'supabase',
    };
});
