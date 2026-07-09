import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type PrescriptionRow = Record<string, unknown>;

function rxParseNum(v: unknown): number {
    const s = String(v ?? '').replace(/,/g, '');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
}

function rxFmt(v: unknown): string {
    return rxParseNum(v).toFixed(2);
}

function rxEsc(v: unknown): string {
    return String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

type RxLineItem = {
    name: string;
    qty: string;
    totalNum: number;
};

function isPlaceholderText(v: unknown): boolean {
    const t = String(v ?? '').trim();
    return t === '' || t === '-' || t === '—';
}

function getReceiptPrintCss(): string {
    try {
        return readFileSync(join(process.cwd(), 'server/assets/receipt-print.css'), 'utf8');
    } catch {
        return '';
    }
}

const RECEIPT_DOMPDF_EXTRA_CSS = `
table.receipt-top,
table.info-grid,
table.totals-section,
table.totals-inner,
table.totals-grand,
table.totals-words {
  display: table !important;
  width: 100%;
  border-collapse: collapse;
}
table.info-grid { margin-bottom: 10px; }
table.info-grid td { vertical-align: top; }
table.totals-section {
  border: 1px solid #000;
  border-top: none;
}
table.totals-section td.totals-right {
  padding: 12px 16px;
  vertical-align: top;
}
td.totals-label {
  font-size: 14px;
  padding: 3px 6px;
  text-align: left;
}
td.totals-amount {
  font-size: 14px;
  font-weight: bold;
  padding: 3px 6px;
  text-align: right;
  width: 140px;
}
table.totals-grand {
  border: 2px solid #000;
  margin-top: 6px;
}
td.totals-label--grand {
  font-size: 15px;
  font-weight: bold;
}
td.totals-amount--grand {
  font-size: 16px;
  font-weight: bold;
}
table.totals-words {
  margin-top: 6px;
  border-top: 1px dashed #999;
}
td.totals-words-text {
  font-size: 12px;
  font-style: italic;
  color: #333;
  text-align: right;
  padding-top: 8px;
}
`;

function parsePrescriptionLineItems(d: PrescriptionRow): RxLineItem[] {
    const names = String(d.med_details ?? '').split('\n');
    const qtyUnits = String(d.med_qty ?? '').split('\n');
    const prices = String(d.med_price ?? '').split('\n');

    const maxRows = Math.max(names.length, qtyUnits.length, prices.length);
    const items: RxLineItem[] = [];
    for (let i = 0; i < maxRows; i++) {
        const name = String(names[i] ?? '').trim();
        const qu = qtyUnits[i] ?? '';
        const totalNum = rxParseNum(prices[i] ?? 0);
        const [qty = ''] = String(qu).split('|', 2).map((s) => s.trim());
        const hasName = !isPlaceholderText(name);
        const hasQty = !isPlaceholderText(qty) && rxParseNum(qty) > 0;
        if (!hasName && !hasQty && totalNum <= 0) continue;
        items.push({
            name: hasName ? name : '',
            qty: hasQty ? qty : '',
            totalNum,
        });
    }
    return items;
}

function computePrescriptionAmounts(d: PrescriptionRow, items: RxLineItem[]) {
    let subtotal = 0;
    for (const item of items) subtotal += item.totalNum;
    const discount = rxParseNum(d.discount_amount ?? 0);
    let grand = rxParseNum(d.total_amount ?? 0);
    if (grand <= 0) {
        grand = Math.max(0, subtotal - discount);
    }

    return { subtotal, discount, grand };
}

function buildPrescriptionLineRowsHtml(items: RxLineItem[]): string {
    let rowsHtml = '';
    const source = items.length ? items : [{ name: '-', qty: '-', totalNum: 0 }];
    for (let i = 0; i < source.length; i++) {
        const item = source[i];
        const name = String(item.name || '').trim();
        const qty = String(item.qty || '').trim();
        const totalNum = rxParseNum(item.totalNum);
        const qtyNum = rxParseNum(item.qty);
        const unitPrice = qtyNum > 0 && totalNum > 0 ? totalNum / qtyNum : 0;

        rowsHtml += '<tr>'
            + `<td class="text-center">${i + 1}</td>`
            + `<td>${name !== '' ? rxEsc(name) : '-'}</td>`
            + `<td class="text-center">${qty !== '' ? rxEsc(qty) : '-'}</td>`
            + `<td class="text-right">${unitPrice > 0 ? unitPrice.toFixed(2) : '0.00'}</td>`
            + `<td class="text-right">${totalNum > 0 ? totalNum.toFixed(2) : '0.00'}</td>`
            + '</tr>';
    }
    return rowsHtml;
}

function buildPrescriptionTotalsHtml(subtotal: string, discount: string, grand: string, words: string): string {
    return `<table class="totals-section" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td class="totals-right">
      <table class="totals-inner" width="100%" cellpadding="4" cellspacing="0">
        <tr>
          <td class="totals-label">ราคารวม</td>
          <td class="totals-amount">${subtotal}</td>
        </tr>
        <tr>
          <td class="totals-label">ลดรวม</td>
          <td class="totals-amount">${discount}</td>
        </tr>
      </table>
      <table class="totals-grand" width="100%" cellpadding="8" cellspacing="0">
        <tr>
          <td class="totals-label totals-label--grand">เป็นเงินทั้งสิ้น</td>
          <td class="totals-amount totals-amount--grand">${grand}</td>
        </tr>
      </table>
      <table class="totals-words" width="100%" cellpadding="6" cellspacing="0">
        <tr>
          <td class="totals-words-text">${words}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

export function getPrescriptionBillNo(d: PrescriptionRow): string {
    const docNo = String(d.doc_no ?? '').trim();
    if (docNo) return docNo;
    return `B-${String(d.id ?? 0).padStart(6, '0')}`;
}

function buildPrescriptionReceiptInnerHtml(d: PrescriptionRow, amounts: ReturnType<typeof computePrescriptionAmounts>): string {
    const billNo = getPrescriptionBillNo(d);
    const clinic = rxEsc(d.clinic_name ?? 'ร้านยา');
    const web = rxEsc(d.clinic_website ?? 'Telebot-pharmacy');
    const patient = rxEsc(String(d.patient_name ?? '').trim() || '-');
    const cust = rxEsc(String(d.customer_code ?? '').trim() || '-');
    const dateTx = rxEsc(String(d.prescription_date ?? '').trim() || '-');
    const words = rxEsc(String(d.amount_in_words ?? '').trim() || '(...........................................)');
    const billNoEsc = rxEsc(billNo);
    const items = parsePrescriptionLineItems(d);
    const rowsHtml = buildPrescriptionLineRowsHtml(items);
    const subtotal = amounts.subtotal.toFixed(2);
    const discount = amounts.discount.toFixed(2);
    const grand = amounts.grand.toFixed(2);
    const totalsHtml = buildPrescriptionTotalsHtml(subtotal, discount, grand, words);

    return `<div class="receipt-card">
  <table class="receipt-top" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td>
        <div class="brand-name">${clinic}</div>
        <div class="brand-web">${web}</div>
      </td>
      <td class="page-no" align="right">หน้า 1 / 1</td>
    </tr>
  </table>

  <div class="receipt-title-box">ใบสรุปรายการยา</div>

  <table class="info-grid" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td width="50%" valign="top">
        <div class="info-row"><span class="info-label">รหัสลูกค้า</span><span class="info-value">${cust}</span></div>
        <div class="info-row"><span class="info-label">ชื่อลูกค้า</span><span class="info-value">${patient}</span></div>
      </td>
      <td width="50%" valign="top" class="info-col-right" align="right">
        <div class="info-row"><span class="info-label">เลขที่บิล</span><span class="info-value">${billNoEsc}</span></div>
        <div class="info-row"><span class="info-label">วันที่บิล</span><span class="info-value">${dateTx}</span></div>
      </td>
    </tr>
  </table>

  <table class="items-table">
    <thead>
      <tr>
        <th class="col-no">ลำดับ</th>
        <th class="col-name">รายการ</th>
        <th class="col-qty">จำนวน</th>
        <th class="col-price">ราคาต่อหน่วย</th>
        <th class="col-total">ราคารวม</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  ${totalsHtml}
</div>`;
}

export function buildPrescriptionHtml(d: PrescriptionRow): string {
    const items = parsePrescriptionLineItems(d);
    const amounts = computePrescriptionAmounts(d, items);
    const innerHtml = buildPrescriptionReceiptInnerHtml(d, amounts);
    const sharedCss = getReceiptPrintCss();
    const extraCss = RECEIPT_DOMPDF_EXTRA_CSS;

    return `<!doctype html>
<html lang="th"><head>
<meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet">
<style>
@page { size: A4; margin: 14mm 16mm 16mm; }
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0;
  font-family: Tahoma, 'Sarabun', sans-serif;
  color: #000; font-size: 12px;
  line-height: 1.55;
  background: #fff;
}
.receipt-card {
  width: 100%;
  padding: 0;
  border: 1px solid #000;
}
${sharedCss}
${extraCss}
</style>
</head><body>
${innerHtml}
</body></html>`;
}
