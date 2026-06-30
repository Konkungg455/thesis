/** ดึง TURN credentials จาก Metered.ca (cache 23 ชม.) — ใช้เมื่อตั้ง NUXT_METERED_API_KEY */
let cache: { iceServers: unknown[]; expiresAt: number } | null = null;

export default defineEventHandler(async () => {
    const config = useRuntimeConfig();
    const apiKey = String(config.meteredApiKey || '').trim();
    const appName = String(config.meteredAppName || 'telebotpharmacy').trim();

    if (!apiKey) {
        return { iceServers: null, source: 'none', message: 'NUXT_METERED_API_KEY not set' };
    }

    if (cache && cache.expiresAt > Date.now()) {
        return { iceServers: cache.iceServers, source: 'metered-cache' };
    }

    const url = `https://${appName}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`;
    const iceServers = await $fetch<unknown[]>(url, { timeout: 12000 });

    if (!Array.isArray(iceServers) || !iceServers.length) {
        throw createError({ statusCode: 502, statusMessage: 'Invalid TURN response from Metered' });
    }

    cache = { iceServers, expiresAt: Date.now() + 23 * 60 * 60 * 1000 };
    return { iceServers, source: 'metered' };
});
