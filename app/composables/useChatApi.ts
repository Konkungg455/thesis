export const GUEST_SESSIONS_KEY = 'telebot_guest_sessions';

export function useChatApi() {
    const getAccountId = (): number | null => {
        if (!import.meta.client) return null;
        try {
            const raw = localStorage.getItem('user_data');
            if (!raw) return null;
            const user = JSON.parse(raw);
            const id = Number(user.id_account || user.id);
            return Number.isFinite(id) && id > 0 ? id : null;
        } catch {
            return null;
        }
    };

    const readGuestSessions = (): string[] => {
        if (!import.meta.client) return [];
        try {
            const raw = localStorage.getItem(GUEST_SESSIONS_KEY) || '[]';
            const arr = JSON.parse(raw);
            return Array.isArray(arr)
                ? arr.filter((s) => typeof s === 'string' && s.length > 0)
                : [];
        } catch {
            return [];
        }
    };

    const rememberGuestSession = (sessionId: string) => {
        if (!import.meta.client || !sessionId) return;
        try {
            const list = readGuestSessions();
            if (!list.includes(sessionId)) {
                list.unshift(sessionId);
                localStorage.setItem(GUEST_SESSIONS_KEY, JSON.stringify(list.slice(0, 200)));
            }
        } catch { /* ignore */ }
    };

    const accountQuery = () => {
        const id = getAccountId();
        return id ? { id_account: String(id) } : {};
    };

    const saveMessage = async (body: Record<string, unknown>) => {
        const id = getAccountId();
        return $fetch('/api/chat/save', {
            method: 'POST',
            body: {
                ...body,
                id_account: id,
            },
        });
    };

    const getHistory = async (guestSessionIds?: string[]) => {
        const id = getAccountId();
        const query: Record<string, string> = id
            ? { id_account: String(id) }
            : {};

        if (!id) {
            const ids = guestSessionIds ?? readGuestSessions();
            if (ids.length > 0) {
                query.sessions = ids.join(',');
            }
        }

        return $fetch('/api/chat/history', { query });
    };

    const getDetail = async (sessionId: string) => {
        const id = getAccountId();
        const query: Record<string, string> = { session_id: sessionId };
        if (id) query.id_account = String(id);
        return $fetch('/api/chat/detail', { query });
    };

    const deleteSession = async (sessionId: string) => {
        const id = getAccountId();
        return $fetch('/api/chat/delete-session', {
            method: 'POST',
            body: {
                session_id: sessionId,
                id_account: id,
            },
        });
    };

    const deleteMessage = async (messageId: number, sessionId?: string) => {
        const id = getAccountId();
        return $fetch('/api/chat/delete-message', {
            method: 'POST',
            body: {
                message_id: messageId,
                session_id: sessionId || null,
                id_account: id,
            },
        });
    };

    return {
        getAccountId,
        readGuestSessions,
        rememberGuestSession,
        saveMessage,
        getHistory,
        getDetail,
        deleteSession,
        deleteMessage,
        GUEST_SESSIONS_KEY,
    };
}
