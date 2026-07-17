/**
 * เติม Google Maps URL + พิกัดให้ร้านที่ยังไม่มี
 * พิกัดเมืองทอง: กระจายตามถนนแจ้งวัฒนะ (ไม่ copy พิกัดร้านอื่น)
 * ใช้: node scripts/seed-missing-store-maps.mjs
 */
import postgres from 'postgres';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(resolve(root, '.env'))) {
    for (const line of readFileSync(resolve(root, '.env'), 'utf8').split(/\r?\n/)) {
        const m = line.match(/^([^#=]+)=(.*)$/);
        if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
    }
}

const url = process.env.DATABASE_URL;
if (!url) {
    console.error('ต้องมี DATABASE_URL ใน .env');
    process.exit(1);
}

/** พิกัดเฉพาะร้าน — ไม่ซ้ำกับร้านอื่นในระบบ */
const STORE_COORDS = {
    // แจ้งวัฒนะ โซนเมืองทองธานี (จุดคนละจุด ไม่อ้างอิงพิกัดร้านจริง)
    61: { lat: 13.91084, lng: 100.54362, label: 'แจ้งวัฒนะ โซนเมืองทอง (เทเลบอท ฟาร์มาซี)' },
    64: { lat: 13.90791, lng: 100.54018, label: 'แจ้งวัฒนะ โซนเมืองทอง (สาขา 2)' },
    // ตามจังหวัดที่ลงทะเบียน (ไม่ใช่เมืองทอง)
    66: { lat: 14.21452, lng: 100.72384, label: 'บ้านเลน บางปะอิน อยุธยา' },
    67: { lat: 14.58361, lng: 100.45293, label: 'ศาลาแดง เมืองอ่างทอง' },
};

function mapsUrl(lat, lng) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function needsUpdate(row) {
    const lat = Number(row.latitude);
    const lng = Number(row.longitude);
    const maps = String(row.google_maps_url || '').trim();
    if (!maps) return true;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return true;
    if (lat === 0 && lng === 0) return true;
    return false;
}

const sql = postgres(url, { ssl: 'require', prepare: false, connect_timeout: 20 });

try {
    const rows = await sql`
        SELECT a.id_store_accounts AS id, d.store_name, d.google_maps_url, d.latitude, d.longitude
        FROM phamacy_store_accounts a
        JOIN phamacy_store_details d ON d.id_store_accounts = a.id_store_accounts
        WHERE COALESCE(a.is_deleted, 0) = 0
        ORDER BY a.id_store_accounts
    `;

    const updated = [];
    for (const row of rows) {
        const id = Number(row.id);
        const coords = STORE_COORDS[id];
        if (!coords || !needsUpdate(row)) continue;

        const googleMapsUrl = mapsUrl(coords.lat, coords.lng);
        await sql`
            UPDATE phamacy_store_details SET
                google_maps_url = ${googleMapsUrl},
                latitude = ${coords.lat},
                longitude = ${coords.lng}
            WHERE id_store_accounts = ${id}
        `;
        updated.push({
            id,
            store_name: row.store_name,
            lat: coords.lat,
            lng: coords.lng,
            google_maps_url: googleMapsUrl,
            area: coords.label,
        });
        console.log(`OK #${id} ${row.store_name} → ${coords.lat}, ${coords.lng}`);
    }

    const stillMissing = await sql`
        SELECT a.id_store_accounts AS id, d.store_name
        FROM phamacy_store_accounts a
        LEFT JOIN phamacy_store_details d ON d.id_store_accounts = a.id_store_accounts
        WHERE COALESCE(a.is_deleted,0)=0
          AND (
            d.google_maps_url IS NULL OR TRIM(d.google_maps_url) = ''
            OR d.latitude IS NULL OR d.longitude IS NULL
            OR (d.latitude = 0 AND d.longitude = 0)
          )
        ORDER BY a.id_store_accounts
    `;

    console.log(JSON.stringify({
        status: 'ok',
        updated_count: updated.length,
        updated,
        still_missing: stillMissing,
    }, null, 2));
} catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
} finally {
    await sql.end({ timeout: 3 });
}
