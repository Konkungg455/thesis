import type { H3Event } from 'h3';

export async function readRequestFields(event: H3Event): Promise<Record<string, string>> {
    const contentType = getRequestHeader(event, 'content-type') || '';
    if (contentType.includes('multipart/form-data')) {
        const parts = await readMultipartFormData(event);
        const out: Record<string, string> = {};
        for (const part of parts || []) {
            if (part.name && part.data && !part.filename) {
                out[part.name] = part.data.toString('utf8');
            }
        }
        return out;
    }

    const body = await readBody(event).catch(() => ({}));
    if (body && typeof body === 'object') {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
            if (Array.isArray(v)) {
                v.forEach((item, i) => {
                    out[`${k}[${i}]`] = String(item ?? '');
                });
            } else {
                out[k] = String(v ?? '');
            }
        }
        return out;
    }
    return {};
}

export async function readMultipartRequest(event: H3Event): Promise<{
    fields: Record<string, string>;
    arrays: Record<string, string[]>;
    files: Record<string, { data: Buffer; filename?: string; type?: string }>;
}> {
    const contentType = getRequestHeader(event, 'content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
        const fields = await readRequestFields(event);
        return { fields, arrays: collectArrayFields(fields), files: {} };
    }

    const parts = await readMultipartFormData(event);
    const fields: Record<string, string> = {};
    const arrays: Record<string, string[]> = {};
    const files: Record<string, { data: Buffer; filename?: string; type?: string }> = {};

    for (const part of parts || []) {
        if (!part.name || !part.data) continue;
        if (part.filename) {
            files[part.name] = { data: part.data, filename: part.filename, type: part.type };
            continue;
        }
        const name = String(part.name);
        const value = part.data.toString('utf8');
        if (name.endsWith('[]')) {
            const key = name.slice(0, -2);
            if (!arrays[key]) arrays[key] = [];
            arrays[key].push(value);
        } else {
            fields[name] = value;
        }
    }

    return { fields, arrays, files };
}

function collectArrayFields(fields: Record<string, string>): Record<string, string[]> {
    const arrays: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(fields)) {
        const m = key.match(/^(.+)\[(\d+)\]$/);
        if (m) {
            const name = m[1];
            const idx = Number(m[2]);
            if (!arrays[name]) arrays[name] = [];
            arrays[name][idx] = value;
        }
    }
    for (const key of Object.keys(arrays)) {
        arrays[key] = arrays[key].filter((v) => v != null && v !== '');
    }
    return arrays;
}

export function getArrayField(
    fields: Record<string, string>,
    arrays: Record<string, string[]>,
    name: string,
): string[] {
    if (arrays[name]?.length) return arrays[name];
    if (arrays[`${name}[]`]?.length) return arrays[`${name}[]`];
    const values: string[] = [];
    for (const [k, v] of Object.entries(fields)) {
        if (k === name || k === `${name}[]` || k.startsWith(`${name}[`)) values.push(v);
    }
    return values;
}
