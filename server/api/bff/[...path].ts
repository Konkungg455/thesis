export default defineEventHandler(async (event) => {
    const pathParam = getRouterParam(event, 'path');
    const pathname = Array.isArray(pathParam) ? pathParam.join('/') : (pathParam || '');
    const pathLower = pathname.toLowerCase();

    if (!isMediaPath(pathname)) {
        setResponseHeader(event, 'Content-Type', 'application/json; charset=utf-8');
    }

    // cache ข้อมูล public บน CDN Vercel — ลด cold start
    const cacheablePublic = [
        'get_pharmacists.php',
        'review-get.php',
    ];
    if (cacheablePublic.includes(pathLower) && event.method === 'GET') {
        setResponseHeader(event, 'Cache-Control', 'public, s-maxage=90, stale-while-revalidate=180');
    }

    if (event.method === 'OPTIONS') {
        return '';
    }

    try {
        return await dispatchBff(event, pathname);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[api/bff]', pathname, message);
        return {
            status: 'error',
            message: message || 'เกิดข้อผิดพลาด',
        };
    }
});
