/** Proxy /n8n/* → NUXT_N8N_INTERNAL_URL (แบบ dev วันที่ 26 — ใช้ได้บน Vercel ถ้าตั้ง env) */
export default defineEventHandler(async (event) => {
    const config = useRuntimeConfig();
    const base = String(
        process.env.NUXT_N8N_INTERNAL_URL
        || config.n8nInternalUrl
        || process.env.NUXT_PUBLIC_N8N_BASE
        || config.public.n8nBase
        || '',
    ).trim().replace(/\/$/, '');

    if (!base) {
        throw createError({
            statusCode: 503,
            statusMessage: 'ตั้ง NUXT_N8N_INTERNAL_URL (URL n8n เช่น ngrok → port 5678)',
        });
    }

    const tail = event.path.replace(/^\/n8n\/?/, '');
    const qs = getRequestURL(event).search || '';
    const target = `${base}/${tail}${qs}`;

    const headers: Record<string, string> = {};
    if (/ngrok/i.test(base)) {
        headers['ngrok-skip-browser-warning'] = 'true';
    }

    return proxyRequest(event, target, { headers });
});
