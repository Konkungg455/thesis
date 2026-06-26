/**
 * server-heartbeat.client.ts
 * 🚨 บังคับ logout ทันทีเมื่อ Nuxt dev server shut down / restart
 *
 * แนวคิด:
 *   - server ให้ bootId ที่เปลี่ยนทุกครั้งที่ start
 *   - client เก็บ bootId ไว้ใน localStorage (รอด page reload และ HMR full-reload)
 *   - เมื่อโหลดหน้าใหม่ / poll → ถ้า bootId ที่ได้จาก server ≠ ที่เคยเก็บ → restart → logout
 *   - poll ทุก 2 วินาที, fail 1 ครั้ง → shutdown → logout
 *   - listen 'vite:ws:disconnect' เพื่อตรวจจับทันทีตอน Ctrl+C
 */

const BOOT_KEY = 'srv_boot_id';
const POLL_INTERVAL_MS = 2_000;
const PING_TIMEOUT_MS = 1_800;
const MAX_FAIL = 1;
const LOG = '[heartbeat]';

const LOGIN_PATH_BY_ROLE: Record<string, string> = {
    user: '/auth/login-user',
    pharmacist: '/auth/login-pharmacist',
    store: '/auth/login-store',
    admin: '/auth/login-admin'
};

export default defineNuxtPlugin(() => {
    if (!import.meta.client) return;

    const router = useRouter();
    let failCount = 0;
    let timerId: number | null = null;
    let isHandlingLogout = false;

    const log = (...args: unknown[]) => {
        try { console.log(LOG, ...args); } catch { /* ignore */ }
    };

    const isOnLoginOrPublicPage = (): boolean => {
        const p = router.currentRoute.value.path || '';
        return (
            p.startsWith('/auth/')
            || p === '/'
            || p.startsWith('/about')
            || p.startsWith('/contact')
        );
    };

    const hasActiveSession = (): boolean => {
        try {
            return !!(localStorage.getItem('user_data') || localStorage.getItem('user_role'));
        } catch {
            return false;
        }
    };

    const getStoredRole = (): string | null => {
        try { return localStorage.getItem('user_role') || null; } catch { return null; }
    };

    const forceLogout = async (reason: 'shutdown' | 'restart') => {
        if (isHandlingLogout) return;
        if (!hasActiveSession()) {
            log('skip logout — no active session');
            return;
        }
        isHandlingLogout = true;
        log('🚨 FORCE LOGOUT —', reason);

        const role = getStoredRole() || 'user';
        const loginPath = LOGIN_PATH_BY_ROLE[role] || '/auth/login-user';

        try {
            localStorage.removeItem('user_data');
            localStorage.removeItem('user_role');
            localStorage.removeItem(BOOT_KEY);
        } catch { /* ignore */ }

        try {
            const { clearUser } = useAuthUser();
            clearUser();
        } catch { /* ignore */ }

        if (timerId !== null) {
            window.clearInterval(timerId);
            timerId = null;
        }

        if (!isOnLoginOrPublicPage()) {
            const msg = reason === 'restart'
                ? 'เซิร์ฟเวอร์รีสตาร์ท กรุณาเข้าสู่ระบบใหม่อีกครั้ง'
                : 'การเชื่อมต่อกับเซิร์ฟเวอร์ขาดหาย กรุณาเข้าสู่ระบบใหม่อีกครั้ง';
            // ใช้ window.location เพื่อ hard navigate (กัน router cache)
            const url = `${loginPath}?reason=${reason === 'restart' ? 'server_restart' : 'server_down'}`;
            try { alert(msg); } catch { /* ignore */ }
            try {
                window.location.replace(url);
            } catch {
                try { await router.replace(url); } catch { /* ignore */ }
            }
        }
        isHandlingLogout = false;
    };

    const pingHeartbeat = async () => {
        try {
            const res = await $fetch<{ bootId: string }>('/api/heartbeat', {
                method: 'GET',
                timeout: PING_TIMEOUT_MS,
                retry: 0,
                // กัน cache ของ browser
                query: { _t: Date.now() }
            });
            const newBootId = res?.bootId;
            if (!newBootId) {
                failCount += 1;
                log('ping fail (no bootId)', failCount, '/', MAX_FAIL);
                if (failCount >= MAX_FAIL) await forceLogout('shutdown');
                return;
            }

            failCount = 0;
            let storedBootId: string | null = null;
            try { storedBootId = localStorage.getItem(BOOT_KEY); } catch { /* ignore */ }

            if (!storedBootId) {
                log('first ping — store bootId', newBootId);
                try { localStorage.setItem(BOOT_KEY, newBootId); } catch { /* ignore */ }
                return;
            }
            if (storedBootId !== newBootId) {
                log('🔄 bootId changed', storedBootId, '→', newBootId);
                try { localStorage.setItem(BOOT_KEY, newBootId); } catch { /* ignore */ }
                await forceLogout('restart');
            }
        } catch (err) {
            failCount += 1;
            log('ping error', failCount, '/', MAX_FAIL, err);
            if (failCount >= MAX_FAIL) await forceLogout('shutdown');
        }
    };

    if (typeof window === 'undefined') return;

    log('plugin loaded — starting heartbeat');

    // 🚀 (A) ถ้ามี Vite HMR client — listen disconnect event (ตรวจจับเร็วสุด ~100ms)
    try {
        const hmr = (import.meta as any).hot;
        if (hmr && typeof hmr.on === 'function') {
            hmr.on('vite:ws:disconnect', () => {
                log('vite:ws:disconnect — ping immediately');
                failCount = Math.max(failCount, MAX_FAIL - 1);
                pingHeartbeat();
            });
            hmr.on('vite:ws:connect', () => {
                log('vite:ws:connect — ping immediately');
                pingHeartbeat();
            });
        }
    } catch { /* ignore */ }

    // 🚀 (B) Polling
    setTimeout(() => {
        pingHeartbeat();
        timerId = window.setInterval(pingHeartbeat, POLL_INTERVAL_MS);
    }, 500);

    // 🚀 (C) Tab focus → ping ทันที
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') pingHeartbeat();
    });
    window.addEventListener('focus', () => pingHeartbeat());

    // 🚀 (D) Online → ping ทันที
    window.addEventListener('online', () => {
        failCount = 0;
        pingHeartbeat();
    });
});
