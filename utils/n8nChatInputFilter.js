/**
 * กฎกรองข้อความสำหรับ n8n (Code node) — ตรงกับ useAiChatRules.js
 * ใช้ regex/heuristic ไม่ใช้ LLM → ไม่หลอน
 */

export const REPLY = {
  th: {
    profanity:
      'ขออภัยค่ะ กรุณาใช้ภาษาสุภาพในการสนทนากับ telebot นะคะ '
      + 'พิมพ์อธิบายอาการด้วยถ้อยคำสุภาพ แล้ว telebot จะช่วยคัดกรองให้ค่ะ',
    gibberish:
      'ขออภัยค่ะ คำตอบนี้ไม่เกี่ยวกับอาการที่กำลังซักอยู่ กรุณาพิมพ์คำตอบเรื่องอาการให้ชัดเจนอีกครั้งนะคะ',
    redflag:
      '🚨 อาการที่คุณแจ้งมาอาจมีความเสี่ยงสูง เพื่อความปลอดภัยกรุณากด "ติดต่อเภสัชกรของเราทันที" '
      + 'หรือถ้ารู้สึกแย่ลงให้ไปโรงพยาบาลที่ใกล้ที่สุดค่ะ',
  },
  en: {
    profanity:
      'Sorry, please use polite language with telebot. '
      + 'Describe your symptoms politely and telebot will continue the screening.',
    gibberish:
      'Sorry, that reply is not about the symptom being screened. Please answer about your symptom clearly.',
    redflag:
      '🚨 The symptoms you reported may be high-risk. For your safety, please tap "Contact our pharmacist now" '
      + 'or go to the nearest hospital if you feel worse.',
  },
};

const PROFANITY_RE = /(ควย|เหี้ย|สัส+|ระยำ|ชาติ\s*หมา|หน้าหี|จิ๋ม|เย็ด|ชิบหาย|เชี่ย|เชี้ย|แม่ง|อีห่า|ไอ้สัตว์|ไอ้เวร|พ่อมึง|แม่มึง|\bf+u+c+k|\bshit\b|\bbitch\b)/i;

const JOKE_ANSWER_RE = /ปวด\s*(ขี้|ตด|อึ|ง่วง|เบื่อ|รัก|เงิน|สอบ|การบ้าน|เกม|มือถือ|wifi|เน็ต|ใจ)/i;

const ALWAYS_IRRELEVANT = [
  'ปวดขี้', 'ปวดตด', 'ปวดง่วง', 'ปวดเบื่อ', 'ปวดรัก', 'ปวดเงิน', 'ปวดสอบ',
  'ปวดการบ้าน', 'ปวดเกม', 'ปวดมือถือ', 'ปวดwifi', 'ปวดเน็ต',
  'อยากขี้', 'อยากอึ', 'เล่าเรื่องผี', 'มุกตลก', 'ทายใจ', 'เป่ายิ้งฉุบ',
  'จีบได้ไหม', 'รักฉันไหม', 'มีแฟนหรือยัง', 'ทีเด็ดบอล', 'แทงบอล',
  'หวย', 'เลขเด็ด', 'ดูดวง', 'แต่งกลอน', 'เขียนโค้ด',
];

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

export function isProfanityInput(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  return PROFANITY_RE.test(t);
}

/** ตัวอักษร/ๆ ซ้ำๆ เช่n เทพๆๆๆ, 55555, ggggg — ไม่ใช้ LLM */
export function hasSpamRepetition(raw, compact) {
  if (/ๆ{2,}/.test(raw)) return true;
  if (new RegExp('(.)\\1{3,}', 'u').test(compact)) return true;
  if (/^(555+|666+|ฮา+|haha+|hehe+|lol+|wow+|omg+|เทพ+|เจ๋+|โคตร+|แจ่ม+|cool+|nice+|okok+|yesyes+)[ๆ]*$/iu.test(compact)) {
    return true;
  }
  if (/^[ก-ฮ]{1,4}ๆ+$/u.test(compact)) return true;
  return false;
}

