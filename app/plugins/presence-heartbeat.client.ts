/**
 * ส่ง presence ping ขณะผู้ใช้/เภสัชกรเปิดเว็บอยู่ → ใช้นับ "ออนไลน์ขณะนี้" ใน admin dashboard
 */
const PING_INTERVAL_MS = 30_000;

export default defineNuxtPlugin(() => {
    if (!import.meta.client) return;

    const nuxtApp = useNuxtApp();
    let timerId: number | null = null;

    const buildQuery = () => {
        try {
            const raw = localStorage.getItem('user_data');
            if (!raw) return null;
            const u = JSON.parse(raw);
            const role = String(u.role || u.role_account || '').toLowerCase();
            const query: Record<string, string | number> = {};

            if (Number(u.id_pharma) > 0 || role === 'pharmacist') {
                const id = Number(u.id_pharma || u.id);
                if (id > 0) {
                    query.id_pharma = id;
                    query.role = 'pharmacist';
                    return query;
                }
            }

            if (Number(u.id_account) > 0 && role !== 'admin') {
                query.id_account = Number(u.id_account);
                query.role = role === 'member' ? 'user' : (role || 'user');
                return query;
            }

            return null;
        } catch {
            return null;
        }
    };

    const pingPresence = async () => {
        if (document.visibilityState === 'hidden') return;
        const query = buildQuery();
        if (!query) return;

        try {
            await $fetch(nuxtApp.$apiUrl('touch-presence.php'), {
                method: 'POST',
                query,
                credentials: 'include',
            });
        } catch {
            /* ignore — ไม่รบกวน UX */
        }
    };

    const start = () => {
        if (timerId !== null) return;
        pingPresence();
        timerId = window.setInterval(pingPresence, PING_INTERVAL_MS);
    };

    const stop = () => {
        if (timerId !== null) {
            window.clearInterval(timerId);
            timerId = null;
        }
    };

    start();

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            pingPresence();
            start();
        } else {
            stop();
        }
    });

    window.addEventListener('focus', () => pingPresence());
});
