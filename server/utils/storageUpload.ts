import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BUCKET = String(process.env.SUPABASE_STORAGE_BUCKET || 'media').trim();

function localRoot(): string {
    return process.env.MEDIA_ROOT || 'C:/xampp/htdocs/4';
}

export function mediaStoragePath(folder: string, filename: string): string {
    return `${folder.replace(/^\/+|\/+$/g, '')}/${filename}`;
}

export function getMediaPublicUrl(folder: string, filename: string): string | null {
    const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
    if (!supabaseUrl || !filename) return null;
    const path = mediaStoragePath(folder, filename);
    return `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${BUCKET}/${path}`;
}

export async function uploadMediaFile(
    folder: string,
    filename: string,
    data: Buffer,
    contentType = 'application/octet-stream',
): Promise<{ filename: string; publicUrl: string | null }> {
    const path = mediaStoragePath(folder, filename);

    if (isSupabaseConfigured()) {
        try {
            const supabase = useSupabaseServer();
            const { error } = await supabase.storage.from(BUCKET).upload(path, data, {
                upsert: true,
                contentType,
            });
            if (!error) {
                return { filename, publicUrl: getMediaPublicUrl(folder, filename) };
            }
            console.warn('[storage] supabase upload failed:', error.message);
        } catch (err) {
            console.warn('[storage] supabase upload error:', err);
        }
    }

    const dir = join(localRoot(), folder);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, filename), data);
    return { filename, publicUrl: null };
}

export async function deleteMediaFile(folder: string, filename: string): Promise<void> {
    if (!filename) return;

    const path = mediaStoragePath(folder, filename);

    if (isSupabaseConfigured()) {
        try {
            await useSupabaseServer().storage.from(BUCKET).remove([path]);
        } catch {
            // ignore
        }
    }

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
