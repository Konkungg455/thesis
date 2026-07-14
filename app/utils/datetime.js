export const APP_TIMEZONE = 'Asia/Bangkok';
export const APP_LOCALE = 'th-TH';

/** แปลงค่าเวลาจาก API/DB ให้เป็น Date (timestamp ไม่มี timezone → ถือเป็น UTC จาก Supabase) */
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

/** YYYY-MM-DD ตามเวลาไทย — ใช้เทียบวันเดียวกัน/เมื่อวาน */
function bangkokDateKey(d) {
    return d.toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE });
}

/** เวลาในบับเบิลแชท — บังคับ Asia/Bangkok กัน SSR (UTC) แสดงเวลาเพี้ยน 7 ชม. */
export function formatChatBubbleTime(value) {
    const d = parseAppDateTime(value);
    if (Number.isNaN(d.getTime())) return '';
    const time = d.toLocaleTimeString(APP_LOCALE, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: APP_TIMEZONE,
    });
    return `${time} น.`;
}

/** ใช้ display_time จาก API (คำนวณใน Postgres) ก่อน แล้วค่อย fallback แปลงจาก created_at */
export function formatChatMessageTime(msg) {
    const preset = String(msg?.display_time || '').trim();
    if (preset) {
        // ถ้า API ส่งมาแล้วไม่มี "น." ให้เติมให้เป็นรูปแบบไทย
        return /น\.?\s*$/.test(preset) ? preset : `${preset} น.`;
    }
    return formatChatBubbleTime(msg?.created_at);
}

/** วันที่+เวลาแชทแบบเต็ม — บังคับ Asia/Bangkok (พ.ศ.) */
export function formatChatDateTime(value) {
    const d = parseAppDateTime(value);
    if (Number.isNaN(d.getTime())) return '';
    const date = d.toLocaleDateString(APP_LOCALE, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: APP_TIMEZONE,
    });
    const time = d.toLocaleTimeString(APP_LOCALE, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: APP_TIMEZONE,
    });
    return `${date} ${time} น.`;
}

/** เฉพาะเวลาสั้น เช่น 14:11 น. */
export function formatThaiTimeShort(value) {
    return formatChatBubbleTime(value);
}

/** เฉพาะวันที่ไทย เช่น 14 ก.ค. 2569 */
export function formatThaiDate(value) {
    const d = parseAppDateTime(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(APP_LOCALE, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: APP_TIMEZONE,
    });
}

/**
 * เวลาในรายการประวัติแชท (sidebar / การ์ด)
 * วันนี้ → 14:11 น. | เมื่อวาน → เมื่อวาน | อื่นๆ → 14 ก.ค.
 */
export function formatThaiSessionListTime(value) {
    const d = parseAppDateTime(value);
    if (Number.isNaN(d.getTime())) return '';
    const key = bangkokDateKey(d);
    const now = new Date();
    const todayKey = bangkokDateKey(now);
    if (key === todayKey) return formatChatBubbleTime(d);

    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    if (key === bangkokDateKey(y)) return 'เมื่อวาน';

    return d.toLocaleDateString(APP_LOCALE, {
        day: 'numeric',
        month: 'short',
        timeZone: APP_TIMEZONE,
    });
}
