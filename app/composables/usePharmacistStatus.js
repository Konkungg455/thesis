/**
 * คำนวณสถานะการทำงานของเภสัชกร จาก work_time string
 * รูปแบบที่รองรับ: "Monday (10:00-18:00), Tuesday (10:00-18:00), Everyday (08:00-17:00)"
 *
 * คืนค่า:
 *  - status: 'online' | 'break' | 'closed_today' | 'not_set'
 *  - label: ข้อความภาษาไทยพร้อมแสดง
 *  - color: สีของป้าย ('green' | 'orange' | 'red' | 'gray')
 *  - todaySlots: [{ start, end }] ของวันนี้
 *  - nextOpen: { day, start, end } ของช่วงถัดไปที่จะเปิด (ถ้ามี)
 */

const DAY_NAMES_TH = {
    Monday: 'จันทร์',
    Tuesday: 'อังคาร',
    Wednesday: 'พุธ',
    Thursday: 'พฤหัสบดี',
    Friday: 'ศุกร์',
    Saturday: 'เสาร์',
    Sunday: 'อาทิตย์',
    Everyday: 'ทุกวัน'
};

const DAY_INDEX = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6
};

const INDEX_TO_DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const parseWorkTime = (workTimeStr) => {
    if (!workTimeStr || typeof workTimeStr !== 'string') return [];
    const items = workTimeStr.split(',').map((s) => s.trim()).filter(Boolean);
    const schedules = [];
    for (const item of items) {
        // รูปแบบ 1: "Day (HH:MM-HH:MM)" หรือ "Day (HH:MM - HH:MM)"
        const mDay = item.match(/^(.+?)\s*\(\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*\)$/);
        if (mDay) {
            schedules.push({ day: mDay[1].trim(), start: mDay[2].trim(), end: mDay[3].trim() });
            continue;
        }
        // รูปแบบ 2: "HH:MM - HH:MM" (ไม่มีชื่อวัน) → ตีความเป็น "Everyday"
        const mTime = item.match(/^\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*$/);
        if (mTime) {
            schedules.push({ day: 'Everyday', start: mTime[1].trim(), end: mTime[2].trim() });
            continue;
        }
        // รูปแบบ 3: "Day HH:MM-HH:MM" (ไม่มีวงเล็บ)
        const mPlain = item.match(/^(.+?)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
        if (mPlain) {
            schedules.push({ day: mPlain[1].trim(), start: mPlain[2].trim(), end: mPlain[3].trim() });
        }
    }
    return schedules;
};

const toMinutes = (hhmm) => {
    if (!hhmm) return null;
    const [h, m] = hhmm.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
};

const formatTime = (hhmm) => {
    if (!hhmm) return '';
    const [h, m] = hhmm.split(':');
    return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
};

const dayTH = (englishDay) => DAY_NAMES_TH[englishDay] || englishDay;

/**
 * คำนวณสถานะ ณ เวลา `now` (Date)
 */
const computeStatus = (workTimeStr, now = new Date()) => {
    const schedules = parseWorkTime(workTimeStr);
    if (schedules.length === 0) {
        return {
            status: 'not_set',
            label: 'ยังไม่ระบุเวลาทำการ',
            color: 'gray',
            todaySlots: [],
            nextOpen: null
        };
    }

    const todayName = INDEX_TO_DAY[now.getDay()];
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    // หา slot ของวันนี้ (รวม "Everyday")
    const todaySlots = schedules
        .filter((s) => s.day === todayName || s.day === 'Everyday')
        .map((s) => ({
            start: s.start,
            end: s.end,
            startMin: toMinutes(s.start),
            endMin: toMinutes(s.end)
        }))
        .filter((s) => s.startMin !== null && s.endMin !== null)
        .sort((a, b) => a.startMin - b.startMin);

    // ออนไลน์: ตอนนี้อยู่ในช่วงเปิดทำการของวันนี้
    const activeSlot = todaySlots.find((s) => nowMinutes >= s.startMin && nowMinutes <= s.endMin);
    if (activeSlot) {
        return {
            status: 'online',
            label: `เปิดทำการ ${formatTime(activeSlot.start)}-${formatTime(activeSlot.end)}`,
            color: 'green',
            todaySlots,
            nextOpen: null
        };
    }

    // พักช่วง: วันนี้มีตารางอยู่แต่ตอนนี้ยังไม่ถึง / เลยไปแล้ว
    if (todaySlots.length > 0) {
        const upcomingToday = todaySlots.find((s) => nowMinutes < s.startMin);
        if (upcomingToday) {
            return {
                status: 'break',
                label: `วันนี้เปิด ${formatTime(upcomingToday.start)} น.`,
                color: 'orange',
                todaySlots,
                nextOpen: { day: todayName, start: upcomingToday.start, end: upcomingToday.end }
            };
        }
        // ทุก slot ของวันนี้ผ่านไปแล้ว → หาวันถัดไป
        return {
            status: 'break',
            label: 'ปิดทำการแล้ววันนี้',
            color: 'orange',
            todaySlots,
            nextOpen: findNextOpen(schedules, now)
        };
    }

    // วันนี้ไม่มีตารางเลย → ปิดทำการวันนี้
    return {
        status: 'closed_today',
        label: 'ปิดทำการวันนี้',
        color: 'red',
        todaySlots: [],
        nextOpen: findNextOpen(schedules, now)
    };
};

const findNextOpen = (schedules, now) => {
    const todayIdx = now.getDay();
    for (let offset = 1; offset <= 7; offset++) {
        const nextIdx = (todayIdx + offset) % 7;
        const nextDay = INDEX_TO_DAY[nextIdx];
        const slots = schedules
            .filter((s) => s.day === nextDay || s.day === 'Everyday')
            .map((s) => ({ ...s, startMin: toMinutes(s.start) }))
            .sort((a, b) => a.startMin - b.startMin);
        if (slots.length > 0) {
            const first = slots[0];
            return {
                day: nextDay,
                dayTH: dayTH(nextDay),
                start: first.start,
                end: first.end,
                offsetDays: offset
            };
        }
    }
    return null;
};

const formatScheduleList = (workTimeStr) => {
    const schedules = parseWorkTime(workTimeStr);
    if (schedules.length === 0) return [];
    return schedules.map((s) => ({
        ...s,
        dayTH: dayTH(s.day),
        label: `${dayTH(s.day)} ${formatTime(s.start)}-${formatTime(s.end)} น.`
    }));
};

export function usePharmacistStatus() {
    return {
        parseWorkTime,
        computeStatus,
        formatScheduleList,
        dayTH,
        formatTime
    };
}
