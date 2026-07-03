/**
 * useThaiAddress — ระบบกรอกที่อยู่อัตโนมัติ (ตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์)
 */

const LOCAL_URL = '/data/thailand-geography.json';
const CDN_URL =
    'https://raw.githubusercontent.com/thailand-geography-data/thailand-geography-json/main/src/geography.json';
const LS_KEY = 'thai_geo_v1';

let cache = null;
let loadingPromise = null;

const normalize = (s) => String(s ?? '').trim().toLowerCase();

const formatRow = (row) => ({
    subDistrict: row.subdistrictNameTh,
    district: row.districtNameTh,
    province: row.provinceNameTh,
    zipcode: String(row.postalCode),
    label: `${row.subdistrictNameTh} » ${row.districtNameTh} » ${row.provinceNameTh} · ${row.postalCode}`,
});

function searchInCache(data, query, limit = 8) {
    const q = normalize(query);
    if (q.length < 2) return [];

    const isNumeric = /^\d+$/.test(q);
    const out = [];
    for (const row of data) {
        const matched = isNumeric
            ? String(row.postalCode).startsWith(q)
            : normalize(row.subdistrictNameTh).includes(q)
              || normalize(row.districtNameTh).includes(q)
              || normalize(row.provinceNameTh).includes(q);
        if (matched) {
            out.push(formatRow(row));
            if (out.length >= limit) break;
        }
    }
    return out;
}

async function searchViaApi(query, limit = 8) {
    return await $fetch('/api/thai-address/search', {
        query: { q: query, limit },
    });
}

export function useThaiAddress() {
    const loadData = async () => {
        if (cache) return cache;
        if (loadingPromise) return loadingPromise;

        loadingPromise = (async () => {
            if (import.meta.client) {
                try {
                    const raw = localStorage.getItem(LS_KEY);
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            cache = parsed;
                            return cache;
                        }
                    }
                } catch {
                    /* ignore */
                }
            }

            let res = await fetch(LOCAL_URL);
            if (!res.ok) res = await fetch(CDN_URL);
            if (!res.ok) throw new Error('โหลดชุดข้อมูลที่อยู่ไม่สำเร็จ');

            const data = await res.json();
            cache = Array.isArray(data) ? data : [];
            if (import.meta.client) {
                try {
                    localStorage.setItem(LS_KEY, JSON.stringify(cache));
                } catch {
                    /* ignore */
                }
            }
            return cache;
        })();

        try {
            return await loadingPromise;
        } finally {
            loadingPromise = null;
        }
    };

    const search = async (query, limit = 8) => {
        const q = String(query ?? '').trim();
        if (q.length < 2) return [];

        try {
            const data = await loadData();
            return searchInCache(data, q, limit);
        } catch {
            try {
                const apiResults = await searchViaApi(q, limit);
                return Array.isArray(apiResults) ? apiResults : [];
            } catch {
                return [];
            }
        }
    };

    const preload = () => {
        if (import.meta.client) {
            loadData().catch(() => { /* warm cache */ });
        }
    };

    return { search, preload, loadData };
}
