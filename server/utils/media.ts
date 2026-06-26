import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize } from 'node:path';
import type { H3Event } from 'h3';

const ALLOWED_PREFIXES = ['images_account', 'images_pharma', 'uploads'];

const MIME: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
};

function mediaRoot(): string {
    return process.env.MEDIA_ROOT || 'C:/xampp/htdocs/4';
}

export function serveLocalMedia(event: H3Event, pathname: string) {
    const parts = pathname.replace(/^\/+/, '').split('/').filter(Boolean);
    const prefix = parts[0];

    if (!prefix || !ALLOWED_PREFIXES.includes(prefix)) {
        throw createError({ statusCode: 404, statusMessage: 'Not found' });
    }

    if (parts.some((p) => p === '..' || p.includes('..'))) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid path' });
    }

    const filename = parts[parts.length - 1] || '';
    const folder = parts.slice(0, -1).join('/');

    // Vercel — ใช้ Supabase Storage public URL (ไม่มี C:/xampp)
    if (!canUseLocalMediaStorage()) {
        const publicUrl = getMediaPublicUrl(folder, filename);
        if (publicUrl) {
            return sendRedirect(event, publicUrl, 302);
        }
        return sendRedirect(event, '/favicon.png', 302);
    }

    const root = normalize(mediaRoot());
    let filePath = normalize(join(root, ...parts));

    if (!filePath.startsWith(root)) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid path' });
    }

    if (!existsSync(filePath) && prefix === 'images_pharma') {
        const fallback = join(root, 'images_pharma', 'default.png');
        if (existsSync(fallback)) filePath = fallback;
    }

    if (!existsSync(filePath) && prefix === 'images_account') {
        const fallback = join(root, 'images_account', 'default.png');
        if (existsSync(fallback)) filePath = fallback;
    }

    if (!existsSync(filePath)) {
        const publicUrl = getMediaPublicUrl(parts.slice(0, -1).join('/'), parts[parts.length - 1] || '');
        if (publicUrl) {
            return sendRedirect(event, publicUrl, 302);
        }
        throw createError({ statusCode: 404, statusMessage: 'File not found' });
    }

    const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
    setResponseHeader(event, 'Content-Type', MIME[ext] || 'application/octet-stream');
    setResponseHeader(event, 'Cache-Control', 'public, max-age=86400');

    return sendStream(event, createReadStream(filePath));
}

export function isMediaPath(pathname: string): boolean {
    const first = pathname.replace(/^\/+/, '').split('/')[0]?.toLowerCase();
    return Boolean(first && ALLOWED_PREFIXES.includes(first));
}
