import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export type ThaiAddressRow = {
    subDistrict: string;
    district: string;
    province: string;
    zipcode: string;
    label: string;
};

const CDN_URL =
    'https://raw.githubusercontent.com/thailand-geography-data/thailand-geography-json/main/src/geography.json';

const LOCAL_PATH = join(process.cwd(), 'public/data/thailand-geography.json');

type RawRow = {
    subdistrictNameTh?: string;
    districtNameTh?: string;
    provinceNameTh?: string;
    postalCode?: number | string;
};

let cache: RawRow[] | null = null;
let loading: Promise<RawRow[]> | null = null;

const normalize = (s: unknown) => String(s ?? '').trim().toLowerCase();

function formatRow(row: RawRow): ThaiAddressRow {
    const subDistrict = String(row.subdistrictNameTh || '');
    const district = String(row.districtNameTh || '');
    const province = String(row.provinceNameTh || '');
    const zipcode = String(row.postalCode || '');
    return {
        subDistrict,
        district,
        province,
        zipcode,
        label: `${subDistrict} » ${district} » ${province} · ${zipcode}`,
    };
}

async function loadFromLocalFile(): Promise<RawRow[] | null> {
    try {
        const raw = await readFile(LOCAL_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

async function loadFromCdn(): Promise<RawRow[]> {
    const res = await fetch(CDN_URL);
    if (!res.ok) throw new Error('โหลดชุดข้อมูลที่อยู่ไม่สำเร็จ');
    const data = await res.json();
    return Array.isArray(data) ? data : [];
}

export async function loadThaiGeographyRows(): Promise<RawRow[]> {
    if (cache) return cache;
    if (!loading) {
        loading = (async () => {
            const local = await loadFromLocalFile();
            cache = local && local.length > 0 ? local : await loadFromCdn();
            return cache;
        })().finally(() => {
            loading = null;
        });
    }
    return loading;
}

export async function searchThaiAddress(query: string, limit = 8): Promise<ThaiAddressRow[]> {
    const q = normalize(query);
    if (q.length < 2) return [];

    const data = await loadThaiGeographyRows();
    const isNumeric = /^\d+$/.test(q);
    const out: ThaiAddressRow[] = [];

    for (const row of data) {
        const matched = isNumeric
            ? String(row.postalCode || '').startsWith(q)
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
