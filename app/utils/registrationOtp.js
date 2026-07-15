const STORAGE_KEY = 'registration_otp_fallback';
const MAX_AGE_MS = 10 * 60 * 1000;

function storageKey(type, email) {
    return `${String(type || 'user').trim()}:${String(email || '').trim().toLowerCase()}`;
}

export function stashRegistrationOtpFallback(type, email, data) {
    if (!import.meta.client) return;
    const otp = String(data?.fallback_otp || data?.dev_otp || '').trim();
    if (!otp || data?.email_sent !== false) return;
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
            key: storageKey(type, email),
            otp,
            ts: Date.now(),
        }));
    } catch {
        // ignore quota / private mode
    }
}

export function readRegistrationOtpFallback(type, email) {
    if (!import.meta.client) return '';
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return '';
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.key !== storageKey(type, email)) return '';
        if (Date.now() - Number(parsed.ts || 0) > MAX_AGE_MS) {
            sessionStorage.removeItem(STORAGE_KEY);
            return '';
        }
        return String(parsed.otp || '').trim();
    } catch {
        return '';
    }
}

export function clearRegistrationOtpFallback() {
    if (!import.meta.client) return;
    try {
        sessionStorage.removeItem(STORAGE_KEY);
    } catch {
        // ignore
    }
}

export function applyOtpFallbackFromResponse(type, email, data) {
    if (!data || data.email_sent !== false) return;
    stashRegistrationOtpFallback(type, email, data);
    return String(data.fallback_otp || data.dev_otp || '').trim();
}
