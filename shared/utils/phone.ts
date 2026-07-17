/** เบอร์โทรไทย — 9 หลัก */
export const PHONE_MIN_LENGTH = 9;
export const PHONE_MAX_LENGTH = 9;

export function normalizePhoneDigits(value: unknown): string {
    return String(value ?? '').replace(/\D+/g, '');
}

export function validatePhoneMessage(value: unknown): string | null {
    const digits = normalizePhoneDigits(value);
    if (!digits) return 'กรุณากรอกเบอร์โทร';
    if (!/^[0-9]+$/.test(digits)) return 'เบอร์โทรต้องเป็นตัวเลขเท่านั้น';
    if (digits.length !== PHONE_MAX_LENGTH) {
        return `เบอร์โทรต้องเป็นตัวเลข ${PHONE_MAX_LENGTH} หลัก`;
    }
    return null;
}

export function clampPhoneInputValue(value: unknown): string {
    return normalizePhoneDigits(value).slice(0, PHONE_MAX_LENGTH);
}

export function blockInvalidPhoneKeys(event: KeyboardEvent) {
    const allowed = ['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (allowed.includes(event.key)) return;
    if (event.ctrlKey || event.metaKey) return;
    if (/^[0-9]$/.test(event.key)) return;
    event.preventDefault();
}
