export { formatMedDetailsWithQty } from '#shared/utils/prescriptionMed'
export { RX_DELIVERY_NOTICE } from '#shared/utils/prescriptionCopy'

const PRESCRIPTION_MARKER = /\[PRESCRIPTION_PDF:(\d+)\]/
const RX_FOOTER_START = 'กรุณาเช็คที่อีเมลของผู้ใช้งาน'
const RX_FOOTER_START_LEGACY = 'กรุณาเช็คที่อยู่ของผู้ใช้งาน'
const RX_PAYMENT_FOOTER = 'กรุณาเช็คที่อีเมลของผู้ใช้งานเพื่อทำการจ่ายเงิน และแนบสลิปการโอนเงินในแชทนี้เพื่อให้เภสัชกรดำเนินการจัดส่ง'
const PAYMENT_DONE_LEGACY = 'การชำระเงินของคุณสำเร็จแล้วนะ'
const PAYMENT_DONE_TEXT = 'การชำระเงินของคุณสำเร็จแล้ว'
const DELIVERY_CHOICE_MARKER = /\[DELIVERY_CHOICE:rx=(\d+);choice=(accept|decline)\]/g
const DELIVERY_CHOICE_LINE = /\n?\[DELIVERY_CHOICE:rx=\d+;choice=(?:accept|decline)\]/g

const findFooterIndex = (body) => {
    const idx = body.indexOf(RX_FOOTER_START)
    if (idx >= 0) return idx
    return body.indexOf(RX_FOOTER_START_LEGACY)
}

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
    const footerIdx = findFooterIndex(body)

    let headerText = body
    let footerText = ''
    if (footerIdx >= 0) {
        headerText = body.slice(0, footerIdx).trim()
        footerText = RX_PAYMENT_FOOTER
    }

    const cleanText = [headerText, footerText].filter(Boolean).join('\n\n')

    return { prescriptionId, headerText, footerText, cleanText }
}

/** แสดงข้อความแชท — ปรับข้อความเก่าที่บันทึกไว้แล้วให้ตรงรูปแบบปัจจุบัน */
export function normalizeChatDisplayText(text) {
    if (!text) return text
    return String(text)
        .replaceAll(PAYMENT_DONE_LEGACY, PAYMENT_DONE_TEXT)
        .replace(DELIVERY_CHOICE_LINE, '')
        .trim()
}

/** สร้างข้อความแจ้งเภสัชกรเมื่อผู้ป่วยเลือกบริการจัดส่ง */
export const DELIVERY_DECLINE_HINT = 'สามารถนำใบสรุปรายการยานี้ ให้กับเภสัช หรือ ร้านยาที่ท่านปรึกษา'

export function buildDeliveryChoiceMessage(rxId, choice) {
    const id = Number(rxId) || 0
    const text = choice === 'accept'
        ? `ระบบ: ลูกค้ายืนยันต้องการบริการจัดส่งยา (อ้างอิงใบสรุปรายการยา #${id})`
        : `ระบบ: ลูกค้าไม่รับบริการจัดส่งยา (อ้างอิงใบสรุปรายการยา #${id})`
    return `${text}\n[DELIVERY_CHOICE:rx=${id};choice=${choice}]`
}

/** แยกข้อความเลือกบริการจัดส่ง — แสดงคำแนะนำสีเหลืองเมื่อไม่รับจัดส่ง */
export function parseDeliveryChoiceMessage(text) {
    const raw = String(text || '')
    const markerMatch = raw.match(/\[DELIVERY_CHOICE:rx=\d+;choice=(accept|decline)\]/)
    const isDeclineText = /ระบบ:\s*ลูกค้าไม่รับบริการจัดส่งยา/.test(raw)
    const isAcceptText = /ระบบ:\s*ลูกค้ายืนยันต้องการบริการจัดส่งยา/.test(raw)

    if (!markerMatch && !isDeclineText && !isAcceptText) {
        return { isDeliveryChoice: false, choice: '', mainText: '', declineHint: '' }
    }

    const choice = markerMatch?.[1]
        || (isDeclineText ? 'decline' : 'accept')

    return {
        isDeliveryChoice: true,
        choice,
        mainText: normalizeChatDisplayText(raw),
        declineHint: choice === 'decline' ? DELIVERY_DECLINE_HINT : '',
    }
}

