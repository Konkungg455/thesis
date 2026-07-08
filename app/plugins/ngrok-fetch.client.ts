/**
 * ngrok free tier แสดงหน้าเตือนก่อนเข้าเว็บ — ใส่ header นี้ให้ API ได้ JSON จริง
 */
export default defineNuxtPlugin(() => {
    if (!import.meta.client) return;

    const host = window.location.hostname;
    const isTunnel = /ngrok/i.test(host)
        || host.endsWith('.ngrok-free.dev')
        || host.endsWith('.ngrok.io');

    if (!isTunnel) return;

    const tunnelHeaders = { 'ngrok-skip-browser-warning': '1' };

    const _fetch = globalThis.$fetch;
    globalThis.$fetch = ((request: any, opts?: any) => {
        const merged = { ...(opts || {}) };
        merged.headers = { ...tunnelHeaders, ...(merged.headers || {}) };
        return _fetch(request, merged);
    }) as typeof _fetch;
});
