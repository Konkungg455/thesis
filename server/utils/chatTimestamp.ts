/** chat_messages.created_at = timestamp without time zone เก็บค่า UTC (Supabase session UTC) */
export const CHAT_CREATED_UTC = `(created_at AT TIME ZONE 'UTC')`;
export const CHAT_DISPLAY_TIME_SQL = `TO_CHAR((${CHAT_CREATED_UTC}) AT TIME ZONE 'Asia/Bangkok', 'HH24:MI')`;

export function toChatIsoTime(v: unknown): string {
    if (v == null || v === '') return '';
    if (v instanceof Date) return v.toISOString();
    const s = String(v).trim();
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
        const ms = new Date(`${s.replace(' ', 'T')}Z`).getTime();
        return Number.isNaN(ms) ? s : new Date(ms).toISOString();
    }
    const ms = new Date(s).getTime();
    return Number.isNaN(ms) ? s : new Date(ms).toISOString();
}

export function mapChatTimestamps(row: Record<string, unknown>) {
    const createdAt = toChatIsoTime(row.created_at_utc ?? row.created_at);
    return {
        created_at: createdAt,
        display_time: String(row.display_time || '').trim(),
        edited_at: row.edited_at ? toChatIsoTime(row.edited_at) : null,
    };
}
