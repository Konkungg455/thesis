import { searchThaiAddress } from '../../utils/thaiGeography';

export default defineEventHandler(async (event) => {
    const query = getQuery(event);
    const q = String(query.q || '').trim();
    const limit = Math.min(20, Math.max(1, Number(query.limit || 8)));
    if (q.length < 2) return [];
    try {
        return await searchThaiAddress(q, limit);
    } catch {
        return [];
    }
});
