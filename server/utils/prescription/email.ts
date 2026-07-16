import { basename, extname } from 'node:path';
import { buildMedDetailsQtyHtml, formatMedDetailsWithQty } from '#shared/utils/prescriptionMed';
import { RX_DELIVERY_NOTICE } from '#shared/utils/prescriptionCopy';
import { sendRichEmail, type EmailAttachment } from '../mail';
import { buildPrescriptionPdfBinary } from './pdf';
import { getPrescriptionBillNo, type PrescriptionRow } from './receiptHtml';
import { resolveAccountPatientName } from '../bff/patientInfo';
import { downloadMediaFile } from '../storageUpload';

export interface StorePaymentInfo {
    bank_name: string;
    bank_account_name: string;
    bank_account_number: string;
    qr_file: string;
    qr_buffer: Buffer | null;
    qr_content_type: string;
}

export interface PrescriptionEmailResult {
    ok: boolean;
    message: string;
    sent_to: string;
    payment_qr_attached: boolean;
    payment_bank_included: boolean;
}

function rxEsc(v: unknown): string {
    return String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function fetchStorePaymentInfo(
    sql: ReturnType<typeof useDb>,
    idPharma: number,
): Promise<StorePaymentInfo> {
    const payment: StorePaymentInfo = {
        bank_name: '',
        bank_account_name: '',
        bank_account_number: '',
        qr_file: '',
        qr_buffer: null,
        qr_content_type: 'image/jpeg',
    };

    if (idPharma <= 0) return payment;

    const rows = await sql`
        SELECT d.bank_name, d.bank_account_name, d.bank_account_number, d.qr_payment_file
        FROM pharmacist_account p
        LEFT JOIN phamacy_store_details d ON d.id_store_accounts = p.id_store
        WHERE p.id_pharma = ${idPharma}
        LIMIT 1
    `;
    const row = rows[0];
    if (!row) return payment;

    payment.bank_name = String(row.bank_name ?? '').trim();
    payment.bank_account_name = String(row.bank_account_name ?? '').trim();
    payment.bank_account_number = String(row.bank_account_number ?? '').trim();

    const qrFile = String(row.qr_payment_file ?? '').trim();
    if (qrFile) {
        payment.qr_file = basename(qrFile);
        const downloaded = await downloadMediaFile('uploads/qr_payment', payment.qr_file);
        if (downloaded) {
            payment.qr_buffer = downloaded.buffer;
            payment.qr_content_type = downloaded.contentType;
        }
    }

    return payment;
}

export interface PrescriptionEmailPreview {
    subject: string;
    html: string;
    text: string;
    sent_to: string;
    patient_name: string;
    payment_qr_attached: boolean;
    payment_bank_included: boolean;
    pdf_available: boolean;
}

function buildPrescriptionPaymentHtml(
    payment: StorePaymentInfo,
    options: { preview?: boolean } = {},
): string {
    const hasBank = payment.bank_name !== ''
        || payment.bank_account_name !== ''
        || payment.bank_account_number !== '';
    const hasQr = payment.qr_buffer != null;

    if (!hasBank && !hasQr) return '';

    let html = "<div style='margin-top:16px;padding:14px;border:1px solid #bfdbfe;border-radius:8px;background:#eff6ff;'>"
        + "<div style='font-weight:bold;color:#00469c;margin-bottom:8px;'>ช่องทางชำระเงินของร้านยา</div>";

    if (payment.bank_name) {
        html += `<div>ธนาคาร: ${rxEsc(payment.bank_name)}</div>`;
    }
    if (payment.bank_account_name) {
        html += `<div>ชื่อบัญชี: ${rxEsc(payment.bank_account_name)}</div>`;
    }
    if (payment.bank_account_number) {
        html += `<div>เลขบัญชี: <b style='font-size:16px;color:#00469c;'>${rxEsc(payment.bank_account_number)}</b></div>`;
    }
    if (hasQr) {
        const qrSrc = options.preview && payment.qr_buffer
            ? `data:${payment.qr_content_type};base64,${payment.qr_buffer.toString('base64')}`
            : 'cid:qrpayment';
        html += "<div style='margin-top:12px;text-align:center;'>"
            + "<div style='font-size:13px;color:#475569;margin-bottom:8px;'>สแกน QR เพื่อชำระเงิน</div>"
            + `<img src="${qrSrc}" alt="QR Payment" style="max-width:220px;width:100%;height:auto;border:1px solid #cbd5e1;border-radius:8px;background:#fff;" />`
            + '</div>';
    }

    return `${html}</div>`;
}

export function buildPrescriptionEmailContent(input: {
    row: PrescriptionRow;
    patientName: string;
    payment: StorePaymentInfo;
    pdfAvailable: boolean;
    pdfError?: string;
    preview?: boolean;
}): { subject: string; html: string; text: string } {
    const { row, patientName, payment, pdfAvailable, pdfError = '', preview = false } = input;
    const billNo = getPrescriptionBillNo(row);
    const doctor = String(row.doctor_name ?? '');
    const clinic = String(row.clinic_name ?? 'ร้านยา');
    const total = String(row.total_amount ?? '');
    const pDate = String(row.prescription_date ?? new Date().toISOString().slice(0, 10));
    const medSummary = formatMedDetailsWithQty(row.med_details, row.med_qty);
    const medSummaryHtml = buildMedDetailsQtyHtml(row.med_details, row.med_qty, rxEsc);

    const subject = `ใบสรุปรายการยา เลขที่ ${billNo} จาก ${clinic}`;

    const totalRow = total
        ? `<tr><td style='padding:6px 10px;color:#475569;'>ยอดสุทธิ</td><td style='padding:6px 10px;font-weight:bold;'>${rxEsc(total)} บาท</td></tr>`
        : '';
    const deliveryNotice = total
        ? "<p style='margin:12px 0 0;font-size:13px;color:#dc2626;font-weight:600;line-height:1.55;'>"
            + `${rxEsc(RX_DELIVERY_NOTICE)}</p>`
        : '';
    const patientRow = patientName
        ? `<tr><td style='padding:6px 10px;color:#475569;'>ผู้รับ</td><td style='padding:6px 10px;'>${rxEsc(patientName)}</td></tr>`
        : '';
    const doctorRow = doctor
        ? `<tr><td style='padding:6px 10px;color:#475569;'>เภสัชผู้ออก</td><td style='padding:6px 10px;'>${rxEsc(doctor)}</td></tr>`
        : '';
    const medRow = medSummaryHtml
        ? `<tr><td style='padding:6px 10px;color:#475569;vertical-align:top;'>รายการยา</td>`
            + `<td style='padding:6px 10px;'>${medSummaryHtml}</td></tr>`
        : '';
    const bankRows = buildPrescriptionPaymentHtml(payment, { preview });
    const pdfNote = pdfAvailable
        ? ''
        : `<p style='margin:10px 0 0;font-size:12px;color:#b45309;'>`
            + `ไม่สามารถแนบไฟล์ PDF ได้ (${rxEsc(pdfError || 'PDF engine unavailable')}) `
            + '— รายละเอียดด้านล่างครบถ้วน</p>';
    const previewBanner = preview
        ? "<div style='background:#fef3c7;color:#92400e;padding:10px 14px;font-size:12px;text-align:center;border-bottom:1px solid #fde68a;'>"
            + '📧 ตัวอย่างอีเมลที่ระบบจะส่งให้ลูกค้า (ยังไม่ได้ส่งจริง)'
            + '</div>'
        : '';

    const html = "<!doctype html><html><body style='font-family:Tahoma,\"Sarabun\",sans-serif;color:#0f172a;background:#f1f5f9;padding:20px;margin:0;'>"
        + "<div style='max-width:560px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 14px rgba(15,23,42,0.08);'>"
        + previewBanner
        + "<div style='background:#00469c;color:#fff;padding:18px 22px;'>"
        + "<div style='font-size:20px;font-weight:bold;'>ใบสรุปรายการยา</div>"
        + `<div style='opacity:.85;font-size:12px;margin-top:4px;'>${rxEsc(clinic)}</div>`
        + '</div>'
        + "<div style='padding:22px;'>"
        + "<p style='margin:0 0 8px;'>สวัสดีค่ะ/ครับ"
        + (patientName ? ` คุณ${rxEsc(patientName)}` : '')
        + '</p>'
        + `<p style='margin:6px 0 14px;'>ทางเรา <b>${rxEsc(clinic)}</b> `
        + 'ได้จัดทำใบสรุปรายการยาให้ท่านเรียบร้อยแล้ว ดังรายละเอียดด้านล่าง'
        + (pdfAvailable ? ' และได้แนบไฟล์ <b>PDF</b> มากับอีเมลฉบับนี้' : '')
        + '</p>'
        + pdfNote
        + "<table style='width:100%;border:1px solid #e2e8f0;border-radius:8px;border-collapse:separate;border-spacing:0;'>"
        + "<tr><td style='padding:6px 10px;color:#475569;'>เลขที่บิล</td>"
        + `<td style='padding:6px 10px;font-weight:bold;color:#00469c;'>${rxEsc(billNo)}</td></tr>`
        + "<tr><td style='padding:6px 10px;color:#475569;'>วันที่</td>"
        + `<td style='padding:6px 10px;'>${rxEsc(pDate)}</td></tr>`
        + patientRow + doctorRow + medRow + totalRow
        + '</table>'
        + deliveryNotice
        + bankRows
        + "<p style='margin-top:18px;font-size:12px;color:#64748b;'>หากมีคำถามเกี่ยวกับใบสรุปรายการยานี้ ท่านสามารถติดต่อผ่านช่องทางแชทของระบบหรือสอบถามเภสัชกรผู้ออกได้โดยตรง</p>"
        + "<p style='margin-top:8px;font-size:12px;color:#64748b;'>ขอบคุณที่ใช้บริการ Telebot Pharmacy</p>"
        + '</div>'
        + "<div style='background:#f8fafc;padding:12px 22px;font-size:11px;color:#94a3b8;text-align:center;'>"
        + 'อีเมลฉบับนี้ส่งโดยอัตโนมัติ — กรุณาอย่าตอบกลับ'
        + '</div>'
        + '</div></body></html>';

    const paymentBankIncluded = payment.bank_name !== ''
        || payment.bank_account_name !== ''
        || payment.bank_account_number !== '';
    const paymentQrAttached = payment.qr_buffer != null;

    const altLines = [
        `ใบสรุปรายการยาเลขที่ ${billNo} วันที่ ${pDate}`,
        patientName ? `ผู้รับ: ${patientName}` : '',
        medSummary ? `รายการยา:\n${medSummary}` : '',
        total ? `ยอดสุทธิ: ${total} บาท` : '',
        total ? RX_DELIVERY_NOTICE : '',
        pdfAvailable ? 'แนบ PDF มาในอีเมลฉบับนี้' : 'รายละเอียดอยู่ในเนื้อหาอีเมล (ไม่มีไฟล์ PDF แนบ)',
    ].filter(Boolean);
    if (paymentBankIncluded) {
        if (payment.bank_name) altLines.push(`ธนาคาร: ${payment.bank_name}`);
        if (payment.bank_account_name) altLines.push(`ชื่อบัญชี: ${payment.bank_account_name}`);
        if (payment.bank_account_number) altLines.push(`เลขบัญชี: ${payment.bank_account_number}`);
    }
    if (paymentQrAttached) altLines.push('มีรูป QR Payment แนบมาในอีเมลฉบับนี้');

    return { subject, html, text: altLines.join('\n') };
}

export async function buildPrescriptionEmailPreviewInternal(
    sql: ReturnType<typeof useDb>,
    rxId: number,
): Promise<PrescriptionEmailPreview | null> {
    const rows = await sql`SELECT * FROM prescriptions WHERE id = ${rxId} LIMIT 1`;
    const row = rows[0] as PrescriptionRow | undefined;
    if (!row) return null;

    let to = '';
    if (row.id_account) {
        const acc = await sql`
            SELECT email_account, firstname, lastname
            FROM account
            WHERE id_account = ${Number(row.id_account)}
            LIMIT 1
        `;
        to = String(acc[0]?.email_account ?? '').trim();
    }

    let patientName = String(row.patient_name ?? '').trim();
    if (row.id_account) {
        const synced = await resolveAccountPatientName(sql, Number(row.id_account), patientName);
        if (synced) patientName = synced;
    }

    let pdfAvailable = false;
    try {
        const pdfBin = await buildPrescriptionPdfBinary(row);
        pdfAvailable = pdfBin != null && pdfBin.length > 0;
    } catch {
        pdfAvailable = false;
    }

    const payment = await fetchStorePaymentInfo(sql, Number(row.id_pharma ?? 0));
    const { subject, html, text } = buildPrescriptionEmailContent({
        row,
        patientName,
        payment,
        pdfAvailable,
        preview: true,
    });

    return {
        subject,
        html,
        text,
        sent_to: to,
        patient_name: patientName,
        payment_qr_attached: payment.qr_buffer != null,
        payment_bank_included: payment.bank_name !== ''
            || payment.bank_account_name !== ''
            || payment.bank_account_number !== '',
        pdf_available: pdfAvailable,
    };
}

export async function sendPrescriptionEmailInternal(
    sql: ReturnType<typeof useDb>,
    rxId: number,
    overrideEmail?: string | null,
): Promise<PrescriptionEmailResult> {
    const empty: PrescriptionEmailResult = {
        ok: false,
        message: '',
        sent_to: '',
        payment_qr_attached: false,
        payment_bank_included: false,
    };

    const rows = await sql`SELECT * FROM prescriptions WHERE id = ${rxId} LIMIT 1`;
    const row = rows[0] as PrescriptionRow | undefined;
    if (!row) {
        return { ...empty, message: 'ไม่พบใบสรุปรายการยา' };
    }

    let to = String(overrideEmail ?? '').trim();
    if (!to && row.id_account) {
        const acc = await sql`
            SELECT email_account, firstname, lastname
            FROM account
            WHERE id_account = ${Number(row.id_account)}
            LIMIT 1
        `;
        to = String(acc[0]?.email_account ?? '').trim();
    }

    if (!to || !isValidEmail(to)) {
        return { ...empty, message: 'ลูกค้ายังไม่มีอีเมลที่ใช้ได้ในระบบ' };
    }

    let patientName = String(row.patient_name ?? '').trim();
    if (row.id_account) {
        const synced = await resolveAccountPatientName(sql, Number(row.id_account), patientName);
        if (synced) patientName = synced;
    }

    const payment = await fetchStorePaymentInfo(sql, Number(row.id_pharma ?? 0));
    const paymentQrAttached = payment.qr_buffer != null;
    const paymentBankIncluded = payment.bank_name !== ''
        || payment.bank_account_name !== ''
        || payment.bank_account_number !== '';

    const billNo = getPrescriptionBillNo(row);
    let pdfBin: Buffer | null = null;
    let pdfError = '';
    try {
        pdfBin = await buildPrescriptionPdfBinary(row);
    } catch (e) {
        pdfError = e instanceof Error ? e.message : String(e);
    }

    const { subject, html, text } = buildPrescriptionEmailContent({
        row,
        patientName,
        payment,
        pdfAvailable: pdfBin != null && pdfBin.length > 0,
        pdfError,
    });

    const attachments: EmailAttachment[] = [];
    if (pdfBin) {
        attachments.push({
            filename: `prescription-${billNo}.pdf`,
            content: pdfBin,
            contentType: 'application/pdf',
        });
    }

    if (paymentQrAttached && payment.qr_buffer) {
        const qrExt = extname(payment.qr_file).slice(1).toLowerCase() || 'jpg';
        attachments.push({
            filename: `qr-payment.${qrExt}`,
            content: payment.qr_buffer,
            cid: 'qrpayment',
            contentType: payment.qr_content_type,
        });
        attachments.push({
            filename: `qr-payment.${qrExt}`,
            content: payment.qr_buffer,
            contentType: payment.qr_content_type,
        });
    }

    try {
        const ok = await sendRichEmail({
            to,
            toName: patientName || to,
            subject,
            html,
            text,
            fromName: String(row.clinic_name ?? 'ร้านยา'),
            replyTo: process.env.SMTP_FROM || process.env.SMTP_USER,
            attachments,
        });

        return {
            ok,
            message: ok ? 'ส่งอีเมลสำเร็จ' : 'ส่งอีเมลไม่สำเร็จ',
            sent_to: to,
            payment_qr_attached: paymentQrAttached,
            payment_bank_included: paymentBankIncluded,
        };
    } catch (e) {
        return {
            ...empty,
            message: `ส่งอีเมลไม่สำเร็จ: ${e instanceof Error ? e.message : String(e)}`,
            sent_to: to,
        };
    }
}
