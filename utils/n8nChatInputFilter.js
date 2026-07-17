/**
 * กฎกรองข้อความสำหรับ n8n (Code node) — ตรงกับ useAiChatRules.js
 * ใช้ regex/heuristic ไม่ใช้ LLM → ไม่หลอน
 */

import { REPLY_ADULT, isAdultContentInput, ADULT_KEYWORDS, ADULT_CONTENT_RE } from './chatAdultContentFilter.js';

export const REPLY = {
  th: {
    profanity:
      'ขออภัยค่ะ กรุณาใช้ภาษาสุภาพในการสนทนากับ telebot นะคะ '
      + 'พิมพ์อธิบายอาการด้วยถ้อยคำสุภาพ แล้ว telebot จะช่วยคัดกรองให้ค่ะ',
    adult: REPLY_ADULT.th,
    redflag:
      '🚨 อาการที่คุณแจ้งมาอาจมีความเสี่ยงสูง เพื่อความปลอดภัยกรุณากด "ติดต่อเภสัชกรของเราทันที" '
      + 'หรือถ้ารู้สึกแย่ลงให้ไปโรงพยาบาลที่ใกล้ที่สุดค่ะ',
  },
  en: {
    profanity:
      'Sorry, please use polite language with telebot. '
      + 'Describe your symptoms politely and telebot will continue the screening.',
    adult: REPLY_ADULT.en,
    redflag:
      '🚨 The symptoms you reported may be high-risk. For your safety, please tap "Contact our pharmacist now" '
      + 'or go to the nearest hospital if you feel worse.',
  },
};

const PROFANITY_RE = /(ควย|เหี้ย|สัส+|ระยำ|ชาติ\s*หมา|หน้าหี|จิ๋ม|เย็ด|ชิบหาย|เชี่ย|เชี้ย|แม่ง|อีห่า|ไอ้สัตว์|ไอ้เวร|พ่อมึง|แม่มึง|\bf+u+c+k|\bshit\b|\bbitch\b)/i;

const EMERGENCY_PHRASE_RE = /เลือดไหลไม่หยุด|หายใจไม่ออก|หายใจลำบาก|หอบ(?:เหนื่อย|มาก)|แน่นหน้าอก|เจ็บหน้าอก|หมดสติ|หน้ามืด|ชัก|แขนขาอ่อนแรง|พูดไม่ชัด|ปากเบี้ยว|อาเจียนพุ่ง|ตามัวเฉียบพลัน|ผื่นทั่วตัว|แพ้รุนแรง|ไข้\s*4[0-9]|งูกัด|สุนัขกัด/i;

export function resolveLocale(chatInput) {
  return /\[OUTPUT_LANG\]\s*English/i.test(String(chatInput || '')) ? 'en' : 'th';
}

export function extractUserAnswer(chatInput) {
  const text = String(chatInput || '');
  const tagged = text.match(/(?:คำตอบล่าสุดของ User|Latest user answer):\s*(.+?)(?:\n\n|\n\[|$)/is);
  if (tagged) return tagged[1].trim();

  if (text.includes('[SYSTEM]') || text.includes('[PROFILE]') || text.includes('[CHAT_ANSWERS]')) {
    const lines = text.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i];
      if (/^\[/.test(line)) continue;
      if (/^(Locale:|Locked symptom:|Question number:)/i.test(line)) continue;
      return line;
    }
  }

  return text.trim();
}

export { isAdultContentInput } from './chatAdultContentFilter.js';

export function isProfanityInput(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  return PROFANITY_RE.test(t);
}

export function isRedFlagInput(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  return EMERGENCY_PHRASE_RE.test(t);
}

/** @returns {{ blocked: boolean, filterKind: string, message: string, userText: string }} */
export function classifyN8nInput(chatInput) {
  const locale = resolveLocale(chatInput);
  const userText = extractUserAnswer(chatInput);
  const msg = REPLY[locale] || REPLY.th;

  if (!userText || userText === 'ping') {
    return { blocked: false, filterKind: 'normal', message: '', userText };
  }

  if (isRedFlagInput(userText)) {
    return { blocked: true, filterKind: 'redflag', message: msg.redflag, userText };
  }
  if (isAdultContentInput(userText)) {
    return { blocked: true, filterKind: 'adult', message: msg.adult, userText };
  }
  if (isProfanityInput(userText)) {
    return { blocked: true, filterKind: 'profanity', message: msg.profanity, userText };
  }

  return { blocked: false, filterKind: 'normal', message: '', userText };
}

