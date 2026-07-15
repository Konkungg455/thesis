/** E.164 allows up to 15 digits (country code + subscriber). */
export const PHONE_MIN_LENGTH = 9;
export const PHONE_MAX_LENGTH = 15;

export function normalizePhoneDigits(value: unknown): string {
    return String(value ?? '').replace(/\D+/g, '');
}

export function validatePhoneMessage(value: unknown): string | null {
    const digits = normalizePhoneDigits(value);
    if (!digits) return 'กรุณากรอกเบอร์โทร';
    if (!/^[0-9]+$/.test(digits)) return 'เบอร์โทรต้องเป็นตัวเลขเท่านั้น';
    if (digits.length < PHONE_MIN_LENGTH) {
        return `เบอร์โทรต้องมีตัวเลขอย่างน้อย ${PHONE_MIN_LENGTH} หลัก`;
    }
    if (digits.length > PHONE_MAX_LENGTH) {
        return `เบอร์โทรต้องไม่เกิน ${PHONE_MAX_LENGTH} หลัก`;
    }
    return null;
}

export function clampPhoneInputValue(value: unknown): string {
    return normalizePhoneDigits(value).slice(0, PHONE_MAX_LENGTH);
}

export function blockInvalidPhoneKeys(event: KeyboardEvent) {
    if (['-', 'e', 'E', '+', '.', ' '].includes(event.key)) {
        event.preventDefault();
    }
}
