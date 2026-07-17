export type StoreScheduleRow = {
    day_of_week: string;
    open_time: string;
    close_time: string;
    is_open?: boolean | number;
};

const JS_DAY_TO_STORE = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const DAY_LABELS: Record<string, string> = {
    Mon: 'จันทร์',
    Tue: 'อังคาร',
    Wed: 'พุธ',
    Thu: 'พฤหัสบดี',
    Fri: 'ศุกร์',
    Sat: 'เสาร์',
    Sun: 'อาทิตย์',
};

export function formatScheduleTime(value: unknown): string {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const match = raw.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return raw;
    return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function toMinutes(hhmm: string): number | null {
    const match = String(hhmm || '').match(/^(\d{1,2}):(\d{2})/);
    if (!match) return null;
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
}

function isOpenDay(row: StoreScheduleRow | undefined): boolean {
    return Boolean(row) && Number(row!.is_open ?? 1) === 1;
}

export function summarizeStoreSchedule(
    schedules: StoreScheduleRow[] | null | undefined,
    now: Date = new Date(),
) {
    const rows = Array.isArray(schedules) ? schedules : [];
    if (!rows.length) {
        return {
            status: 'not_set' as const,
            label: 'ยังไม่ระบุเวลาเปิด',
            hours: '',
            is_open_now: false,
            next_open: null as null | { day: string; dayTH: string; start: string; end: string },
        };
    }

    const todayCode = JS_DAY_TO_STORE[now.getDay()];
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const todayRow = rows.find((r) => r.day_of_week === todayCode && isOpenDay(r));

    if (todayRow) {
        const start = formatScheduleTime(todayRow.open_time);
        const end = formatScheduleTime(todayRow.close_time);
        const startMin = toMinutes(start);
        const endMin = toMinutes(end);
        const hours = start && end ? `${start}-${end}` : '';

        if (startMin != null && endMin != null && nowMinutes >= startMin && nowMinutes <= endMin) {
            return {
                status: 'open' as const,
                label: `เปิดทำการ ${hours}`,
                hours,
                is_open_now: true,
                next_open: null,
            };
        }

        if (startMin != null && nowMinutes < startMin) {
            return {
                status: 'break' as const,
                label: `วันนี้เปิด ${start} น.`,
                hours,
                is_open_now: false,
                next_open: { day: todayCode, dayTH: DAY_LABELS[todayCode] || todayCode, start, end },
            };
        }

        return {
            status: 'break' as const,
            label: 'ปิดทำการแล้ววันนี้',
            hours,
            is_open_now: false,
            next_open: findNextOpen(rows, now),
        };
    }

    return {
        status: 'closed_today' as const,
        label: 'ปิดทำการวันนี้',
        hours: '',
        is_open_now: false,
        next_open: findNextOpen(rows, now),
    };
}

function findNextOpen(rows: StoreScheduleRow[], now: Date) {
    const todayIdx = now.getDay();
    for (let offset = 1; offset <= 7; offset++) {
        const nextIdx = (todayIdx + offset) % 7;
        const nextCode = JS_DAY_TO_STORE[nextIdx];
        const row = rows.find((r) => r.day_of_week === nextCode && isOpenDay(r));
        if (!row) continue;
        const start = formatScheduleTime(row.open_time);
        const end = formatScheduleTime(row.close_time);
        if (!start) continue;
        return {
            day: nextCode,
            dayTH: DAY_LABELS[nextCode] || nextCode,
            start,
            end,
        };
    }
    return null;
}
