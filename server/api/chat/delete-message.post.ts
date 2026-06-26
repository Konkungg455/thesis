export default defineEventHandler(async (event) => {
    if (!isSupabaseConfigured()) {
        throw createError({
            statusCode: 503,
            statusMessage: 'Supabase is not configured',
        });
    }

    const body = await readBody(event);
    const messageId = Number(body?.message_id ?? 0);
    const sessionId = String(body?.session_id ?? '').trim() || null;

    if (!Number.isFinite(messageId) || messageId <= 0) {
        throw createError({ statusCode: 400, statusMessage: 'Missing message_id' });
    }

    const idAccount = resolveAccountId(event, body);
    const deletedRows = await softDeleteChatMessage(idAccount, messageId, sessionId);

    if (deletedRows === 0) {
        return {
            status: 'error',
            message: 'ไม่พบข้อความ หรือไม่มีสิทธิ์ลบ',
            deleted_rows: 0,
        };
    }

    return {
        status: 'success',
        message_id: messageId,
        deleted_rows: deletedRows,
        backend: 'supabase',
    };
});
