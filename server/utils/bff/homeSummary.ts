import type { H3Event } from 'h3';

type PharmacistPayload = {
    status: string;
    total?: number;
    data: unknown[];
    message?: string;
};

function isValidReviewRow(row: unknown): boolean {
    if (!row || typeof row !== 'object') return false;
    const r = row as Record<string, unknown>;
    return 'comment' in r || 'rating' in r || ('firstname' in r && !('id_pharma' in r));
}

function isValidHomeSummary(payload: unknown): payload is { pharmacists: PharmacistPayload; reviews: unknown[] } {
    if (!payload || typeof payload !== 'object') return false;
    const p = payload as { pharmacists?: PharmacistPayload; reviews?: unknown[] };
    if (!p.pharmacists || !Array.isArray(p.reviews)) return false;
    if (p.reviews.length > 0 && !isValidReviewRow(p.reviews[0])) return false;
    return true;
}

const PHARMA_CACHE_KEY = 'home:pharmacists';
const REVIEWS_CACHE_KEY = 'home:reviews';
const SUMMARY_CACHE_KEY = 'home:summary';
const CACHE_TTL_MS = 300_000;

/** โหลดข้อมูลหน้าแรกครั้งเดียว — ลด cold start + round-trip บน Vercel */
export async function fetchHomeSummary(event?: H3Event) {
    const q = event ? getQuery(event) : {};
    if (String(q.nocache || '') === '1') {
        clearBffCache(SUMMARY_CACHE_KEY);
        clearBffCache(PHARMA_CACHE_KEY);
        clearBffCache(REVIEWS_CACHE_KEY);
        clearBffCachePrefix('pharmacists:');
    }

    const skipCache = String(q.nocache || '') === '1';
    const cached = getBffCache(SUMMARY_CACHE_KEY);
    if (cached && isValidHomeSummary(cached) && !skipCache) return cached;

    // cache ย่อยยังอยู่ — รวมกลับได้ทันทีโดยไม่ต้อง query DB ทั้งก้อน
    if (!skipCache) {
        const cachedPharma = (getBffCache(PHARMA_CACHE_KEY) ?? getBffCacheStale(PHARMA_CACHE_KEY)) as PharmacistPayload | null;
        const cachedReviews = (getBffCache(REVIEWS_CACHE_KEY) ?? getBffCacheStale(REVIEWS_CACHE_KEY)) as unknown[] | null;
        if (cachedPharma && Array.isArray(cachedReviews)) {
            const quick = { pharmacists: cachedPharma, reviews: cachedReviews };
            if (isValidHomeSummary(quick)) {
                setBffCache(SUMMARY_CACHE_KEY, quick, CACHE_TTL_MS);
                return quick;
            }
        }
    }

    const stale = getBffCacheStale(SUMMARY_CACHE_KEY);

    let pharmacists: PharmacistPayload;
    let reviews: unknown[];

    try {
        [pharmacists, reviews] = await Promise.all([
            fetchPharmacistsPayload(event),
            fetchReviewsPayload(),
        ]);
    } catch (err) {
        console.warn('[home/summary] fetch failed:', err);
        if (stale && isValidHomeSummary(stale)) return stale;
        return {
            pharmacists: { status: 'error', message: dbUnavailableMessage(), data: [] },
            reviews: [],
        };
    }

    const payload = { pharmacists, reviews };

    if (isValidHomeSummary(payload)) {
        const total = Number(pharmacists?.total ?? pharmacists?.data?.length ?? 0);
        const reviewCount = Array.isArray(reviews) ? reviews.length : 0;
        if (total > 0 || reviewCount > 0) {
            setBffCache(SUMMARY_CACHE_KEY, payload, CACHE_TTL_MS);
        }
    }

    return payload;
}

