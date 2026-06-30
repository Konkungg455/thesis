/** ข้อมูลหน้าแรก — เภสัช + รีวิว ใน request เดียว */
export default defineEventHandler(async (event) => {
    setResponseHeader(event, 'Content-Type', 'application/json; charset=utf-8');

    const payload = await fetchHomeSummary(event);
    const total = Number(payload?.pharmacists?.total ?? payload?.pharmacists?.data?.length ?? 0);

    setResponseHeader(
        event,
        'Cache-Control',
        payload?.pharmacists?.status === 'success' && total > 0
            ? 'public, s-maxage=60, stale-while-revalidate=120'
            : 'no-store, max-age=0',
    );

    return payload;
});
