export const MIN_AGE = 1;
export const MAX_AGE = 100;

export function validateAgeMessage(value: unknown): string | null {
    const raw = String(value ?? '').trim();
    if (!raw) return 'กรุณากรอกอายุ';
    const n = Number(raw);
    if (!Number.isFinite(n) || Number.isNaN(n)) return 'อายุต้องเป็นตัวเลข';
    if (n < 0) return 'อายุห้ามเป็นค่าติดลบ';
    if (!Number.isInteger(n)) return 'อายุต้องเป็นจำนวนเต็ม';
    if (n < MIN_AGE) return `อายุต้องไม่ต่ำกว่า ${MIN_AGE} ปี`;
    if (n > MAX_AGE) return `อายุต้องไม่เกิน ${MAX_AGE} ปี`;
    return null;
}

export function parseValidAge(value: unknown): number | null {
    if (validateAgeMessage(value)) return null;
    return Number(String(value).trim());
}

export function clampAgeInputValue(value: unknown): string | number {
    const raw = String(value ?? '').trim();
    if (raw === '') return '';
    let n = Math.trunc(Number(raw));
    if (!Number.isFinite(n)) return '';
    if (n < MIN_AGE) n = MIN_AGE;
    if (n > MAX_AGE) n = MAX_AGE;
    return n;
}

export function blockInvalidAgeKeys(event: KeyboardEvent) {
    if (['-', 'e', 'E', '+', '.'].includes(event.key)) {
        event.preventDefault();
    }
}
