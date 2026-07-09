/**
 * รวมชื่อยา + จำนวน จาก med_details และ med_qty (รูปแบบ qty|unit ต่อบรรทัด — แสดงเฉพาะจำนวน)
 */
function parseMedLines(medDetails: unknown, medQty: unknown): { name: string; qty: string }[] {
    const names = String(medDetails ?? '').split('\n');
    const qtyUnits = String(medQty ?? '').split('\n');
    const max = Math.max(names.length, qtyUnits.length);
    const lines: { name: string; qty: string }[] = [];

    for (let i = 0; i < max; i++) {
        const name = String(names[i] ?? '').trim();
        if (!name || name === '-' || name === '—') continue;
        const [qty = ''] = String(qtyUnits[i] ?? '').split('|');
        const q = String(qty).trim();
        lines.push({ name, qty: q === '-' || q === '—' ? '' : q });
    }

    return lines;
}

function formatQtyDisplay(qty: string): string {
    const n = String(qty ?? '').trim();
    return n ? `${n} จำนวน` : '';
}

export function formatMedDetailsWithQty(
    medDetails: unknown,
    medQty: unknown,
    joiner = '\n',
): string {
    const lines = parseMedLines(medDetails, medQty);
    if (!lines.length) return String(medDetails ?? '').trim();

    return lines
        .map(({ name, qty }) => {
            const qtyText = formatQtyDisplay(qty);
            return qtyText ? `${name} ${qtyText}` : name;
        })
        .join(joiner);
}

/** HTML รายการยา — ชื่อซ้าย จำนวนชิดขวา (ใช้ในอีเมล) */
export function buildMedDetailsQtyHtml(
    medDetails: unknown,
    medQty: unknown,
    esc: (v: unknown) => string = (v) => String(v ?? ''),
): string {
    const lines = parseMedLines(medDetails, medQty);
    if (!lines.length) {
        const fallback = String(medDetails ?? '').trim();
        return fallback ? esc(fallback) : '';
    }

    const rows = lines.map(({ name, qty }) => {
        const qtyText = formatQtyDisplay(qty);
        return '<tr>'
        + `<td style="padding:5px 0;color:#0f172a;vertical-align:top;">${esc(name)}</td>`
        + `<td style="padding:5px 0 5px 16px;text-align:right;white-space:nowrap;vertical-align:top;color:#00469c;font-weight:700;min-width:72px;">${qtyText ? esc(qtyText) : '—'}</td>`
        + '</tr>';
    }).join('');

    return `<table style="width:100%;border-collapse:collapse;">${rows}</table>`;
}
