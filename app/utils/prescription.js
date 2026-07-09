export { formatMedDetailsWithQty } from '#shared/utils/prescriptionMed'

const PRESCRIPTION_MARKER = /\[PRESCRIPTION_PDF:(\d+)\]/
const RX_FOOTER_START = 'กรุณาเช็คที่อยู่ของผู้ใช้งาน'

/** แยกข้อความใบสรุปรายการยา: หัวบิล (บน) / PDF (กลาง) / คำแนะนำชำระเงิน (ล่าง) */
export function parsePrescriptionMessage(text) {
    if (!text) {
        return { prescriptionId: 0, headerText: '', footerText: '', cleanText: '' }
    }

    const raw = String(text)
    const markerMatch = raw.match(PRESCRIPTION_MARKER)
    const prescriptionId = markerMatch ? Number(markerMatch[1]) || 0 : 0

    if (!prescriptionId) {
        return { prescriptionId: 0, headerText: '', footerText: '', cleanText: raw }
    }

    const body = raw.replace(PRESCRIPTION_MARKER, '').replace(/\*+/g, '').trim()
    const footerIdx = body.indexOf(RX_FOOTER_START)

    let headerText = body
    let footerText = ''
    if (footerIdx >= 0) {
        headerText = body.slice(0, footerIdx).trim()
        footerText = body.slice(footerIdx).trim()
    }

    const cleanText = [headerText, footerText].filter(Boolean).join('\n\n')

    return { prescriptionId, headerText, footerText, cleanText }
}
