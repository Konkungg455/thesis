function applyPublicBffCache(event: H3Event, pathLower: string, result: unknown) {
    const cacheablePublic = ['get_pharmacists.php', 'review-get.php'];
    if (!cacheablePublic.includes(pathLower) || event.method !== 'GET') {
        return;
    }

    const isArray = Array.isArray(result);
    const payload = isArray ? null : result as { status?: string; data?: unknown[]; total?: number } | null;
    const count = isArray
        ? result.length
        : (payload?.total ?? payload?.data?.length ?? 0);
    const ok = isArray
        ? count > 0
        : (payload?.status === 'success' && count > 0);

    // อย่า cache ค่าว่าง/error — กัน CDN แสดง "ไม่มีเภสัช" ตลอด
    setResponseHeader(
        event,
        'Cache-Control',
        ok ? 'public, s-maxage=60, stale-while-revalidate=120' : 'no-store, max-age=0',
    );
}

export default defineEventHandler(async (event) => {
    const pathParam = getRouterParam(event, 'path');
    const pathname = Array.isArray(pathParam) ? pathParam.join('/') : (pathParam || '');
    const pathLower = pathname.toLowerCase();

    if (!isMediaPath(pathname)) {
        setResponseHeader(event, 'Content-Type', 'application/json; charset=utf-8');
    }

    if (event.method === 'OPTIONS') {
        return '';
    }

    try {
        const result = await dispatchBff(event, pathname);
        applyPublicBffCache(event, pathLower, result);
        return result;
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[api/bff]', pathname, message);
        setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0');
        return {
            status: 'error',
            message: message || 'เกิดข้อผิดพลาด',
        };
    }
});
