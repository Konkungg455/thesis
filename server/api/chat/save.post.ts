export default defineEventHandler(async (event) => {
    if (!isSupabaseConfigured()) {
        throw createError({
            statusCode: 503,
            statusMessage: 'Supabase is not configured',
        });
    }

    const body = await readBody(event);
    const idAccount = resolveAccountId(event, body);

    const role = String(body?.role ?? '').trim();
    const message = String(body?.message ?? '').trim();
    const sessionId = String(body?.session_id ?? '').trim();
    const symptomName = String(body?.symptom_name ?? 'ทั่วไป').trim() || 'ทั่วไป';
    const metaJson = body?.meta_json != null ? String(body.meta_json) : null;

    if (!role || !message || !sessionId) {
        throw createError({ statusCode: 400, statusMessage: 'role, message, session_id are required' });
    }

    await saveChatMessage({
        id_account: idAccount,
        role,
        message,
        session_id: sessionId,
        symptom_name: symptomName,
        meta_json: metaJson,
    });

    return {
        status: 'success',
        session: sessionId,
        guest: idAccount === null,
        backend: 'supabase',
    };
});
