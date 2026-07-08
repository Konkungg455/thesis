/** cache ผล get-user-session สั้น ๆ — ลด round-trip Supabase ซ้ำ */
const TTL_MS = 60_000;
const cache = new Map<string, { data: unknown; exp: number }>();

export function buildSessionCacheKey(q: Record<string, unknown>): string | null {
    if (q.id_account) return `account:${Number(q.id_account)}`;
    if (q.id_pharma) return `pharma:${Number(q.id_pharma)}`;
    if (q.id_store_accounts) return `store:${Number(q.id_store_accounts)}`;
    if (q.id_account_admin) return `admin:${Number(q.id_account_admin)}`;
    return null;
}

export function getSessionCache(key: string): unknown | null {
    const hit = cache.get(key);
    if (!hit || hit.exp <= Date.now()) {
        if (hit) cache.delete(key);
        return null;
    }
    return hit.data;
}

export function setSessionCache(key: string, data: unknown) {
    cache.set(key, { data, exp: Date.now() + TTL_MS });
}
