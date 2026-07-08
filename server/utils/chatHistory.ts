import type { H3Event } from 'h3';

export type ChatSessionRow = {
    session_id: string;
    symptom_name: string;
    message_count: number;
    first_at: string;
    last_at: string;
    first_message: string;
    message: string;
    created_at: string;
    round_no?: number;
    round_total?: number;
};

export type ChatMessageRow = {
    id: number | null;
    role: string;
    text: string;
    symptom_name: string;
    created_at: string;
    meta_json: string | null;
};

function notDeletedFilter() {
    return 'or=(is_deleted.eq.0,is_deleted.is.null)';
}

function ownerFilter(idAccount: number | null) {
    return idAccount === null ? 'id_account=is.null' : `id_account=eq.${idAccount}`;
}

export function resolveAccountId(
    event: H3Event,
    body?: Record<string, unknown> | null,
): number | null {
    const raw = body?.id_account ?? getQuery(event).id_account;
    if (raw === null || raw === 'null' || raw === '') {
        return null;
    }
    if (raw === undefined) {
        return null;
    }
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
}

export async function saveChatMessage(input: {
    id_account: number | null;
    role: string;
    message: string;
    session_id: string;
    symptom_name: string;
    meta_json?: string | null;
}) {
    const supabase = useSupabaseServer();
    const row: Record<string, unknown> = {
        id_account: input.id_account,
        role: input.role,
        message: input.message,
        session_id: input.session_id,
        symptom_name: input.symptom_name,
        is_deleted: 0,
    };
    if (input.meta_json) {
        row.meta_json = input.meta_json;
    }

    const { data, error } = await supabase
        .from('chat_history')
        .insert(row)
        .select('id,session_id')
        .single();

    if (error) {
        throw createError({ statusCode: 500, statusMessage: error.message });
    }

    return data;
}

export async function listChatSessions(
    idAccount: number | null,
    sessionIds: string[] | null,
): Promise<ChatSessionRow[]> {
    if (idAccount === null && (!sessionIds || sessionIds.length === 0)) {
        return [];
    }

    const supabase = useSupabaseServer();
    let query = supabase
        .from('chat_history')
        .select('id,session_id,symptom_name,message,created_at')
        .or('is_deleted.eq.0,is_deleted.is.null')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(5000);

    if (idAccount === null) {
        query = query.is('id_account', null).in('session_id', sessionIds || []);
    } else {
        query = query.eq('id_account', idAccount);
    }

    const { data, error } = await query;
    if (error) {
        throw createError({ statusCode: 500, statusMessage: error.message });
    }

    const sessions: Record<string, ChatSessionRow> = {};
    for (const row of data || []) {
        const sid = String(row.session_id || '');
        if (!sid) continue;

        if (!sessions[sid]) {
            sessions[sid] = {
                session_id: sid,
                symptom_name: String(row.symptom_name || 'ทั่วไป'),
                message_count: 0,
                first_at: String(row.created_at || ''),
                last_at: String(row.created_at || ''),
                first_message: String(row.message || ''),
                message: String(row.message || ''),
                created_at: String(row.created_at || ''),
            };
        }

        sessions[sid].message_count += 1;
        sessions[sid].last_at = String(row.created_at || sessions[sid].last_at);
        sessions[sid].created_at = sessions[sid].last_at;
        sessions[sid].message = sessions[sid].first_message;
    }

    let history = Object.values(sessions);
    history.sort((a, b) => String(b.last_at).localeCompare(String(a.last_at)));
    history = history.slice(0, 200);

    const grouped: Record<string, number[]> = {};
    history.forEach((item, idx) => {
        const name = item.symptom_name;
        if (!grouped[name]) grouped[name] = [];
        grouped[name].push(idx);
    });

    for (const idxList of Object.values(grouped)) {
        if (idxList.length <= 1) continue;
        idxList.sort((a, b) => String(history[a].first_at).localeCompare(String(history[b].first_at)));
        idxList.forEach((i, round) => {
            history[i].round_no = round + 1;
            history[i].round_total = idxList.length;
        });
    }

    return history;
}

export async function getChatDetail(
    idAccount: number | null,
    sessionId: string,
): Promise<ChatMessageRow[]> {
    const supabase = useSupabaseServer();
    let query = supabase
        .from('chat_history')
        .select('id,role,message,symptom_name,created_at,meta_json')
        .eq('session_id', sessionId)
        .or('is_deleted.eq.0,is_deleted.is.null')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(1000);

    if (idAccount === null) {
        query = query.is('id_account', null);
    } else {
        query = query.eq('id_account', idAccount);
    }

    const { data, error } = await query;
    if (error) {
        throw createError({ statusCode: 500, statusMessage: error.message });
    }

    return (data || []).map((row) => ({
        id: row.id ?? null,
        role: String(row.role || ''),
        text: String(row.message || ''),
        symptom_name: String(row.symptom_name || ''),
        created_at: String(row.created_at || ''),
        meta_json: row.meta_json ?? null,
    }));
}

export async function softDeleteChatSession(
    idAccount: number | null,
    sessionId: string,
    deletedBy: number | null,
    deletedByRole: string,
) {
    const supabase = useSupabaseServer();
    let query = supabase
        .from('chat_history')
        .update({
            is_deleted: 1,
            deleted_at: new Date().toISOString(),
            deleted_by: deletedBy,
            deleted_by_role: deletedByRole,
        })
        .eq('session_id', sessionId)
        .or('is_deleted.eq.0,is_deleted.is.null');

    if (idAccount === null) {
        query = query.is('id_account', null);
    } else {
        query = query.eq('id_account', idAccount);
    }

    const { data, error } = await query.select('id');
    if (error) {
        throw createError({ statusCode: 500, statusMessage: error.message });
    }

    return data?.length ?? 0;
}

export async function softDeleteChatMessage(
    idAccount: number | null,
    messageId: number,
    sessionId: string | null,
) {
    if (idAccount === null && !sessionId) {
        throw createError({ statusCode: 400, statusMessage: 'Missing session_id for guest' });
    }

    const supabase = useSupabaseServer();
    let query = supabase
        .from('chat_history')
        .update({
            is_deleted: 1,
            deleted_at: new Date().toISOString(),
            deleted_by: idAccount,
            deleted_by_role: idAccount === null ? 'guest' : 'user',
        })
        .eq('id', messageId)
        .or('is_deleted.eq.0,is_deleted.is.null');

    if (idAccount === null) {
        query = query.is('id_account', null).eq('session_id', sessionId!);
    } else {
        query = query.eq('id_account', idAccount);
    }

    const { data, error } = await query.select('id');
    if (error) {
        throw createError({ statusCode: 500, statusMessage: error.message });
    }

    return data?.length ?? 0;
}

// PostgREST filter helpers kept for future direct REST usage
export { notDeletedFilter, ownerFilter };
