type ChatSessionRow = {
    session_id: string;
    symptom_name?: string;
};

export function useAdviceEntry() {
    const router = useRouter();
    const { getHistory } = useChatApi();

    const pickResumeSession = (sessions: ChatSessionRow[]) => {
        if (!sessions.length) return null;

        let activeSid = '';
        try { activeSid = localStorage.getItem('telebot_active_bot_session') || ''; } catch {}

        const target = activeSid
            ? sessions.find((s) => s.session_id === activeSid) || sessions[0]
            : sessions[0];

        return target?.session_id ? target : null;
    };

    const buildChatHistoryRoute = (session: ChatSessionRow) => {
        const cat = String(session.symptom_name || '').trim();
        const query: Record<string, string> = { session_id: session.session_id };
        if (cat && cat !== 'ทั่วไป') query.category = cat;
        return { path: '/user/chat-history', query };
    };

    const getResumeChatRoute = async () => {
        if (!import.meta.client) return null;

        try {
            const res = await getHistory();
            const sessions = Array.isArray(res?.data) ? res.data as ChatSessionRow[] : [];
            const target = pickResumeSession(sessions);
            return target ? buildChatHistoryRoute(target) : null;
        } catch {
            return null;
        }
    };

    /** ไปหน้าแชทต่อถ้ามีประวัติ ไม่งั้นไป /Advice */
    const goAdviceOrResumeChat = async (opts?: { forceNew?: boolean }) => {
        if (opts?.forceNew) {
            await router.push('/Advice?new=1');
            return;
        }

        const chatRoute = await getResumeChatRoute();
        if (chatRoute) {
            await router.push(chatRoute);
        } else {
            await router.push('/Advice');
        }
    };

    /** ใช้ใน Advice.vue — redirect ทันทีถ้ามีประวัติ */
    const tryRedirectFromAdvice = async (forceNew: boolean) => {
        if (!import.meta.client || forceNew) return false;

        const chatRoute = await getResumeChatRoute();
        if (!chatRoute) return false;

        await router.replace(chatRoute);
        return true;
    };

    return { getResumeChatRoute, goAdviceOrResumeChat, tryRedirectFromAdvice };
}
