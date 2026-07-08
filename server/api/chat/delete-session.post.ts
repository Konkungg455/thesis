export default defineEventHandler(async (event) => {
    if (!isSupabaseConfigured()) {
        throw createError({
            statusCode: 503,
            statusMessage: 'Supabase is not configured',
        });
    }

    const body = await readBody(event);
    const sessionId = String(body?.session_id ?? '').trim();
    if (!sessionId) {
        throw createError({ statusCode: 400, statusMessage: 'Missing session_id' });
    }

    const idAccount = resolveAccountId(event, body);
    const deletedRows = await softDeleteChatSession(
        idAccount,
        sessionId,
        idAccount,
        idAccount === null ? 'guest' : 'user',
    );

    return {
        status: 'success',
        session_id: sessionId,
        deleted_rows: deletedRows,
        backend: 'supabase',
    };
});