async function fetchPharmacistsPayload(event?: H3Event): Promise<PharmacistPayload> {
    const q = event ? getQuery(event) : {};
    const skipCache = String(q.nocache || '') === '1';

    if (!skipCache) {
        const cached = getBffCache(PHARMA_CACHE_KEY);
        if (cached) return cached as PharmacistPayload;
    }

    if (!isDbConfigured()) {
        return { status: 'error', message: dbUnavailableMessage(), data: [] };
    }

    const userLat = q.lat ? Number(q.lat) : null;
    const userLng = q.lng ? Number(q.lng) : null;
    const hasGps = userLat != null && userLng != null
        && Number.isFinite(userLat) && Number.isFinite(userLng);

    const onServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
    const timeoutMs = onServerless ? 22_000 : 30_000;

    let rows;
    try {
        rows = await dbQuery(async (sql) => {
            if (hasGps) {
                return sql`
                    SELECT p.id_pharma, p.firstname_pharma, p.lastname_pharma,
                           p.images_pharma, p.work_time, p.status_verify, p.id_store,
                           COALESCE(NULLIF(TRIM(d.store_name), ''), NULLIF(TRIM(p.store_name), '')) AS store_name,
                           d.latitude, d.longitude,
                           d.house_no, d.road, d.sub_district, d.district, d.province
                    FROM pharmacist_account p
                    LEFT JOIN phamacy_store_accounts a ON a.id_store_accounts = p.id_store
                          AND a.status = 1
                          AND (a.admin_status IS NULL OR a.admin_status = 'approved')
                    LEFT JOIN phamacy_store_details d ON d.id_store_accounts = p.id_store
                    WHERE p.status_verify = 1
                `;
            }
            return sql`
                SELECT p.id_pharma, p.firstname_pharma, p.lastname_pharma,
                       p.images_pharma, p.work_time, p.id_store,
                       COALESCE(NULLIF(TRIM(d.store_name), ''), NULLIF(TRIM(p.store_name), '')) AS store_name
                FROM pharmacist_account p
                LEFT JOIN phamacy_store_details d ON d.id_store_accounts = p.id_store
                WHERE p.status_verify = 1
            `;
        }, { timeoutMs });
    } catch (err) {
        console.warn('[home/summary] pharmacists query failed:', err);
        const stale = getBffCacheStale(PHARMA_CACHE_KEY);
        if (stale) return stale as PharmacistPayload;
        return { status: 'error', message: dbUnavailableMessage(), data: [] };
    }

    if (rows === null) {
        const stale = getBffCacheStale(PHARMA_CACHE_KEY);
        if (stale) return stale as PharmacistPayload;
        return { status: 'error', message: dbUnavailableMessage(), data: [] };
    }

    const pharmacists = rows.map((row) => {
        const address = hasGps
            ? [row.house_no, row.road, row.sub_district, row.district, row.province]
                .filter(Boolean)
                .join(' ')
            : '';
        let distance_km: number | null = null;
        const storeLat = row.latitude != null ? Number(row.latitude) : null;
        const storeLng = row.longitude != null ? Number(row.longitude) : null;
        if (hasGps && storeLat != null && storeLng != null
            && Number.isFinite(storeLat) && Number.isFinite(storeLng)) {
            distance_km = Math.round(haversineKm(userLat!, userLng!, storeLat, storeLng) * 100) / 100;
        }
        return {
            id: Number(row.id_pharma),
            name: `${row.firstname_pharma || ''} ${row.lastname_pharma || ''}`.trim(),
            time: row.work_time || '',
            image: row.images_pharma || 'default.png',
            store_id: row.id_store != null ? Number(row.id_store) : null,
            store_name: row.store_name || '',
            store_address: address,
            store_lat: storeLat,
            store_lng: storeLng,
            distance_km,
        };
    });

    if (hasGps) {
        pharmacists.sort((a, b) => {
            if (a.distance_km == null && b.distance_km == null) return 0;
            if (a.distance_km == null) return 1;
            if (b.distance_km == null) return -1;
            return a.distance_km - b.distance_km;
        });
    }

    const payload: PharmacistPayload = { status: 'success', total: pharmacists.length, data: pharmacists };
    if (pharmacists.length > 0) {
        setBffCache(PHARMA_CACHE_KEY, payload, CACHE_TTL_MS);
    }
    return payload;
}

async function fetchReviewsPayload() {
    const cached = getBffCache(REVIEWS_CACHE_KEY);
    if (cached) return cached as unknown[];

    if (!isDbConfigured()) {
        return [];
    }

    const onServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
    const timeoutMs = onServerless ? 20_000 : 25_000;

    let rows;
    try {
        rows = await dbQuery(async (sql) => sql`
            WITH latest AS (
                SELECT DISTINCT ON (user_id) id
                FROM reviews
                ORDER BY user_id, id DESC
            )
            SELECT r.id, r.user_id, r.rating, r.comment, r.created_at,
                   a.firstname, a.lastname, a.images_account
            FROM reviews r
            INNER JOIN latest l ON l.id = r.id
            JOIN account a ON r.user_id = a.id_account
            ORDER BY r.rating DESC, r.created_at DESC
            LIMIT 30
        `, { timeoutMs });
    } catch (err) {
        console.warn('[home/summary] reviews query failed:', err);
        const stale = getBffCacheStale(REVIEWS_CACHE_KEY);
        return (stale as unknown[]) ?? [];
    }

    if (rows === null) {
        const stale = getBffCacheStale(REVIEWS_CACHE_KEY);
        return (stale as unknown[]) ?? [];
    }

    const payload = rows ?? [];
    if (payload.length > 0) {
        setBffCache(REVIEWS_CACHE_KEY, payload, CACHE_TTL_MS);
    }
    return payload;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
