import { buildSupabasePublicUrl } from '~/utils/mediaStorage';

const isTunnelHost = (hostname: string) =>
    /ngrok/i.test(hostname)
    || hostname.endsWith('.ngrok-free.dev')
    || hostname.endsWith('.ngrok.io')
    || hostname.endsWith('.trycloudflare.com');

const isPrivateLanHost = (hostname: string) =>
    hostname === 'localhost'
    || hostname === '127.0.0.1'
    || /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)
    || /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);

/** Vercel / production — ไม่มี XAMPP /4 */
const isHostedProduction = (hostname: string) =>
    hostname.endsWith('.vercel.app')
    || (!isPrivateLanHost(hostname) && !isTunnelHost(hostname) && hostname.includes('.'));

export default defineNuxtPlugin(() => {
    const config = useRuntimeConfig();

    const useSupabaseBackend = () => {
        if (config.public.useSupabaseBackend === false) {
            return false;
        }
        if (Boolean(String(config.public.supabaseUrl || '').trim())) {
            return true;
        }
        // Vercel / production — ใช้ /api/bff แทน XAMPP /4
        if (import.meta.client && isHostedProduction(window.location.hostname)) {
            return true;
        }
        return false;
    };

    const getBffBase = () => {
        if (import.meta.client) {
            return `${window.location.origin}/api/bff`;
        }

        const headers = useRequestHeaders(['x-forwarded-host', 'host', 'x-forwarded-proto']);
        const host = (headers['x-forwarded-host'] || headers.host || 'localhost:3000').split(',')[0].trim();
        const proto = (headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
        return `${proto}://${host}/api/bff`;
    };

    const getApiBase = () => {
        if (useSupabaseBackend()) {
            return getBffBase();
        }

        if (import.meta.client) {
            const { protocol, hostname, host } = window.location;

            if (isTunnelHost(hostname)) {
                return `${protocol}//${host}/4`;
            }
        } else {
            // SSR — อ่าน host จาก proxy/ngrok headers
            const headers = useRequestHeaders(['x-forwarded-host', 'host', 'x-forwarded-proto']);
            const host = (headers['x-forwarded-host'] || headers.host || '').split(',')[0].trim();
            const proto = (headers['x-forwarded-proto'] || 'http').split(',')[0].trim();

            if (host && isTunnelHost(host)) {
                return `${proto}://${host}/4`;
            }
        }

        const fromEnv = (config.public.apiBase as string || '').trim();
        if (fromEnv) {
            if (import.meta.client && isTunnelHost(window.location.hostname)) {
                return `${window.location.protocol}//${window.location.host}/4`;
            }
            return fromEnv.replace(/\/$/, '');
        }

        if (import.meta.client) {
            const host = window.location.hostname;
            if (isPrivateLanHost(host)) {
                return `http://${host}/4`;
            }
            if (isHostedProduction(host)) {
                return `${window.location.origin}/api/bff`;
            }
            return `${window.location.protocol}//${window.location.host}/4`;
        }

        return 'http://localhost/4';
    };

    const getN8nBase = () => {
        // 🆕 ngrok / Cloudflare Tunnel — ผ่าน proxy /n8n (vite proxy → 127.0.0.1:5678)
        //    เพราะ tunnel forward แค่ port เดียว (Nuxt 3001) — port 5678 เข้าไม่ถึง
        if (import.meta.client) {
            const { protocol, hostname, host } = window.location;
            if (isTunnelHost(hostname)) {
                return `${protocol}//${host}/n8n`;
            }
        } else {
            const headers = useRequestHeaders(['x-forwarded-host', 'host', 'x-forwarded-proto']);
            const host = (headers['x-forwarded-host'] || headers.host || '').split(',')[0].trim();
            const proto = (headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
            if (host && isTunnelHost(host)) {
                return `${proto}://${host}/n8n`;
            }
        }

        const fromEnv = (config.public.n8nBase as string || '').trim();
        if (fromEnv) {
            // ถ้าเข้า ngrok แต่ ENV ตั้งเป็น LAN IP → fallback กลับมาใช้ /n8n
            if (import.meta.client && isTunnelHost(window.location.hostname)) {
                return `${window.location.protocol}//${window.location.host}/n8n`;
            }
            return fromEnv.replace(/\/$/, '');
        }
        if (import.meta.client) {
            return `http://${window.location.hostname}:5678`;
        }
        return 'http://localhost:5678';
    };

    const chatWebhookId = (config.public.n8nChatWebhookId as string) || '1f5ea30f-2ff0-4d32-b211-eccb342ee0df';
    const n8nWebhookPath = `/webhook/${chatWebhookId}/chat`;

    const buildSupabaseMediaUrl = (folder: string, filename: string) => {
        const supabaseUrl = String(config.public.supabaseUrl || '').trim();
        return buildSupabasePublicUrl(supabaseUrl, folder, filename);
    };

    /** รูป profile / เภสัช — บน Vercel ใช้ Supabase Storage public URL */
    const resolveMediaUrl = (folder: string, file?: string | null) => {
        const name = String(file || 'default.png').trim() || 'default.png';
        const useCloudMedia = useSupabaseBackend()
            || (import.meta.client && isHostedProduction(window.location.hostname));

        if (useCloudMedia) {
            const pub = buildSupabaseMediaUrl(folder, name);
            if (pub) return pub;
        }
        return `${getApiBase()}/${folder}/${name}`;
    };

    /** URL สำหรับส่งข้อความไป n8n Chat Trigger */
    const n8nChatUrl = () => {
        // ฝั่ง browser: ใช้ Nuxt proxy /api/ai-chat → n8n ในเครื่อง (เสถียรกว่า /n8n ผ่าน Vite)
        if (import.meta.client) {
            return '/api/ai-chat';
        }
        // SSR / server: ยิงตรง n8n ในเครื่อง
        const base = (config.public.n8nBase as string || '').trim().replace(/\/$/, '')
            || 'http://127.0.0.1:5678';
        return `${base}${n8nWebhookPath}`;
    };

    const appendBffAuthQuery = (url: string): string => {
        if (!useSupabaseBackend() || !import.meta.client) {
            return url;
        }
        try {
            const saved = localStorage.getItem('user_data');
            if (!saved) return url;
            const u = JSON.parse(saved);
            const params = new URLSearchParams();
            if (u.id_account) params.set('id_account', String(u.id_account));
            else if ((u.role || u.role_account) === 'user' && u.id) params.set('id_account', String(u.id));
            if (u.id_pharma) params.set('id_pharma', String(u.id_pharma));
            else if ((u.role || u.role_account) === 'pharmacist' && u.id) params.set('id_pharma', String(u.id));
            const storeId = u.id_store_accounts || u.store_id;
            if (storeId) params.set('id_store_accounts', String(storeId));
            else if ((u.role || u.role_account) === 'store' && u.id) params.set('id_store_accounts', String(u.id));
            if (u.id_account_admin) params.set('id_account_admin', String(u.id_account_admin));
            const role = u.role || u.role_account;
            const urlHasRole = /(?:^|[?&])role=/i.test(url);
            if (role && !urlHasRole) params.set('role', role);
            const qs = params.toString();
            if (!qs) return url;
            return url + (url.includes('?') ? '&' : '?') + qs;
        } catch {
            return url;
        }
    };

    return {
        provide: {
            apiBase: getApiBase(),
            getApiBase,
            apiUrl: (path: string) => {
                const clean = path.replace(/^\//, '');
                return appendBffAuthQuery(`${getApiBase()}/${clean}`);
            },
            getN8nBase,
            n8nChatUrl,
            resolveMediaUrl,
            imagesAccount: (file?: string | null) => resolveMediaUrl('images_account', file),
            imagesPharma: (file?: string | null) => resolveMediaUrl('images_pharma', file),
            uploadsChat: (file: string) => resolveMediaUrl('uploads/chat', file),
            storeProfileImage: (file?: string | null) => resolveMediaUrl('uploads/store_profiles', file),
        },
    };
});
