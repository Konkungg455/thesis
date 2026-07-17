/**
 * กรองพิมพ์มั่ว (gibberish) — ใช้ร่วมกัน frontend / n8n
 */

export const SCREENING_VALID_RE = new RegExp(
  [
    'เล็กน้อย', 'ปานกลาง', 'รุนแรง', 'วันนี้', 'เมื่อวาน', 'ไม่ทราบ', 'ไม่รู้', 'ไม่แน่ใจ',
    'ไม่มี', 'ไม่ค่อย', 'ไม่ได้', 'ยังไม่', 'ไม่เคย', 'ทำ', 'กิน', 'ดื่ม', 'ทาน', 'อะไร',
    'ค่อนข้าง', 'มาก', 'น้อย', 'ปาน', 'พอใจ', 'นิดหน่อย', 'นิดเดียว',
    'สัปดาห์', 'เดือน', 'ชั่วโมง', 'ประมาณ', 'เริ่ม', 'เป็นมา', 'มีอาการ', 'ไม่มีอาการ',
    'mild', 'moderate', 'severe', 'today', 'yesterday', 'unknown', 'unsure', 'none', 'no',
    'pain', 'hurt', 'headache', 'fever', 'cough', 'nausea', 'dizzy', 'better', 'worse',
  ].join('|'),
  'i',
);

const ENGLISH_VALID_RE = /^(ok|okay|yes|no|none|pain|hurt|mild|moderate|severe|today|yesterday|help|rest|food|sleep|stress|unknown|unsure|maybe|headache|fever|cough|nausea|dizzy|better|worse)$/i;

export function countGraphemes(text) {
  const s = String(text || '');
  if (!s) return 0;
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    try {
      const seg = new Intl.Segmenter('th', { granularity: 'grapheme' });
      return [...seg.segment(s)].length;
    } catch {
      /* fallback */
    }
  }
  return [...s].length;
}

const SHORT_VALID_ANSWER_RE = /^(ไม่|มี|ใช่|no|ok|yes)$/i;

export function isTooShortAnswer(text) {
  const compact = String(text || '').trim().replace(/\s+/g, '');
  if (!compact) return true;
  if (SHORT_VALID_ANSWER_RE.test(compact) || SCREENING_VALID_RE.test(compact)) return false;
  if (countGraphemes(compact) <= 2) return true;
  return false;
}

export function hasSpamRepetition(raw, compact) {
  if (/ๆ{2,}/.test(raw)) return true;
  if (new RegExp('(.)\\1{3,}', 'u').test(compact)) return true;
  if (/^(555+|666+|ฮา+|haha+|hehe+|lol+|wow+|omg+|เทพ+|เจ๋+|โคตร+|แจ่ม+|cool+|nice+|okok+|yesyes+)[ๆ]*$/iu.test(compact)) {
    return true;
  }
  if (/^[ก-ฮ]{1,4}ๆ+$/u.test(compact)) return true;
  return false;
}

const THAI_HEALTH_ANSWER_RE = new RegExp(
  [
    'ปวด', 'เจ็บ', 'ท้อง', 'ศีรษะ', 'ไอ', 'ไข้', 'คลื่น', 'อาเจียน', 'ทรงตัว', 'เวียน',
    'ตื้อ', 'ตุบ', 'แสบ', 'บวม', 'แดง', 'คัน', 'ชา', 'เหน็บ', 'ล่าง', 'บน', 'รอบ', 'สะดือ',
    'บีบ', 'จี๊ด', 'แปลบ', 'เมื่อย', 'อ่อนแรง', 'เหงื่อ', 'หนาว', 'ร้อน', 'ใจสั่น',
    'เล็กน้อย', 'ปานกลาง', 'รุนแรง', 'วันนี้', 'เมื่อวาน', 'ไม่ทราบ', 'ไม่รู้', 'ไม่แน่ใจ',
    'มี', 'ไม่มี', 'ไม่ได้', 'ยังไม่', 'ไม่เคย', 'ทำ', 'กิน', 'ดื่ม', 'ทาน', 'อะไร',
    'เป็น', 'เริ่ม', 'ชั่วโมง', 'นาที', 'วัน', 'สัปดาห์', 'เดือน',
  ].join('|'),
  'i',
);

