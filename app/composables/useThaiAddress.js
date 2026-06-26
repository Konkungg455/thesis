/**
 * useThaiAddress — ระบบกรอกที่อยู่อัตโนมัติ (ตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์)
 *
 * โหลดชุดข้อมูลที่อยู่ไทยแบบ flat ครั้งเดียว แล้วแคชไว้ใน memory + localStorage
 * เพื่อให้ค้นหาได้รวดเร็วและใช้งานได้แม้ออฟไลน์หลังโหลดครั้งแรก
 *
 * ใช้งาน:
 *   const { search } = useThaiAddress();
 *   const results = await search('อินทประมูล');
 *   // results -> [{ subDistrict, district, province, zipcode, label }, ...]
 */

const CDN_URL =
    'https://raw.githubusercontent.com/thailand-geography-data/thailand-geography-json/main/src/geography.json';
const LS_KEY = 'thai_geo_v1';

// แคชระดับโมดูล (ใช้ร่วมกันทุก component)
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

export function useThaiAddress() {
    const loadData = async () => {
        if (cache) return cache;
        if (loadingPromise) return loadingPromise;

        loadingPromise = (async () => {
            // 1) ลองอ่านจาก localStorage ก่อน (เร็ว + ออฟไลน์ได้)
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

            // 2) โหลดจาก CDN แล้วแคชลง localStorage
            const res = await fetch(CDN_URL);
            if (!res.ok) throw new Error('โหลดชุดข้อมูลที่อยู่ไม่สำเร็จ');
            const data = await res.json();
            cache = Array.isArray(data) ? data : [];
            if (import.meta.client) {
                try {
                    localStorage.setItem(LS_KEY, JSON.stringify(cache));
                } catch {
                    /* localStorage เต็ม — ข้ามไป ใช้ memory cache แทน */
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

    /**
     * ค้นหาที่อยู่จากตำบล / อำเภอ / รหัสไปรษณีย์
     * @param {string} query คำค้น (ตำบล อำเภอ หรือรหัสไปรษณีย์)
     * @param {number} limit จำนวนผลลัพธ์สูงสุด
     */
    const search = async (query, limit = 8) => {
        const q = normalize(query);
        if (q.length < 2) return [];

        let data;
        try {
            data = await loadData();
        } catch {
            return [];
        }

        const isNumeric = /^\d+$/.test(q);
        const out = [];
        for (const row of data) {
            const matched = isNumeric
                ? String(row.postalCode).startsWith(q)
                : normalize(row.subdistrictNameTh).includes(q) ||
                  normalize(row.districtNameTh).includes(q);
            if (matched) {
                out.push(formatRow(row));
                if (out.length >= limit) break;
            }
        }
        return out;
    };

    /** เรียกล่วงหน้าเพื่อ warm cache (เช่นตอน onMounted ของฟอร์ม) */
    const preload = () => {
        loadData().catch(() => { /* เงียบไว้ */ });
    };

    return { search, preload, loadData };
}