/** รายการใบสรุปที่ผู้ป่วยตอบการจัดส่งแล้ว */
export function getDeliveryChoiceRxIds(messages) {
    const answered = new Set()
    for (const msg of messages || []) {
        const raw = String(msg?.message_text || '')
        for (const match of raw.matchAll(DELIVERY_CHOICE_MARKER)) {
            const rxId = Number(match[1]) || 0
            if (rxId > 0) answered.add(rxId)
        }
    }
    return answered
}

/** ใบสรุปล่าสุดที่ยังไม่ได้ตอบเรื่องจัดส่ง (ต้องแนบสลิปในแชทก่อน) */
export function findPendingDeliveryRx(messages) {
    const answered = getDeliveryChoiceRxIds(messages)
    let pending = null
    let rxMessageIndex = -1

    for (let i = 0; i < (messages || []).length; i++) {
        const msg = messages[i]
        if (msg?.sender_role !== 'pharma') continue
        const parsed = parsePrescriptionMessage(msg.message_text)
        if (parsed.prescriptionId <= 0 || answered.has(parsed.prescriptionId)) continue
        const billMatch = String(parsed.headerText || '').match(/เลขที่บิล:\s*(.+)/)
        pending = {
            prescriptionId: parsed.prescriptionId,
            billNo: billMatch ? billMatch[1].trim() : `#${parsed.prescriptionId}`,
        }
        rxMessageIndex = i
    }

    if (!pending || rxMessageIndex < 0) return null

    const hasSlipAfterRx = (messages || [])
        .slice(rxMessageIndex + 1)
        .some((msg) => msg?.sender_role === 'user'
            && msg?.file_path
            && /\.(jpg|jpeg|png|gif|webp)$/i.test(String(msg.file_path)))

    return hasSlipAfterRx ? pending : null
}

const CHAT_SLIP_MSG_MARKER = /\[CHAT_SLIP:msg=(\d+)\]/
const BILLING_CTX_MARKER = /\[BILLING_CTX:patient=\d+;rx=(\d+)\]/

/** แสดงหมายเหตุสลิปบัญชี — ซ่อน marker ระบบ และใช้ข้อความอ่านง่าย */
export function formatBillingSlipDisplayNote(note) {
    const raw = String(note || '').trim()
    if (!raw) return ''

    const rxMatch = raw.match(BILLING_CTX_MARKER)
    const rxId = rxMatch ? Number(rxMatch[1]) || 0 : 0

    const plain = raw
        .replace(/\[BILLING_CTX:patient=\d+;rx=\d+\]/g, '')
        .replace(CHAT_SLIP_MSG_MARKER, '')
        .trim()

    if (plain) return plain
    if (rxId > 0) return `ค่ายาใบสรุปรายการยา #${rxId}`
    return ''
}

/** ดึง message_id ของสลิปในแชทที่เภสัชยืนยันแล้ว */
export function getConfirmedChatSlipMsgIds(slips) {
    const ids = new Set()
    for (const slip of slips || []) {
        const raw = String(slip?.note || '')
        for (const match of raw.matchAll(CHAT_SLIP_MSG_MARKER)) {
            const id = Number(match[1]) || 0
            if (id > 0) ids.add(id)
        }
    }
    return ids
}

export function isChatSlipImageMessage(msg) {
    return msg?.sender_role === 'user'
        && msg?.file_path
        && /\.(jpg|jpeg|png|gif|webp)$/i.test(String(msg.file_path))
}

/** ข้อความแจ้งชำระเงินสำเร็จ (หลังร้านอนุมัติ) */
export function parsePharmaPaymentSuccessMessage(text) {
    const raw = String(text || '')
    if (!/ระบบ:\s*การชำระเงินสำเร็จแล้ว/.test(raw)) {
        return { isPaymentSuccess: false, mainText: '' }
    }
    return {
        isPaymentSuccess: true,
        mainText: normalizeChatDisplayText(raw),
    }
}
