/** แมปโฟลเดอร์ local/BFF → Supabase Storage bucket + object path */
export function resolveSupabaseObject(
    folder: string,
    filename: string,
): { bucket: string; objectPath: string } {
    const normalizedFolder = folder.replace(/^\/+|\/+$/g, '');
    const name = String(filename || 'default.png').trim() || 'default.png';

    if (normalizedFolder === 'images_account') {
        return { bucket: 'images-account', objectPath: name };
    }
    if (normalizedFolder === 'images_pharma') {
        return { bucket: 'images-pharma', objectPath: name };
    }
    if (normalizedFolder.startsWith('uploads/')) {
        const sub = normalizedFolder.slice('uploads/'.length);
        return { bucket: 'uploads', objectPath: sub ? `${sub}/${name}` : name };
    }
    if (normalizedFolder === 'uploads') {
        return { bucket: 'uploads', objectPath: name };
    }

    const legacyBucket = String(process.env.SUPABASE_STORAGE_BUCKET || 'media').trim();
    return { bucket: legacyBucket, objectPath: `${normalizedFolder}/${name}` };
}

export function buildSupabasePublicUrl(
    supabaseUrl: string,
    folder: string,
    filename: string,
): string | null {
    const base = String(supabaseUrl || '').trim();
    if (!base || !filename) return null;
    const { bucket, objectPath } = resolveSupabaseObject(folder, filename);
    return `${base.replace(/\/$/, '')}/storage/v1/object/public/${bucket}/${objectPath}`;
}
