import type { H3Event } from 'h3';

function stripTrailingSlash(url: string): string {
    return url.replace(/\/$/, '');
}

function isLocalHost(host: string): boolean {
    return /localhost|127\.0\.0\.1|^192\.168\.|^10\./i.test(host);
}

/** ใช้ domain จาก request จริง — ไม่ pin domain คงที่ */
export function resolveRequestOrigin(event?: H3Event): string {
    const config = useRuntimeConfig();

    if (event) {
        const headers = getRequestHeaders(event);
        const host = (headers['x-forwarded-host'] || headers.host || '').split(',')[0].trim();
        const proto = (headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
        if (host && !isLocalHost(host)) {
            return stripTrailingSlash(`${proto}://${host}`);
        }
    }

    const fromEnv = [
        process.env.NUXT_PUBLIC_SITE_ORIGIN,
        process.env.NUXT_PUBLIC_APP_ORIGIN,
        process.env.SITE_ORIGIN,
        process.env.VERCEL_URL ? `https://${String(process.env.VERCEL_URL).replace(/^https?:\/\//, '')}` : '',
        config.public.siteOrigin,
        config.siteOrigin,
    ]
        .map((v) => stripTrailingSlash(String(v || '').trim()))
        .find((v) => v && !isLocalHost(v));

    return fromEnv || '';
}
