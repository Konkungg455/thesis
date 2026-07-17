/**
 * รวมชิ้นส่วนที่อยู่ไทย — ตัดส่วนที่ซ้ำติดกัน (เช่น บางใหญ่ บางใหญ่ บางใหญ่)
 */
export function joinThaiAddressParts(
    ...parts: Array<string | number | null | undefined>
): string {
    const cleaned: string[] = [];
    for (const raw of parts) {
        const value = String(raw ?? '').trim();
        if (!value || value === '-' || value === 'ไม่มี') continue;
        if (cleaned[cleaned.length - 1] === value) continue;
        cleaned.push(value);
    }
    return cleaned.join(' ');
}
