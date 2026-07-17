/**
 * กรองพิมพ์มั่ว (gibberish) — ใช้ร่วมกัน frontend / n8n / server
 */

export const SCREENING_VALID_RE = new RegExp(
  [
    'เล็กน้อย', 'ปานกลาง', 'รุนแรง', 'วันนี้', 'เมื่อวาน', 'ไม่ทราบ', 'ไม่รู้', 'ไม่แน่ใจ',
    'ไม่มี', 'ไม่ค่อย', 'ค่อนข้าง', 'มาก', 'น้อย', 'ปาน', 'พอใจ', 'นิดหน่อย', 'นิดเดียว',
    'สัปดาห์', 'เดือน', 'ชั่วโมง', 'ประมาณ', 'เริ่ม', 'เป็นมา', 'มีอาการ', 'ไม่มีอาการ',
    'mild', 'moderate', 'severe', 'today', 'yesterday', 'unknown', 'unsure', 'none', 'no',
    'pain', 'hurt', 'headache', 'fever', 'cough', 'nausea', 'dizzy', 'better', 'worse',
  ].join('|'),
  'i',
);

const ENGLISH_VALID_RE = /^(ok|okay|yes|no|none|pain|hurt|mild|moderate|severe|today|yesterday|help|rest|food|sleep|stress|unknown|unsure|maybe|headache|fever|cough|nausea|dizzy|better|worse)$/i;

/** ตัวอักษร/ๆ ซ้ำๆ เช่n เทพๆๆๆ, 55555 */
export function hasSpamRepetition(raw, compact) {
  if (/ๆ{2,}/.test(raw)) return true;
  if (new RegExp('(.)\\1{3,}', 'u').test(compact)) return true;
  if (/^(555+|666+|ฮา+|haha+|hehe+|lol+|wow+|omg+|เทพ+|เจ๋+|โคตร+|แจ่ม+|cool+|nice+|okok+|yesyes+)[ๆ]*$/iu.test(compact)) {
    return true;
  }
  if (/^[ก-ฮ]{1,4}ๆ+$/u.test(compact)) return true;
  return false;
}

function isThaiKeyboardMash(compact) {
  if (compact.length < 6) return false;
  if (SCREENING_VALID_RE.test(compact)) return false;

  const vowels = (compact.match(/[าิีึืุูเแโใไ]/g) || []).length;
  const vowelRatio = vowels / compact.length;

  // ฟหกฟหก / กดคีย์บอร์ดมั่ว — ส่วนซ้ำ 2–4 ตัว
  if (/(.{2,4})\1{2,}/u.test(compact)) return true;

  // พยางค์ไทยปกติแทบไม่มีพยัญชนะติดกัน 4+ ตัว
  const consonantRuns = compact.match(/[ก-ฮ]{4,}/gu) || [];
  if (consonantRuns.some((run) => run.length >= 4)) return true;

  // สตริงยาว ไม่มีคำที่เข้าใจได้ สัดส่วนสระต่ำ
  if (compact.length >= 8 && vowelRatio < 0.28) return true;

  // สตริงยาวมากแต่สระน้อยมาก
  if (compact.length >= 12 && vowels <= 2) return true;

  // ไม่มีช่องว่าง ยาว ≥10 ไม่ตรงคำตอบซักประวัติที่รู้จัก
  if (compact.length >= 10 && !/\s/.test(compact) && !SCREENING_VALID_RE.test(compact) && vowelRatio < 0.32) {
    return true;
  }

  return false;
}

/** พิมพ์มั่ว / ตัวเลขล้วน / สัญลักษณ์ล้วน / คีย์บอร์ดมั่ว */
export function isGibberishInput(text) {
  const raw = String(text || '').trim();
  if (!raw) return true;
  if (raw.length <= 1 || /^[\?\.\!\,\s]+$/.test(raw)) return true;
  if (/^[\d\s]+$/.test(raw) && /\d/.test(raw)) return true;
  if (/^[\s\.\,\!\?\-\+\=\*\#\@\%\^\&\(\)\[\]\{\}\|\\\:\;\"\'\<\>\/\~\`_]+$/.test(raw)) return true;

  const compact = raw.replace(/\s+/g, '');
  if (hasSpamRepetition(raw, compact)) return true;

  if (/[ก-๙]/.test(raw)) {
    return isThaiKeyboardMash(compact);
  }

  if (/^[a-zA-Z\s]+$/.test(raw) && compact.length >= 6) {
    const vowels = (raw.match(/[aeiouAEIOU]/g) || []).length;
    const ratio = vowels / compact.length;
    if (ENGLISH_VALID_RE.test(compact)) return false;
    if (!/\s/.test(raw) && compact.length >= 6 && ratio < 0.38) return true;
    if (vowels === 0) return true;
    if (compact.length >= 10 && ratio <= 0.28) return true;
    if (/^([b-df-hj-np-tv-xz]{2,6})\1+$/i.test(compact)) return true;
    // asdasdasd / fafdasdasdas
    if (!/\s/.test(raw) && compact.length >= 8 && /^[a-z]+$/i.test(compact) && ratio < 0.42) return true;
  }

  return false;
}

export const REPLY_GIBBERISH_TH =
  'กรุณาตอบเรื่องอาการให้ชัดเจนอีกครั้งนะคะ (เช่น เล็กน้อยวันนี้ · ปานกลางเมื่อวาน · รุนแรง 2-3 วันก่อน)';

export const REPLY_GIBBERISH_EN =
  'Please answer about your symptom clearly (e.g. mild today · moderate since yesterday · severe for 2-3 days).';
