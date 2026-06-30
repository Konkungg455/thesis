/** cache สั้น ๆ สำหรับ BFF read endpoints */
const DEFAULT_TTL_MS = 60_000;
const cache = new Map<string, { data: unknown; exp: number; created: number }>();

export function getBffCache(key: string): unknown | null {
    const hit = cache.get(key);
    if (!hit || hit.exp <= Date.now()) {
        return null;
    }
    return hit.data;
}

/** คืนค่า cache แม้หมดอายุ — ใช้เมื่อ DB timeout บน Vercel */
export function getBffCacheStale(key: string, maxAgeMs = 600_000): unknown | null {
    const hit = cache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.created > maxAgeMs) return null;
    return hit.data;
}

export function setBffCache(key: string, data: unknown, ttlMs = DEFAULT_TTL_MS) {
    cache.set(key, { data, exp: Date.now() + ttlMs, created: Date.now() });
}

export function clearBffCache(key: string) {
    cache.delete(key);
}

let lastArchiveMaintenanceAt = 0;
const ARCHIVE_MAINT_INTERVAL_MS = 5 * 60 * 1000;

export function shouldRunArchiveMaintenance(): boolean {
    if (Date.now() - lastArchiveMaintenanceAt < ARCHIVE_MAINT_INTERVAL_MS) {
        return false;
    }
    lastArchiveMaintenanceAt = Date.now();
    return true;
}

export function resetArchiveMaintenanceClock() {
    lastArchiveMaintenanceAt = 0;
}
