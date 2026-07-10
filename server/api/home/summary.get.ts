const emptySummary = () => ({
    pharmacists: { status: 'error', message: 'Database temporarily unavailable', data: [] as unknown[] },
    reviews: [] as unknown[],
});

/** ข้อมูลหน้าแรก — เภสัช + รีวิว ใน request เดียว */
export default defineEventHandler(async (event) => {
    setResponseHeader(event, 'Content-Type', 'application/json; charset=utf-8');

    let payload;
    try {
        payload = await fetchHomeSummary(event);
    } catch (err) {
        console.error('[api/home/summary]', err);
        setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0');
        return emptySummary();
    }

    const total = Number(payload?.pharmacists?.total ?? payload?.pharmacists?.data?.length ?? 0);
    const reviewCount = Array.isArray(payload?.reviews) ? payload.reviews.length : 0;

    setResponseHeader(
        event,
        'Cache-Control',
        total > 0 || reviewCount > 0
            ? 'public, s-maxage=180, stale-while-revalidate=600'
            : 'no-store, max-age=0',
    );

    return payload;
});
