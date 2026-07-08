import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSupabasePublicUrl, resolveSupabaseObject } from '~/utils/mediaStorage';

function localRoot(): string {
    return String(process.env.MEDIA_ROOT || '').trim();
}

/** ใช้ดิสก์ local เฉพาะเมื่อตั้ง MEDIA_ROOT เอง — ค่าเริ่มต้นใช้ Supabase Storage */
export function canUseLocalMediaStorage(): boolean {
    if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
        return false;
    }
    if (isSupabaseConfigured() || String(process.env.DATABASE_URL || '').trim()) {
        return false;
    }
    const root = localRoot();
    if (!root) {
        return false;
    }
    if (process.platform !== 'win32' && /^[A-Za-z]:[/\\]/.test(root)) {
        return false;
    }
    return true;
}

export function mediaStoragePath(folder: string, filename: string): string {
    return `${folder.replace(/^\/+|\/+$/g, '')}/${filename}`;
}

export function getMediaPublicUrl(folder: string, filename: string): string | null {
    const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
    return buildSupabasePublicUrl(supabaseUrl, folder, filename);
}

async function uploadToSupabase(
    folder: string,
    filename: string,
    data: Buffer,
    contentType: string,
): Promise<{ filename: string; publicUrl: string | null } | null> {
    if (!isSupabaseConfigured()) return null;

    const { bucket, objectPath } = resolveSupabaseObject(folder, filename);
    const supabase = useSupabaseServer();
    const { error } = await supabase.storage.from(bucket).upload(objectPath, data, {
        upsert: true,
        contentType,
    });

    if (error) {
        console.warn('[storage] supabase upload failed:', error.message);
        return null;
    }

    return { filename, publicUrl: getMediaPublicUrl(folder, filename) };
}

export async function uploadMediaFile(
    folder: string,
    filename: string,
    data: Buffer,
    contentType = 'application/octet-stream',
): Promise<{ filename: string; publicUrl: string | null }> {
    const supabaseResult = await uploadToSupabase(folder, filename, data, contentType);
    if (supabaseResult) {
        return supabaseResult;
    }

    if (!canUseLocalMediaStorage()) {
        throw createError({
            statusCode: 503,
            statusMessage:
                'อัปโหลดไฟล์ไม่สำเร็จ — ตั้ง SUPABASE_SERVICE_ROLE_KEY + buckets images-pharma/images-account/uploads บน Vercel',
        });
    }

    const dir = join(localRoot(), folder);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, filename), data);
    return { filename, publicUrl: null };
}

export async function deleteMediaFile(folder: string, filename: string): Promise<void> {
    if (!filename) return;

    const { bucket, objectPath } = resolveSupabaseObject(folder, filename);

    if (isSupabaseConfigured()) {
        try {
            await useSupabaseServer().storage.from(bucket).remove([objectPath]);
        } catch {
            // ignore
        }
    }

    if (!canUseLocalMediaStorage()) return;

    const localPath = join(localRoot(), folder, filename);
    if (existsSync(localPath)) {
        unlinkSync(localPath);
    }
}

export function mimeFromExt(ext: string): string {
    const map: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        pdf: 'application/pdf',
    };
    return map[ext.toLowerCase()] || 'application/octet-stream';
}

/** โหลดไฟล์ media สำหรับแนบอีเมล/PDF — รองรับ Supabase Storage และ local MEDIA_ROOT */
export async function downloadMediaFile(
    folder: string,
    filename: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
    const name = String(filename || '').trim();
    if (!name) return null;

    const normalizedFolder = folder.replace(/^\/+|\/+$/g, '');

    if (canUseLocalMediaStorage()) {
        const localPath = join(localRoot(), normalizedFolder, name);
        if (existsSync(localPath)) {
            const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : 'jpg';
            return { buffer: readFileSync(localPath), contentType: mimeFromExt(ext) };
        }
    }

    if (isSupabaseConfigured()) {
        const { bucket, objectPath } = resolveSupabaseObject(normalizedFolder, name);
        try {
            const supabase = useSupabaseServer();
            const { data, error } = await supabase.storage.from(bucket).download(objectPath);
            if (!error && data) {
                const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : 'jpg';
                return { buffer: Buffer.from(await data.arrayBuffer()), contentType: mimeFromExt(ext) };
            }
            if (error) {
                console.warn('[storage] supabase download failed:', error.message);
            }
        } catch (err) {
            console.warn('[storage] supabase download error:', err);
        }

        const publicUrl = getMediaPublicUrl(normalizedFolder, name);
        if (publicUrl) {
            try {
                const res = await fetch(publicUrl);
                if (res.ok) {
                    const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : 'jpg';
                    return {
                        buffer: Buffer.from(await res.arrayBuffer()),
                        contentType: res.headers.get('content-type') || mimeFromExt(ext),
                    };
                }
            } catch (err) {
                console.warn('[storage] public URL fetch failed:', err);
            }
        }
    }

    return null;
}
