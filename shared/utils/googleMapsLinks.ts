type MapsPoint = {
    lat?: number | string | null;
    lng?: number | string | null;
    name?: string;
    address?: string;
    googleMapsUrl?: string | null;
    placeId?: string | null;
};

const GOOGLE_MAPS_SHORT_RE = /^(https?:\/\/)?(maps\.app\.goo\.gl|goo\.gl\/maps)/i;

export function isUsableGoogleMapsUrl(url: string): boolean {
    const raw = String(url || '').trim();
    if (!raw) return false;
    const lower = raw.toLowerCase();
    if (
        lower.includes('example.test')
        || lower.includes('dummy-store')
        || lower.includes('localhost')
        || lower.includes('127.0.0.1')
    ) {
        return false;
    }

    try {
        const host = new URL(raw).hostname.toLowerCase();
        if (host === 'maps.google.com') return true;
        if (host.endsWith('.google.com') && lower.includes('/maps')) return true;
    } catch {
        return false;
    }

    return GOOGLE_MAPS_SHORT_RE.test(raw);
}

function parseCoords(lat?: number | string | null, lng?: number | string | null) {
    const la = Number(lat);
    const ln = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
    if (la === 0 && ln === 0) return null;
    return { lat: la, lng: ln };
}

function buildLabel(name?: string, address?: string) {
    return [name, address].map((v) => String(v || '').trim()).filter(Boolean).join(' ');
}

/** เปิดหมุดบน Google Maps */
export function resolveGoogleMapsSearchUrl(point: MapsPoint): string {
    const coords = parseCoords(point.lat, point.lng);
    if (coords) {
        return `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`;
    }

    if (isUsableGoogleMapsUrl(point.googleMapsUrl || '')) {
        return String(point.googleMapsUrl).trim();
    }

    const placeId = String(point.placeId || '').trim();
    const label = buildLabel(point.name, point.address);
    if (placeId) {
        const q = encodeURIComponent(label || 'pharmacy');
        return `https://www.google.com/maps/search/?api=1&query=${q}&query_place_id=${encodeURIComponent(placeId)}`;
    }

    if (label) {
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label)}`;
    }

    return 'https://www.google.com/maps';
}

/** เปิดโหมดนำทาง (ใช้กับปุ่ม นำทาง) */
export function resolveGoogleMapsDirectionsUrl(point: MapsPoint): string {
    const coords = parseCoords(point.lat, point.lng);
    if (coords) {
        return `https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}`;
    }

    const placeId = String(point.placeId || '').trim();
    if (placeId) {
        return `https://www.google.com/maps/dir/?api=1&destination_place_id=${encodeURIComponent(placeId)}`;
    }

    if (isUsableGoogleMapsUrl(point.googleMapsUrl || '')) {
        const raw = String(point.googleMapsUrl).trim();
        if (raw.includes('/dir/')) return raw;
        try {
            const url = new URL(raw);
            const q = url.searchParams.get('q') || url.searchParams.get('query');
            if (q) {
                return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
            }
        } catch {
            /* fall through */
        }
        return raw;
    }

    const label = buildLabel(point.name, point.address);
    if (label) {
        return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(label)}`;
    }

    return 'https://www.google.com/maps';
}

export function openGoogleMapsNavigation(point: MapsPoint) {
    if (!import.meta.client) return;
    const url = resolveGoogleMapsDirectionsUrl(point);
    window.open(url, '_blank', 'noopener');
}

export function openGoogleMapsSearch(point: MapsPoint) {
    if (!import.meta.client) return;
    const url = resolveGoogleMapsSearchUrl(point);
    window.open(url, '_blank', 'noopener');
}
