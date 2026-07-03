/**
 * เติมพิกัดทุกร้านยา (กรุงเทพฯ) + ผูกเภสัชทุกคนกับร้านสังกัด
 * ใช้: npm run db:seed-pharmacy
 */
import postgres from 'postgres';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');

function loadEnv() {
    if (!existsSync(envPath)) return;
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^([^#=]+)=(.*)$/);
        if (!m) continue;
        const key = m[1].trim();
        if (!process.env[key]) {
            process.env[key] = m[2].trim().replace(/^["']|["']$/g, '');
        }
    }
}

loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
    console.error('ต้องมี DATABASE_URL ใน .env');
    process.exit(1);
}

const BANGKOK_CENTER = { lat: 13.7563, lng: 100.5018 };

/** จับคู่จากชื่อ/ที่อยู่ร้าน */
const NAME_COORDS = [
    { keys: ['พระราม 9', 'พระราม9', 'rama9'], lat: 13.7590, lng: 100.5650, label: 'Rama 9' },
    { keys: ['ลาดพร้าว', 'ladprao'], lat: 13.8167, lng: 100.6050, label: 'Lat Phrao' },
    { keys: ['บางนา', 'bangna'], lat: 13.6680, lng: 100.6300, label: 'Bang Na' },
    { keys: ['รัชดา', 'ratchada'], lat: 13.7650, lng: 100.5690, label: 'Ratchada' },
    { keys: ['จตุจักร', 'chatuchak'], lat: 13.7998, lng: 100.5501, label: 'Chatuchak' },
    { keys: ['สาทร', 'sathorn'], lat: 13.7223, lng: 100.5298, label: 'Sathorn' },
    { keys: ['สุขุมวิท', 'sukhumvit'], lat: 13.7367, lng: 100.5681, label: 'Sukhumvit' },
    { keys: ['ห้วยขวาง'], lat: 13.7590, lng: 100.5650, label: 'Huai Khwang' },
];

const ID_COORDS = {
    4: { lat: 13.7998, lng: 100.5501, label: 'Chatuchak' },
    5: { lat: 13.8052, lng: 100.7059, label: 'Khan Na Yao' },
    6: { lat: 13.7223, lng: 100.5298, label: 'Sathorn' },
    18: { lat: 13.8167, lng: 100.6050, label: 'Lat Phrao' },
    19: { lat: 13.6680, lng: 100.6300, label: 'Bang Na' },
    20: { lat: 13.7650, lng: 100.5690, label: 'Ratchada' },
};

function needsCoords(lat, lng) {
    if (lat == null || lng == null) return true;
    const la = Number(lat);
    const ln = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return true;
    return la === 0 && ln === 0;
}

function googleMapsSearchUrl(lat, lng) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function isBadMapsUrl(url) {
    const u = String(url || '').trim().toLowerCase();
    if (!u) return true;
    if (u.includes('example.test') || u.includes('dummy-store') || u.includes('localhost')) return true;
    return !(u.includes('google.com/maps') || u.includes('maps.google.com') || u.includes('goo.gl/maps'));
}

function pickCoords(store) {
    const id = Number(store.id);
    if (ID_COORDS[id]) return ID_COORDS[id];

    const text = [
        store.store_name,
        store.road,
        store.sub_district,
        store.district,
        store.province,
    ].filter(Boolean).join(' ').toLowerCase();

    for (const row of NAME_COORDS) {
        if (row.keys.some((k) => text.includes(k.toLowerCase()))) {
            return row;
        }
    }

    const angle = (id * 137.508) % 360;
    const dist = 0.012 + (id % 10) * 0.006;
    const rad = (angle * Math.PI) / 180;
    return {
        lat: BANGKOK_CENTER.lat + dist * Math.cos(rad),
        lng: BANGKOK_CENTER.lng + dist * Math.sin(rad),
        label: `Bangkok #${id}`,
    };
}

const sql = postgres(url, { ssl: 'require', prepare: false, connect_timeout: 25 });

try {
    const stores = await sql`
        SELECT a.id_store_accounts AS id,
               d.id_store_details,
               d.store_name,
               d.road,
               d.sub_district,
               d.district,
               d.province,
               d.latitude,
               d.longitude
        FROM phamacy_store_accounts a
        LEFT JOIN phamacy_store_details d ON d.id_store_accounts = a.id_store_accounts
        WHERE a.status = 1
          AND (a.admin_status IS NULL OR a.admin_status = 'approved')
        ORDER BY a.id_store_accounts ASC
    `;

    const coordsUpdated = [];

    for (const store of stores) {
        if (!needsCoords(store.latitude, store.longitude)) continue;

        const c = pickCoords(store);
        const maps = googleMapsSearchUrl(c.lat, c.lng);
        const province = (store.province && store.province !== 'อ่างทอง')
            ? store.province
            : 'กรุงเทพมหานคร';

        if (store.id_store_details) {
            await sql`
                UPDATE phamacy_store_details
                SET latitude = ${c.lat},
                    longitude = ${c.lng},
                    google_maps_url = COALESCE(NULLIF(TRIM(google_maps_url), ''), ${maps}),
                    province = CASE
                        WHEN province IS NULL OR TRIM(province) = '' OR province = 'อ่างทอง'
                        THEN ${province}
                        ELSE province
                    END
                WHERE id_store_accounts = ${store.id}
            `;
        } else {
            await sql`
                INSERT INTO phamacy_store_details (
                    id_store_accounts, store_name, province, latitude, longitude, google_maps_url
                ) VALUES (
                    ${store.id},
                    ${store.store_name || `ร้านยา #${store.id}`},
                    ${province},
                    ${c.lat},
                    ${c.lng},
                    ${maps}
                )
            `;
        }

        coordsUpdated.push({
            id: store.id,
            store_name: store.store_name || `ร้านยา #${store.id}`,
            latitude: c.lat,
            longitude: c.lng,
            area: c.label,
        });
    }

    const mapsUrlFixed = [];
    const storesWithCoords = await sql`
        SELECT id_store_accounts AS id, store_name, latitude, longitude, google_maps_url
        FROM phamacy_store_details
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL
          AND NOT (latitude = 0 AND longitude = 0)
    `;
    for (const row of storesWithCoords) {
        if (!isBadMapsUrl(row.google_maps_url)) continue;
        const maps = googleMapsSearchUrl(Number(row.latitude), Number(row.longitude));
        await sql`
            UPDATE phamacy_store_details
            SET google_maps_url = ${maps}
            WHERE id_store_accounts = ${row.id}
        `;
        mapsUrlFixed.push({
            id: row.id,
            store_name: row.store_name,
            google_maps_url: maps,
        });
    }

    const readyStores = await sql`
        SELECT a.id_store_accounts AS id, d.store_name
        FROM phamacy_store_accounts a
        INNER JOIN phamacy_store_details d ON d.id_store_accounts = a.id_store_accounts
        WHERE a.status = 1
          AND (a.admin_status IS NULL OR a.admin_status = 'approved')
          AND d.store_name IS NOT NULL AND TRIM(d.store_name) <> ''
          AND d.latitude IS NOT NULL AND d.longitude IS NOT NULL
          AND NOT (d.latitude = 0 AND d.longitude = 0)
        ORDER BY a.id_store_accounts ASC
    `;

    if (!readyStores.length) {
        throw new Error('ไม่มีร้านยาที่มีพิกัด — ตรวจ phamacy_store_accounts / phamacy_store_details');
    }

    const validIds = new Set(readyStores.map((s) => Number(s.id)));

    const pharmacists = await sql`
        SELECT p.id_pharma,
               p.firstname_pharma,
               p.lastname_pharma,
               p.id_store,
               p.store_name,
               d.store_name AS detail_name
        FROM pharmacist_account p
        LEFT JOIN phamacy_store_details d ON d.id_store_accounts = p.id_store
        ORDER BY p.id_pharma ASC
    `;

    const assigned = [];
    const synced = [];
    let storeIdx = 0;

    for (const p of pharmacists) {
        const id = Number(p.id_pharma);
        const currentStore = p.id_store != null ? Number(p.id_store) : 0;
        const detailName = String(p.detail_name || '').trim();
        const hasValidStore = currentStore > 0
            && validIds.has(currentStore)
            && detailName !== '';

        if (hasValidStore) {
            const expectedName = detailName;
            if (String(p.store_name || '').trim() !== expectedName) {
                await sql`
                    UPDATE pharmacist_account
                    SET store_name = ${expectedName}
                    WHERE id_pharma = ${id}
                `;
                synced.push({ id_pharma: id, store_name: expectedName });
            }
            continue;
        }

        const target = readyStores[storeIdx % readyStores.length];
        storeIdx += 1;
        const storeId = Number(target.id);
        const storeName = String(target.store_name).trim();

        await sql`
            UPDATE pharmacist_account
            SET id_store = ${storeId}, store_name = ${storeName}
            WHERE id_pharma = ${id}
        `;

        assigned.push({
            id_pharma: id,
            name: `${p.firstname_pharma || ''} ${p.lastname_pharma || ''}`.trim(),
            from_store: currentStore || null,
            to_store: storeId,
            store_name: storeName,
        });
    }

    const [{ n: storeWithCoords }] = await sql`
        SELECT COUNT(*)::int AS n
        FROM phamacy_store_accounts a
        JOIN phamacy_store_details d ON d.id_store_accounts = a.id_store_accounts
        WHERE a.status = 1
          AND (a.admin_status IS NULL OR a.admin_status = 'approved')
          AND d.latitude IS NOT NULL AND d.longitude IS NOT NULL
          AND NOT (d.latitude = 0 AND d.longitude = 0)
    `;

    const [{ n: pharmaWithStore }] = await sql`
        SELECT COUNT(*)::int AS n
        FROM pharmacist_account p
        INNER JOIN phamacy_store_details d ON d.id_store_accounts = p.id_store
        WHERE p.id_store IS NOT NULL AND p.id_store > 0
          AND TRIM(COALESCE(p.store_name, '')) <> ''
    `;

    const [{ n: pharmaTotal }] = await sql`SELECT COUNT(*)::int AS n FROM pharmacist_account`;

    const [{ n: unassigned }] = await sql`
        SELECT COUNT(*)::int AS n
        FROM pharmacist_account p
        WHERE p.id_store IS NULL OR p.id_store = 0
           OR NOT EXISTS (
               SELECT 1 FROM phamacy_store_details d
               WHERE d.id_store_accounts = p.id_store
                 AND d.latitude IS NOT NULL AND d.longitude IS NOT NULL
                 AND NOT (d.latitude = 0 AND d.longitude = 0)
           )
    `;

    console.log(JSON.stringify({
        status: 'success',
        message: 'เติมพิกัดร้านยา + ผูกเภสัชสำเร็จ',
        stores_coords_updated: coordsUpdated.length,
        maps_url_fixed: mapsUrlFixed.length,
        maps_url_fixed_sample: mapsUrlFixed.slice(0, 5),
        coords_updated: coordsUpdated,
        stores_with_coords: storeWithCoords,
        pharmacists_total: pharmaTotal,
        pharmacists_with_store: pharmaWithStore,
        pharmacists_unassigned: unassigned,
        pharmacists_newly_assigned: assigned.length,
        pharmacists_name_synced: synced.length,
        assigned,
        synced_sample: synced.slice(0, 10),
    }, null, 2));
} catch (err) {
    console.error(JSON.stringify({ status: 'error', message: err.message }, null, 2));
    process.exit(1);
} finally {
    await sql.end({ timeout: 3 });
}