export function isGibberishInput(text) {
  const raw = String(text || '').trim();
  if (!raw) return true;
  if (raw.length <= 1 || /^[\?\.\!\,\s]+$/.test(raw)) return true;
  if (/^[\d\s]+$/.test(raw) && /\d/.test(raw)) return true;
  if (/^[\s\.\,\!\?\-\+\=\*\#\@\%\^\&\(\)\[\]\{\}\|\\\:\;\"\'\<\>\/\~\`_]+$/.test(raw)) return true;

  const compact = raw.replace(/\s+/g, '');
  if (hasSpamRepetition(raw, compact)) return true;
  if (/[ก-๙]/.test(raw)) {
    const vowelCount = (raw.match(/[าิีึืุูเแโใไ]/g) || []).length;
    if (compact.length <= 40) return false;
    if (compact.length >= 6 && vowelCount === 0) return true;
    return false;
  }

  if (/^[a-zA-Z\s]+$/.test(raw) && compact.length >= 6) {
    const vowels = (raw.match(/[aeiouAEIOU]/g) || []).length;
    const ratio = vowels / compact.length;
    if (/^(ok|okay|yes|no|none|pain|hurt|mild|moderate|severe|today|yesterday|help|rest|food|sleep|stress|unknown|unsure|maybe|headache|fever|cough|nausea|dizzy|better|worse)$/i.test(compact)) {
      return false;
    }
    if (!/\s/.test(raw) && compact.length >= 7 && ratio < 0.38) return true;
    if (vowels === 0) return true;
    if (compact.length >= 12 && ratio <= 0.25) return true;
    if (/^([b-df-hj-np-tv-xz]{2,6})\1+$/i.test(compact)) return true;
  }

  return false;
}

export function isJokeAnswerInput(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  if (ALWAYS_IRRELEVANT.some((k) => lower.includes(k.toLowerCase()))) return true;
  if (JOKE_ANSWER_RE.test(t)) return true;
  if (/^(กินข้าว|ทานข้าว|ร้านอาหาร|แนะนำร้าน|ขอเพลง|ดูหนัง|เล่นเกม|หวย|ดูดวง|จีบได้ไหม|รักฉันไหม)/i.test(t)) return true;
  return false;
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
  if (isProfanityInput(userText)) {
    return { blocked: true, filterKind: 'profanity', message: msg.profanity, userText };
  }
  if (isGibberishInput(userText)) {
    return { blocked: true, filterKind: 'gibberish', message: msg.gibberish, userText };
  }
  if (isJokeAnswerInput(userText)) {
    return { blocked: true, filterKind: 'gibberish', message: msg.gibberish, userText };
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
    output: $json.blockMessage || 'ขออภัยค่ะ กรุณาพิมพ์คำตอบเรื่องอาการให้ชัดเจนอีกครั้งนะคะ',
    blocked: true,
    filterKind: $json.filterKind || 'gibberish',
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
function hasSpamRepetition(raw, compact) {
  if (/ๆ{2,}/.test(raw)) return true;
  if (new RegExp('(.)\\\\1{3,}', 'u').test(compact)) return true;
  if (/^(555+|666+|ฮา+|haha+|hehe+|lol+|wow+|omg+|เทพ+|เจ๋+|โคตร+|แจ่ม+|cool+|nice+|okok+|yesyes+)[ๆ]*$/iu.test(compact)) return true;
  if (/^[ก-ฮ]{1,4}ๆ+$/u.test(compact)) return true;
  return false;
}
function isGibberishInput(text) {
  const raw = String(text || '').trim();
  if (!raw) return true;
  if (raw.length <= 1 || /^[\\?\\.\\!\\,\\s]+$/.test(raw)) return true;
  if (/^[\\d\\s]+$/.test(raw) && /\\d/.test(raw)) return true;
  if (/^[\\s\\.\\,\\!\\?\\-\\+\\=\\*\\#\\@\\%\\^\\&\\(\\)\\[\\]\\{\\}\\|\\\\\\:\\;\\"\\'\\<\\>\\/\\~\\\`_]+$/.test(raw)) return true;
  const compact = raw.replace(/\\s+/g, '');
  if (hasSpamRepetition(raw, compact)) return true;
  if (/[ก-๙]/.test(raw)) {
    const vowelCount = (raw.match(/[าิีึืุูเแโใไ]/g) || []).length;
    if (compact.length <= 40) return false;
    if (compact.length >= 6 && vowelCount === 0) return true;
    return false;
  }
  if (/^[a-zA-Z\\s]+$/.test(raw) && compact.length >= 6) {
    const vowels = (raw.match(/[aeiouAEIOU]/g) || []).length;
    const ratio = vowels / compact.length;
    if (/^(ok|okay|yes|no|none|pain|hurt|mild|moderate|severe|today|yesterday|help|rest|food|sleep|stress|unknown|unsure|maybe|headache|fever|cough|nausea|dizzy|better|worse)$/i.test(compact)) return false;
    if (!/\\s/.test(raw) && compact.length >= 7 && ratio < 0.38) return true;
    if (vowels === 0) return true;
    if (compact.length >= 12 && ratio <= 0.25) return true;
    if (/^([b-df-hj-np-tv-xz]{2,6})\\1+$/i.test(compact)) return true;
  }
  return false;
}
function isJokeAnswerInput(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  const always = ${JSON.stringify(ALWAYS_IRRELEVANT)};
  if (always.some((k) => lower.includes(k.toLowerCase()))) return true;
  if (/ปวด\\s*(ขี้|ตด|อึ|ง่วง|เบื่อ|รัก|เงิน|สอบ|การบ้าน|เกม|มือถือ|wifi|เน็ต|ใจ)/i.test(t)) return true;
  if (/^(กินข้าว|ทานข้าว|ร้านอาหาร|แนะนำร้าน|ขอเพลง|ดูหนัง|เล่นเกม|หวย|ดูดวง|จีบได้ไหม|รักฉันไหม)/i.test(t)) return true;
  return false;
}
function isRedFlagInput(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  return /เลือดไหลไม่หยุด|หายใจไม่ออก|หายใจลำบาก|หอบ(?:เหนื่อย|มาก)|แน่นหน้าอก|เจ็บหน้าอก|หมดสติ|หน้ามืด|ชัก|แขนขาอ่อนแรง|พูดไม่ชัด|ปากเบี้ยว|อาเจียนพุ่ง|ตามัวเฉียบพลัน|ผื่นทั่วตัว|แพ้รุนแรง|ไข้\\s*4[0-9]|งูกัด|สุนัขกัด/i.test(t);
}
function classifyN8nInput(chatInput) {
  const locale = resolveLocale(chatInput);
  const userText = extractUserAnswer(chatInput);
  const th = ${JSON.stringify(REPLY.th)};
  const en = ${JSON.stringify(REPLY.en)};
  const msg = locale === 'en' ? en : th;
  if (!userText || userText === 'ping') return { blocked: false, filterKind: 'normal', message: '', userText };
  if (isRedFlagInput(userText)) return { blocked: true, filterKind: 'redflag', message: msg.redflag, userText };
  if (isProfanityInput(userText)) return { blocked: true, filterKind: 'profanity', message: msg.profanity, userText };
  if (isGibberishInput(userText)) return { blocked: true, filterKind: 'gibberish', message: msg.gibberish, userText };
  if (isJokeAnswerInput(userText)) return { blocked: true, filterKind: 'gibberish', message: msg.gibberish, userText };
  return { blocked: false, filterKind: 'normal', message: '', userText };
}
`.trim();
}
