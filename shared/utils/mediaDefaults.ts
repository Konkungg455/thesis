/** ใบประกอบวิชาชีพเภสัช dummy / default ใน Supabase `uploads/licenses/` */
export const DEFAULT_PHARMACIST_LICENSE = 'default-license.png';

/** ใบอนุญาตร้านยา dummy / default ใน Supabase `uploads/licenses/` */
export const DEFAULT_STORE_LICENSE = 'default-store-license.png';

/** รูปโปรไฟล์ dummy — user / admin (`images_account/`) และเจ้าของร้าน (`uploads/store_profiles/`) */
export const DEFAULT_PROFILE_IMAGE = 'default.png';

export function resolvePharmacistLicenseFile(filename?: string | null): string {
    const name = String(filename || '').trim();
    if (!name || name === DEFAULT_PROFILE_IMAGE) return DEFAULT_PHARMACIST_LICENSE;
    return name;
}

export function resolveStoreLicenseFile(filename?: string | null): string {
    const name = String(filename || '').trim();
    if (!name || name === DEFAULT_PROFILE_IMAGE) return DEFAULT_STORE_LICENSE;
    return name;
}

export function resolveProfileImageFile(filename?: string | null): string {
    const name = String(filename || '').trim();
    return name || DEFAULT_PROFILE_IMAGE;
}
