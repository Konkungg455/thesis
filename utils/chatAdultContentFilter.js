/**
 * กรองเนื้อหา 18+ / ลามก — ใช้ร่วม Nuxt + n8n (regex/heuristic ไม่ใช้ LLM)
 */

export const REPLY_ADULT = {
  th:
    'ขออภัยค่ะ telebot ให้บริการคัดกรองอาการเท่านั้น '
    + 'ไม่สามารถตอบเนื้อหาไม่เหมาะสมหรือ 18+ ได้ กรุณาพิมพ์อธิบายอาการด้วยภาษาสุภาพนะคะ',
  en:
    'Sorry, telebot only provides symptom screening. '
    + 'I cannot respond to adult or inappropriate (18+) content. Please describe your symptoms politely.',
};

/** คำตอบทางการแพทย์เกี่ยวกับเพศสัมพันธ์ — ไม่บล็อก */
const CLINICAL_SEX_CONTEXT_RE = /(?:หลัง(?:จาก)?|หลัง\s*มี|เจ็บ|ปวด|แสบ|คัน|อักเสบ|มี\s*แผล|ตกขาว|เลือดออก|discharge|bleed|burn|itch|pain|sore).{0,48}(?:เพศสัมพันธ์|มี\s*sex|after\s*sex|intercourse|sexual\s*activity)|(?:เพศสัมพันธ์|intercourse|after\s*sex|sexual\s*activity).{0,48}(?:หลัง|เจ็บ|ปวด|แสบ|คัน|อักเสบ|แผล|ตกขาว|เลือด|discharge|pain|sore|burn|itch)/i;

export const ADULT_KEYWORDS = [
  'หนังโป๊', 'คลิปโป๊', 'โป๊', 'ลามก', '18+', '18 บวก', 'เนื้อหา18',
  'เปลือย', 'แก้ผ้า', 'นู้ด', 'nude', 'naked', 'nsfw', 'xxx', 'porn', 'porno', 'pornhub',
  'onlyfans', 'only fans', 'hentai', 'blowjob', 'handjob', 'anal sex', 'sex tape',
  'sex video', 'sex chat', 'ส่งรูปโป๊', 'ขอดูโป๊', 'ขอรูปโป๊', 'เล่าเรื่องเซ็', 'roleplay',
  'bdsm', 'fetish', 'ส่งลิงก์โป๊', 'linkโป๊', 'av japan', 'jav ',
  'อยากมีเซ็', 'ชวนมีเซ็', 'ขอมีเซ็', 'phone sex', 'cybersex', 'sexting',
  'strip tease', 'striptease', 'erotic', 'อีโรติ', 'สื่อลามก',
];

export const ADULT_CONTENT_RE = /(หนังโป๊|คลิปโป๊|(?:^|\s)โป๊(?:$|\s|[\?!\.])|ลามก|18\s*\+|18\s*plus|18\s*บวก|onlyfans|only\s*fans|hentai|porn(?:o|hub)?|\bxxx\b|\bnsfw\b|\bnude\b|\bnaked\b|blowjob|handjob|sex\s*tape|sex\s*video|sex\s*chat|phone\s*sex|cybersex|sexting|ส่งรูป(?:โป๊|เปลือย)|ขอ(?:ดู|รูป).*โป๊|เปลือย(?:กาย)?|แก้ผ้า|role\s*play|roleplay|\bbdsm\b|fetish|erotic|อีโรติ|สื่อลามก|อยาก(?:มี|เล่น|ทำ).*?(?:เซ็|sex)|ชวน(?:มี|เล่น).*?(?:เซ็|sex)|ขอ(?:มี|เล่น).*?(?:เซ็|sex))/i;

function containsAny(text, list) {
  const t = String(text || '').toLowerCase();
  return list.some((k) => t.includes(String(k).toLowerCase()));
}

export function isClinicalSexContext(text) {
  return CLINICAL_SEX_CONTEXT_RE.test(String(text || '').trim());
}

export function isAdultContentInput(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (isClinicalSexContext(t)) return false;
  if (containsAny(t, ADULT_KEYWORDS)) return true;
  return ADULT_CONTENT_RE.test(t);
}
