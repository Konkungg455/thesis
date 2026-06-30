/** cache สั้น ๆ สำหรับ BFF read endpoints */
const DEFAULT_TTL_MS = 60_000;
const cache = new Map<string, { data: unknown; exp: number }>();

export function getBffCache(key: string): unknown | null {
    const hit = cache.get(key);
    if (!hit || hit.exp <= Date.now()) {
        if (hit) cache.delete(key);
        return null;
    }
    return hit.data;
}

export function setBffCache(key: string, data: unknown, ttlMs = DEFAULT_TTL_MS) {
    cache.set(key, { data, exp: Date.now() + ttlMs });
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
