const PUBLIC_CACHE_PATHS = ['get_pharmacists.php', 'review-get.php'];

function applyPublicBffCache(event: H3Event, pathLower: string, result: unknown) {
    if (!PUBLIC_CACHE_PATHS.includes(pathLower) || event.method !== 'GET') {
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
        if (event.method === 'GET' && !PUBLIC_CACHE_PATHS.includes(pathLower)) {
            setResponseHeader(event, 'Cache-Control', 'private, no-store, max-age=0');
        }
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
        const isTransientDb = /CONNECTION_DESTROYED|CONNECTION_ENDED|connection|timeout|pool/i.test(message);
        if (isTransientDb) {
            console.warn('[api/bff]', pathname, event.method, message);
        } else {
            console.error('[api/bff]', pathname, event.method, message);
        }
        setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0');
        return {
            status: 'error',
            message: isTransientDb
                ? 'เชื่อมต่อฐานข้อมูลชั่วคราวไม่สำเร็จ กรุณารอสักครู่แล้วลองใหม่'
                : (message || 'เกิดข้อผิดพลาด'),
        };
    }
});