function isShortThaiConsonantMash(compact) {
  if (THAI_HEALTH_ANSWER_RE.test(compact)) return false;
  if (SCREENING_VALID_RE.test(compact)) return false;
  if (!/^[ก-ฮ]+$/.test(compact)) return false;
  const vowels = (compact.match(/[าิีึืุูเแโใไ]/g) || []).length;
  if (vowels > 0) return false;
  const gLen = countGraphemes(compact);
  if (gLen >= 3 && gLen <= 6) return true;
  if (gLen >= 4 && /(.{2,3})\1+/u.test(compact)) return true;
  return false;
}

function isThaiKeyboardMash(compact) {
  if (THAI_HEALTH_ANSWER_RE.test(compact)) return false;
  if (compact.length < 6) return false;
  if (SCREENING_VALID_RE.test(compact)) return false;

  const vowels = (compact.match(/[าิีึืุูเแโใไ]/g) || []).length;
  const vowelRatio = vowels / compact.length;

  if (/(.{2,4})\1{2,}/u.test(compact)) return true;

  const consonantRuns = compact.match(/[ก-ฮ]{4,}/gu) || [];
  if (consonantRuns.some((run) => run.length >= 4)) return true;

  if (compact.length >= 8 && vowelRatio < 0.28) return true;
  if (compact.length >= 12 && vowels <= 2) return true;
  if (compact.length >= 10 && !/\s/.test(compact) && !SCREENING_VALID_RE.test(compact) && vowelRatio < 0.32) {
    return true;
  }

  return false;
}

/** พิมพ์มั่ว / ตัวเลขล้วน / สัญลักษณ์ล้วน / คีย์บอร์ดมั่ว */
export function isGibberishInput(text) {
  const raw = String(text || '').trim();
  if (!raw) return true;
  if (isTooShortAnswer(raw)) return true;
  if (/^[\?\.\!\,\s]+$/.test(raw)) return true;
  if (/^[\d\s]+$/.test(raw) && /\d/.test(raw)) return true;
  if (/^[\s\.\,\!\?\-\+\=\*\#\@\%\^\&\(\)\[\]\{\}\|\\\:\;\"\'\<\>\/\~\`_]+$/.test(raw)) return true;

  const compact = raw.replace(/\s+/g, '');
  if (hasSpamRepetition(raw, compact)) return true;

  if (/[ก-๙]/.test(raw)) {
    if (isShortThaiConsonantMash(compact)) return true;
    return isThaiKeyboardMash(compact);
  }

  if (/^[a-zA-Z\s]+$/.test(raw)) {
    const vowels = (raw.match(/[aeiouAEIOU]/g) || []).length;
    const ratio = compact.length ? vowels / compact.length : 0;
    if (ENGLISH_VALID_RE.test(compact)) return false;
    if (SCREENING_VALID_RE.test(compact)) return false;
    if (compact.length >= 4 && compact.length <= 5 && vowels === 0) return true;
    if (compact.length >= 4 && compact.length <= 5 && ratio < 0.25) return true;
    if (compact.length >= 6) {
      if (!/\s/.test(raw) && ratio < 0.38) return true;
      if (vowels === 0) return true;
      if (compact.length >= 10 && ratio <= 0.28) return true;
      if (/^([b-df-hj-np-tv-xz]{2,6})\1+$/i.test(compact)) return true;
      if (!/\s/.test(raw) && compact.length >= 8 && /^[a-z]+$/i.test(compact) && ratio < 0.42) return true;
    }
  }

  return false;
}
