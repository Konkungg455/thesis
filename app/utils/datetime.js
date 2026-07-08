export const APP_TIMEZONE = 'Asia/Bangkok';
export const APP_LOCALE = 'th-TH';

/** แปลงค่าเวลาจาก API/DB ให้เป็น Date (timestamp ไม่มี timezone → ถือเป็น UTC เหมือน Supabase) */
export function parseAppDateTime(value) {
    if (value == null || value === '') return new Date(NaN);
    if (value instanceof Date) return value;
    const s = String(value).trim();
    if (!s) return new Date(NaN);
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
        return new Date(`${s.replace(' ', 'T')}Z`);
    }
    return new Date(s);
}

/** เวลาในบับเบิลแชท — บังคับ Asia/Bangkok กัน SSR (UTC) แสดงเวลาเพี้ยน 7 ชม. */
export function formatChatBubbleTime(value) {
    const d = parseAppDateTime(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString(APP_LOCALE, {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: APP_TIMEZONE,
    });
}

/** ใช้ display_time จาก API (คำนวณใน Postgres) ก่อน แล้วค่อย fallback แปลงจาก created_at */
export function formatChatMessageTime(msg) {
    const preset = String(msg?.display_time || '').trim();
    if (preset) return preset;
    return formatChatBubbleTime(msg?.created_at);
}
