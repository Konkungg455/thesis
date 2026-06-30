import type { H3Event } from 'h3';

type PharmacistPayload = {
    status: string;
    total?: number;
    data: unknown[];
    message?: string;
};

/** โหลดข้อมูลหน้าแรกครั้งเดียว — ลด cold start + round-trip บน Vercel */
export async function fetchHomeSummary(event?: H3Event) {
    const cached = getBffCache('home:summary');
    if (cached) return cached;

    const [pharmacists, reviews] = await Promise.all([
        fetchPharmacistsPayload(event),
        fetchReviewsPayload(),
    ]);

    const payload = { pharmacists, reviews };

    const total = Number((pharmacists as PharmacistPayload)?.total ?? (pharmacists as PharmacistPayload)?.data?.length ?? 0);
    const reviewCount = Array.isArray(reviews) ? reviews.length : 0;
    const pharmaOk = (pharmacists as PharmacistPayload)?.status === 'success' && total > 0;
    if (pharmaOk || reviewCount > 0) {
        setBffCache('home:summary', payload, 90_000);
    }

    return payload;
}

async function fetchPharmacistsPayload(event?: H3Event): Promise<PharmacistPayload> {
    if (!isDbConfigured()) {
        return { status: 'error', message: dbUnavailableMessage(), data: [] };
    }

    const q = event ? getQuery(event) : {};
    const userLat = q.lat ? Number(q.lat) : null;
    const userLng = q.lng ? Number(q.lng) : null;

    const rows = await dbQuery(async (sql) => sql`
        SELECT p.id_pharma, p.firstname_pharma, p.lastname_pharma,
               p.images_pharma, p.work_time, p.status_verify, p.id_store,
               d.store_name, d.latitude, d.longitude,
               d.house_no, d.road, d.sub_district, d.district, d.province
        FROM pharmacist_account p
        LEFT JOIN phamacy_store_accounts a ON a.id_store_accounts = p.id_store
              AND a.status = 1
              AND (a.admin_status IS NULL OR a.admin_status = 'approved')
        LEFT JOIN phamacy_store_details d ON d.id_store_accounts = p.id_store
        WHERE p.status_verify = 1
    `);

    if (rows === null) {
        return { status: 'error', message: dbUnavailableMessage(), data: [] };
    }

    const pharmacists = rows.map((row) => {
        const address = [row.house_no, row.road, row.sub_district, row.district, row.province]
            .filter(Boolean)
            .join(' ');
        let distance_km: number | null = null;
        const storeLat = row.latitude != null ? Number(row.latitude) : null;
        const storeLng = row.longitude != null ? Number(row.longitude) : null;
        if (userLat != null && userLng != null && storeLat != null && storeLng != null
            && Number.isFinite(userLat) && Number.isFinite(userLng)
            && Number.isFinite(storeLat) && Number.isFinite(storeLng)) {
            distance_km = Math.round(haversineKm(userLat, userLng, storeLat, storeLng) * 100) / 100;
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

    if (userLat != null && userLng != null) {
        pharmacists.sort((a, b) => {
            if (a.distance_km == null && b.distance_km == null) return 0;
            if (a.distance_km == null) return 1;
            if (b.distance_km == null) return -1;
            return a.distance_km - b.distance_km;
        });
    }

    return { status: 'success', total: pharmacists.length, data: pharmacists };
}

async function fetchReviewsPayload() {
    if (!isDbConfigured()) {
        return [];
    }

    const rows = await dbQuery(async (sql) => sql`
        SELECT r.*, a.firstname, a.lastname, a.images_account
        FROM reviews r
        INNER JOIN (
            SELECT user_id, MAX(id) AS latest_id
            FROM reviews
            GROUP BY user_id
        ) latest ON latest.user_id = r.user_id AND latest.latest_id = r.id
        JOIN account a ON r.user_id = a.id_account
        ORDER BY r.rating DESC, r.created_at DESC
    `);

    return rows ?? [];
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