/** โค้ดสำหรับ n8n Code node "Input Guard" */
export function buildN8nInputGuardCode() {
  return `${buildN8nFilterHelpers()}
const input = $input.first().json;
const chatInput = String(input.chatInput || input.message || '');
const sessionId = input.sessionId || 'default';
const verdict = classifyN8nInput(chatInput);

return [{
  json: {
    ...input,
    chatInput,
    sessionId,
    userText: verdict.userText,
    blocked: verdict.blocked,
    filterKind: verdict.filterKind,
    blockMessage: verdict.message,
  },
}];`;
}

export function buildN8nBlockedReplyCode() {
  return `return [{
  json: {
    output: $json.blockMessage || '',
    blocked: true,
    filterKind: $json.filterKind || 'blocked',
  },
}];`;
}

function buildN8nFilterHelpers() {
  return `
function resolveLocale(chatInput) {
  return /\\[OUTPUT_LANG\\]\\s*English/i.test(String(chatInput || '')) ? 'en' : 'th';
}
function extractUserAnswer(chatInput) {
  const text = String(chatInput || '');
  const tagged = text.match(/(?:คำตอบล่าสุดของ User|Latest user answer):\\s*(.+?)(?:\\n\\n|\\n\\[|$)/is);
  if (tagged) return tagged[1].trim();
  if (text.includes('[SYSTEM]') || text.includes('[PROFILE]') || text.includes('[CHAT_ANSWERS]')) {
    const lines = text.trim().split(/\\r?\\n/).map((l) => l.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i];
      if (/^\\[/.test(line)) continue;
      if (/^(Locale:|Locked symptom:|Question number:)/i.test(line)) continue;
      return line;
    }
  }
  return text.trim();
}
function isProfanityInput(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  return /(ควย|เหี้ย|สัส+|ระยำ|ชาติ\\s*หมา|หน้าหี|จิ๋ม|เย็ด|ชิบหาย|เชี่ย|เชี้ย|แม่ง|อีห่า|ไอ้สัตว์|ไอ้เวร|พ่อมึง|แม่มึง|\\bf+u+c+k|\\bshit\\b|\\bbitch\\b)/i.test(t);
}
function isRedFlagInput(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  return /เลือดไหลไม่หยุด|หายใจไม่ออก|หายใจลำบาก|หอบ(?:เหนื่อย|มาก)|แน่นหน้าอก|เจ็บหน้าอก|หมดสติ|หน้ามืด|ชัก|แขนขาอ่อนแรง|พูดไม่ชัด|ปากเบี้ยว|อาเจียนพุ่ง|ตามัวเฉียบพลัน|ผื่นทั่วตัว|แพ้รุนแรง|ไข้\\s*4[0-9]|งูกัด|สุนัขกัด/i.test(t);
}
function isClinicalSexContext(text) {
  return /(?:หลัง(?:จาก)?|หลัง\\s*มี|เจ็บ|ปวด|แสบ|คัน|อักเสบ|มี\\s*แผล|ตกขาว|เลือดออก|discharge|bleed|burn|itch|pain|sore).{0,48}(?:เพศสัมพันธ์|มี\\s*sex|after\\s*sex|intercourse|sexual\\s*activity)/i.test(String(text || ''))
    || /(?:เพศสัมพันธ์|intercourse|after\\s*sex|sexual\\s*activity).{0,48}(?:หลัง|เจ็บ|ปวด|แสบ|คัน|อักเสบ|แผล|ตกขาว|เลือด|discharge|pain|sore|burn|itch)/i.test(String(text || ''));
}
function isAdultContentInput(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (isClinicalSexContext(t)) return false;
  const adultKeywords = ${JSON.stringify(ADULT_KEYWORDS)};
  const lower = t.toLowerCase();
  if (adultKeywords.some((k) => lower.includes(String(k).toLowerCase()))) return true;
  return ${ADULT_CONTENT_RE.toString()}.test(t);
}
function classifyN8nInput(chatInput) {
  const locale = resolveLocale(chatInput);
  const userText = extractUserAnswer(chatInput);
  const th = ${JSON.stringify(REPLY.th)};
  const en = ${JSON.stringify(REPLY.en)};
  const msg = locale === 'en' ? en : th;
  if (!userText || userText === 'ping') return { blocked: false, filterKind: 'normal', message: '', userText };
  if (isRedFlagInput(userText)) return { blocked: true, filterKind: 'redflag', message: msg.redflag, userText };
  if (isAdultContentInput(userText)) return { blocked: true, filterKind: 'adult', message: msg.adult, userText };
  if (isProfanityInput(userText)) return { blocked: true, filterKind: 'profanity', message: msg.profanity, userText };
  return { blocked: false, filterKind: 'normal', message: '', userText };
}
`.trim();
}
