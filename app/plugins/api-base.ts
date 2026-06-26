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

export default defineNuxtPlugin(() => {
    const config = useRuntimeConfig();

    const getApiBase = () => {
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

    /** URL สำหรับส่งข้อความไป n8n Chat Trigger */
    const n8nChatUrl = () => {
        // ฝั่ง browser: ใช้ /n8n บน host เดียวกับ Nuxt → vite proxy → localhost:5678 (ไม่ติด CORS, ไม่พึ่ง XAMPP)
        if (import.meta.client) {
            return `${window.location.origin}/n8n${n8nWebhookPath}`;
        }
        // SSR / server: ยิงตรง n8n ในเครื่อง
        const base = (config.public.n8nBase as string || '').trim().replace(/\/$/, '')
            || 'http://127.0.0.1:5678';
        return `${base}${n8nWebhookPath}`;
    };

    return {
        provide: {
            apiBase: getApiBase(),
            getApiBase,
            apiUrl: (path: string) => {
                const clean = path.replace(/^\//, '');
                return `${getApiBase()}/${clean}`;
            },
            getN8nBase,
            n8nChatUrl,
        },
    };
});
