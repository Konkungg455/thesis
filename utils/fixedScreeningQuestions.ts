/**
 * คำถามคัดกรองทำหยาบแบบตายตัว (32 อาการ × 5 ข้อ)
 * ใช้แทนการให้โมเดลคิดคำถามเอง — กันหลอน placeholder
 */

import {
  ALIASES_EN,
  BANK_EN,
  DEFAULT_BANK_EN,
  MENSTRUAL_Q1_FOR_MALE_EN,
  MENSTRUAL_Q1_FOR_UNKNOWN_EN,
  PHARMACY_CONSULT_CTA_EN,
  SEE_PHARMACIST_SECTION_TITLE_EN,
  SEE_PHARMACIST_WARNING_ITEMS_EN,
  SYMPTOM_LABEL_EN,
} from './fixedScreeningQuestions.en';

export type ChatLocale = 'th' | 'en';

export type FixedQuestion = {
  header: string;
  sub: string;
  hint: string;
};

export type FixedQuestionOpts = {
  /** เพศจากโปรไฟล์ เช่น ชาย / หญิง / M / F */
  gender?: string;
  /** ภาษาคำถาม/สรุป — th | en */
  locale?: ChatLocale;
};

export function resolveChatLocale(locale?: string | null): ChatLocale {
  const v = String(locale || '').trim().toLowerCase();
  if (v === 'en' || v === 'english' || v === 'en-us' || v === 'en-gb') return 'en';
  return 'th';
}

/** ค่าโรคประจำตัวจากโปรไฟล์ — คืนค่าว่างถ้าไม่มี/ไม่ระบุ */
export function normalizePersonalDisease(raw?: string | null): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  const lower = s.toLowerCase();
  if (
    s === '-'
    || s === '—'
    || /^(ไม่มี|ไม่เป็น|ไม่ทราบ|ไม่ระบุ|none|n\/?a|no|nil|null|-)$/i.test(lower)
  ) {
    return '';
  }
  return s;
}

export function hasMeaningfulPersonalDisease(raw?: string | null): boolean {
  return Boolean(normalizePersonalDisease(raw));
}

export function symptomDisplayName(symptomName: string, locale: ChatLocale = 'th'): string {
  const key = normalizeSymptomKey(symptomName) || String(symptomName || '').trim();
  if (!key) return locale === 'en' ? 'selected symptom' : 'อาการที่เลือก';
  if (locale === 'en') return SYMPTOM_LABEL_EN[key] || key;
  return key;
}

/** ผู้ใช้เป็นเพศชายหรือไม่ (จากโปรไฟล์บัญชี) */
export function isMaleGender(gender?: string): boolean {
  const g = String(gender || '').trim().toLowerCase();
  if (!g) return false;
  if (g === 'ชาย' || g === 'm' || g === 'male' || g === 'man') return true;
  if (g === '1' || g === 'boy') return true;
  // กันค่าที่มี whitespace / คำผสม
  if (/(?:^|[^a-zก-๙])ชาย(?:$|[^a-zก-๙])/.test(g)) return true;
  return false;
}

/** ผู้ใช้เป็นเพศหญิงหรือไม่ */
export function isFemaleGender(gender?: string): boolean {
  const g = String(gender || '').trim().toLowerCase();
  if (!g) return false;
  if (g === 'หญิง' || g === 'f' || g === 'female' || g === 'woman') return true;
  if (g === '2' || g === 'girl') return true;
  return false;
}

/** ดึงเพศจากโปรไฟล์ หรือ localStorage (user_data) */
export function resolveUserGender(profile?: { gender?: string } | null): string {
  const candidates: string[] = [];
  const direct = String(profile?.gender || '').trim();
  if (direct) candidates.push(direct);

  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem('user_data');
      if (raw) {
        const parsed = JSON.parse(raw);
        const fromLs = String(parsed?.gender || '').trim();
        if (fromLs) candidates.push(fromLs);
      }
    } catch { /* ignore */ }
  }

  // เลือกรายการที่เป็นชาย/หญิงก่อน (ข้าม ไม่ระบุ / ค่าว่าง)
  for (const c of candidates) {
    if (isMaleGender(c) || isFemaleGender(c)) return c;
  }
  return candidates[0] || '';
}

/** คำถามข้อ 1 ปวดประจำเดือน สำหรับผู้ชาย */
export const MENSTRUAL_Q1_FOR_MALE: FixedQuestion = {
  header: 'พี่สาว/น้องสาว/ลูกสาว/แฟน/แม่ ลักษณะอาการปวดประจำเดือน',
  sub: 'เป็นแบบไหน',
  hint: 'ปวดท้องล่างบีบๆ, ปวดร้าวหลัง, ปวดตื้อสองข้าง',
};

/** เมื่อยังไม่ระบุเพศ — เปิดทางถามแทนญาติด้วย */
export const MENSTRUAL_Q1_FOR_UNKNOWN: FixedQuestion = {
  header: 'ตัวคุณเองหรือพี่สาว/น้องสาว/ลูกสาว/แฟน/แม่ ลักษณะอาการปวดประจำเดือน',
  sub: 'เป็นแบบไหน (ระบุด้วยว่าถามแทนใคร)',
  hint: 'ตัวเอง ปวดบีบๆ, พี่สาว ปวดร้าวหลัง, แฟน ปวดตื้อสองข้าง',
};

/** เลือกชุดคำถามข้อ 1 สำหรับปวดประจำเดือน ตามเพศ */
export function getMenstrualQ1ForGender(gender?: string, locale: ChatLocale = 'th'): FixedQuestion | null {
  if (isFemaleGender(gender)) return null; // ใช้ชุด default ใน BANK
  if (locale === 'en') {
    if (isMaleGender(gender)) return { ...MENSTRUAL_Q1_FOR_MALE_EN };
    return { ...MENSTRUAL_Q1_FOR_UNKNOWN_EN };
  }
  if (isMaleGender(gender)) return MENSTRUAL_Q1_FOR_MALE;
  return MENSTRUAL_Q1_FOR_UNKNOWN;
}

/** ปวดประจำเดือน → ต้องใช้คำถามพิเศษเมื่อไม่ใช่เพศหญิงชัดเจน */
export function shouldAskMenstrualForRelative(gender?: string): boolean {
  return !isFemaleGender(gender);
}

const Q2_GENERIC = (label: string): FixedQuestion => ({
  header: 'ความรุนแรงและระยะเวลา',
  sub: `${label}รุนแรงแค่ไหนและเริ่มเมื่อไหร่`,
  hint: 'เล็กน้อยวันนี้, ปานกลางเมื่อวาน, รุนแรง 2-3 วันก่อน, มากกว่า 1 สัปดาห์',
});

const Q3_GENERIC = (): FixedQuestion => ({
  header: 'ปัจจัยกระตุ้นหรือสิ่งที่ทำให้อาการดีขึ้น/แย่ลง',
  sub: 'อะไรกระตุ้นหรือทำให้อาการดีขึ้น/แย่ลง',
  hint: 'อาหาร, พักผ่อน, ยา, ไม่ทราบ',
});

const Q4_GENERIC = (): FixedQuestion => ({
  header: 'อาการร่วมที่สำคัญ',
  sub: 'มีอาการอื่นร่วมด้วยหรือไม่',
  hint: 'ไม่มี, มีไข้, คลื่นไส้, อ่อนเพลีย',
});

const Q5_GENERIC = (): FixedQuestion => ({
  header: 'การดูแลตัวเองเบื้องต้นที่ทำไปแล้ว',
  sub: 'คุณดูแลตัวเองอย่างไรมาแล้วบ้าง',
  hint: 'ยังไม่ได้ทำอะไร, กินยาแก้ปวด, พักผ่อน, หาซื้อยาเอง',
});

/** คำถามข้อ 1 เฉพาะอาการ + ข้อ 2–5 ปรับเล็กน้อยตามอาการ */
const BANK: Record<string, FixedQuestion[]> = {
  'ปวดศีรษะ': [
    { header: 'ลักษณะอาการปวดหัว', sub: 'คุณปวดหัวแบบไหน', hint: 'ปวดตุบๆ, ปวดตื้อ, ปวดแปลบ, ปวดรอบหัว' },
    Q2_GENERIC('ปวด'),
    { header: 'ปัจจัยและบริบท', sub: 'อะไรกระตุ้นหรือทำให้อาการดีขึ้น/แย่ลง', hint: 'แสงจ้า, นอนน้อย, ความเครียด, ไม่ทราบ' },
    { header: 'อาการร่วมที่สำคัญ', sub: 'มีอาการอื่นร่วมด้วยหรือไม่', hint: 'ไม่มี, คลื่นไส้, ตามัว, คอ stiff' },
    Q5_GENERIC(),
  ],
  'เวียนศีรษะ': [
    { header: 'ลักษณะอาการเวียนศีรษะ', sub: 'คุณรู้สึกแบบไหน', hint: 'ห้องหมุน, มึนหัว, ทรงตัวไม่ได้, จะเป็นลม' },
    Q2_GENERIC('อาการ'),
    { header: 'ปัจจัยและบริบท', sub: 'อะไรกระตุ้นหรือทำให้อาการดีขึ้น/แย่ลง', hint: 'ลุกขึ้นเร็ว, พักผ่อน, หันคอ, ไม่ทราบ' },
    { header: 'อาการร่วมที่สำคัญ', sub: 'มีอาการอื่นร่วมด้วยหรือไม่', hint: 'ไม่มี, บ้านหมุน, หูอื้อ, คลื่นไส้' },
    Q5_GENERIC(),
  ],
  'ปวดข้อ': [
    { header: 'ลักษณะอาการปวดข้อ', sub: 'ปวดข้อไหนและปวดแบบไหน', hint: 'เข่าปวดตื้อ, ข้อมือปวดบวม, ข้อนิ้วปวดแปลบ' },
    Q2_GENERIC('ปวด'),
    Q3_GENERIC(),
    { header: 'อาการร่วมที่สำคัญ', sub: 'มีอาการอื่นร่วมด้วยหรือไม่', hint: 'ไม่มี, ข้อบวม, ข้อร้อน, ขยับยาก' },
    Q5_GENERIC(),
  ],
  'ปวดกล้ามเนื้อ': [
    { header: 'ลักษณะอาการปวดกล้ามเนื้อ', sub: 'ปวดตำแหน่งไหนและปวดแบบไหน', hint: 'คอ-บ่าตึง, หลังปวดตื้อ, น่องปวดเกร็ง' },
    Q2_GENERIC('ปวด'),
    { header: 'ปัจจัยและบริบท', sub: 'อะไรกระตุ้นหรือทำให้อาการดีขึ้น/แย่ลง', hint: 'ยกของหนัก, นั่งนาน, พักผ่อน, นวด' },
    Q4_GENERIC(),
    Q5_GENERIC(),
  ],
  'ไข้': [
    { header: 'ลักษณะอาการไข้', sub: 'ไข้เป็นแบบไหนและวัดได้ประมาณเท่าไร', hint: 'ไข้ต่ำๆ, ไข้สูง, หนาวสั่น, ตัวร้อนทั้งวัน' },
    Q2_GENERIC('ไข้'),
    Q3_GENERIC(),
    { header: 'อาการร่วมที่สำคัญ', sub: 'มีอาการอื่นร่วมด้วยหรือไม่', hint: 'ไม่มี, ไอ, เจ็บคอ, ปวดหัว' },
    Q5_GENERIC(),
  ],
  'ไอ': [
    { header: 'ลักษณะอาการไอ', sub: 'ไอแบบไหน', hint: 'ไอแห้ง, ไอมีเสมหะ, ไอกลางคืน, ไอติดๆ' },
    Q2_GENERIC('อาการไอ'),
    Q3_GENERIC(),
    { header: 'อาการร่วมที่สำคัญ', sub: 'มีอาการอื่นร่วมด้วยหรือไม่', hint: 'ไม่มี, ไข้, เจ็บคอ, หายใจเหนื่อย' },
    Q5_GENERIC(),
  ],
  'เจ็บคอ': [
    { header: 'ลักษณะอาการเจ็บคอ', sub: 'เจ็บคอแบบไหน', hint: 'เจ็บแสบ, เจ็บตอนกลืน, คอแห้ง, มีฝ้าขาว' },
    Q2_GENERIC('เจ็บ'),
    Q3_GENERIC(),
    { header: 'อาการร่วมที่สำคัญ', sub: 'มีอาการอื่นร่วมด้วยหรือไม่', hint: 'ไม่มี, ไข้, ไอ, ต่อมน้ำเหลืองบวม' },
    Q5_GENERIC(),
  ],
  'ปวดท้อง': [
    { header: 'ลักษณะอาการปวดท้อง', sub: 'ปวดตรงไหนและปวดแบบไหน', hint: 'ท้องบนปวดบีบ, ท้องล่างปวดตื้อ, รอบสะดือปวดแสบ' },
    Q2_GENERIC('ปวด'),
    { header: 'ปัจจัยและบริบท', sub: 'อะไรกระตุ้นหรือทำให้อาการดีขึ้น/แย่ลง', hint: 'หลังกินอาหาร, หิว, ถ่ายแล้วดีขึ้น, ไม่ทราบ' },
    { header: 'อาการร่วมที่สำคัญ', sub: 'มีอาการอื่นร่วมด้วยหรือไม่', hint: 'ไม่มี, คลื่นไส้, ท้องอืด, ท้องเสีย' },
    Q5_GENERIC(),
  ],
  'ท้องเสีย': [
    { header: 'ลักษณะอาการท้องเสีย', sub: 'ถ่ายวันละกี่ครั้งและลักษณะอุจจาระ', hint: '1-2 ครั้งเหลว, 3-5 ครั้งเป็นน้ำ, 6-10 ครั้งมีเมือก' },
    Q2_GENERIC('อาการ'),
    { header: 'ปัจจัยและบริบท', sub: 'กินอะไรผิดปกติมาก่อนหรือไม่', hint: 'อาหารค้างคืน, น้ำไม่สะอาด, ไม่ทราบ, กินยาปฏิชีวนะ' },
    { header: 'อาการร่วมที่สำคัญ', sub: 'มีอาการอื่นร่วมด้วยหรือไม่', hint: 'ไม่มี, ปวดท้อง, คลื่นไส้, มีไข้' },
    Q5_GENERIC(),
  ],
  'ท้องผูก': [
    { header: 'ลักษณะอาการท้องผูก', sub: 'ถ่ายลำบากแบบไหน', hint: 'ถ่ายไม่ออก 2-3 วัน, อุจจาระแข็ง, เบ่งมาก, ถ่ายน้อย' },
    Q2_GENERIC('อาการ'),
    Q3_GENERIC(),
    { header: 'อาการร่วมที่สำคัญ', sub: 'มีอาการอื่นร่วมด้วยหรือไม่', hint: 'ไม่มี, ท้องอืด, ปวดท้อง, คลื่นไส้' },
    Q5_GENERIC(),
  ],
  'ริดสีดวงทวาร': [
    { header: 'ลักษณะอาการริดสีดวง', sub: 'มีอาการแบบไหน', hint: 'เจ็บตอนถ่าย, มีเลือดปนนิดหน่อย, มีก้อนยื่น, คันรอบทวาร' },
    Q2_GENERIC('อาการ'),
    Q3_GENERIC(),
    { header: 'อาการร่วมที่สำคัญ', sub: 'มีอาการอื่นร่วมด้วยหรือไม่', hint: 'ไม่มี, ท้องผูก, ปวดทวาร, มีเลือดปน' },
    Q5_GENERIC(),
  ],
  'คลื่นไส้/อาเจียน': [
    { header: 'ลักษณะอาการคลื่นไส้/อาเจียน', sub: 'อาการเป็นแบบไหน', hint: 'คลื่นไส้ไม่อาเจียน, อาเจียนเป็นครั้งคราว, อาเจียนบ่อย, อาเจียนหลังกิน' },
    Q2_GENERIC('อาการ'),
    Q3_GENERIC(),
    { header: 'อาการร่วมที่สำคัญ', sub: 'มีอาการอื่นร่วมด้วยหรือไม่', hint: 'ไม่มี, ปวดท้อง, เวียนหัว, ท้องเสีย' },
    Q5_GENERIC(),
  ],
  'กรดไหลย้อน': [
    { header: 'ลักษณะอาการกรดไหลย้อน', sub: 'รู้สึกแบบไหน', hint: 'แสบร้อนอก, เรอเปรี้ยว, แน่นอกหลังกิน, จุกคอ' },
    Q2_GENERIC('อาการ'),
    { header: 'ปัจจัยและบริบท', sub: 'อะไรกระตุ้นหรือทำให้อาการดีขึ้น/แย่ลง', hint: 'อาหารเผ็ดมัน, นอนหลังกิน, กาแฟ, ไม่ทราบ' },
    Q4_GENERIC(),
    Q5_GENERIC(),
  ],
  'ปวดประจำเดือน': [
    { header: 'ลักษณะอาการปวดประจำเดือน', sub: 'ปวดแบบไหนและตรงไหน', hint: 'ปวดท้องล่างบีบๆ, ปวดร้าวหลัง, ปวดตื้อสองข้าง' },
    Q2_GENERIC('ปวด'),
    Q3_GENERIC(),
    { header: 'อาการร่วมที่สำคัญ', sub: 'มีอาการอื่นร่วมด้วยหรือไม่', hint: 'ไม่มี, คลื่นไส้, ปวดหัว, อ่อนเพลีย' },
    Q5_GENERIC(),
  ],
  'ตกขาวผิดปกติ': [
    { header: 'ลักษณะตกขาว', sub: 'ตกขาวเป็นแบบไหน', hint: 'ขาวข้นมีกลิ่น, เหลืองคัน, ใสไม่มีกลิ่น, มีเลือดปน' },
    Q2_GENERIC('อาการ'),
    Q3_GENERIC(),
    { header: 'อาการร่วมที่สำคัญ', sub: 'มีอาการอื่นร่วมด้วยหรือไม่', hint: 'ไม่มี, คันช่องคลอด, ปวดปัสสาวะ, ปวดท้องล่าง' },
    Q5_GENERIC(),
  ],
  'ผื่นคัน': [
    { header: 'ลักษณะของผื่น', sub: 'ผื่นเป็นแบบไหนและอยู่ตรงไหน', hint: 'คันมากที่แขน, แดงที่ลำตัว, ตุ่มใสที่ใบหน้า, ลมพิษ' },
    Q2_GENERIC('อาการ'),
    { header: 'ปัจจัยและบริบท', sub: 'สัมผัสอะไรมาก่อนหรือไม่', hint: 'สารเคมี, อาหาร, แมลง, ไม่ทราบ' },
    { header: 'อาการร่วมที่สำคัญ', sub: 'มีอาการอื่นร่วมด้วยหรือไม่', hint: 'ไม่มี, บวม, มีไข้, หายใจลำบาก' },
    Q5_GENERIC(),
  ],
  'ผื่นแพ้': [
    { header: 'ลักษณะผื่นแพ้', sub: 'ผื่นเป็นแบบไหนและอยู่ตรงไหน', hint: 'ลมพิษทั้งตัว, แดงคันเฉพาะที่, ตุ่มแดงแขนขา' },
    Q2_GENERIC('อาการ'),
    { header: 'ปัจจัยและบริบท', sub: 'สงสัยแพ้อะไรหรือไม่', hint: 'ยา, อาหารทะเล, ละออง, ไม่ทราบ' },
    { header: 'อาการร่วมที่สำคัญ', sub: 'มีอาการอื่นร่วมด้วยหรือไม่', hint: 'ไม่มี, หน้าบวม, หายใจลำบาก, มีไข้' },
    Q5_GENERIC(),
  ],
  'บาดแผลทั่วไป': [
    { header: 'ลักษณะบาดแผล', sub: 'แผลเป็นแบบไหนและอยู่ตรงไหน', hint: 'แผลตัดเล็ก, แผลฟกช้ำ, แผลฉีก, แผลถูกตำ' },
    Q2_GENERIC('อาการ'),
    { header: 'ปัจจัยและบริบท', sub: 'เกิดจากอะไร', hint: 'ของมีคม, หกล้ม, กีฬา, ไม่ทราบ' },
    { header: 'อาการร่วมที่สำคัญ', sub: 'มีอาการอื่นร่วมด้วยหรือไม่', hint: 'ไม่มี, เลือดออกนิดหน่อย, บวมแดง, มีหนอง' },
    Q5_GENERIC(),
  ],
  'แมลงสัตว์กัดต่อย': [
    { header: 'ลักษณะแผลกัด/ต่อย', sub: 'ถูกอะไรกัดและอาการเป็นแบบไหน', hint: 'ยุงคัน, ผึ้งต่อยบวม, มดแดง, ไม่ทราบชนิด' },
    Q2_GENERIC('อาการ'),
    Q3_GENERIC(),
    { header: 'อาการร่วมที่สำคัญ', sub: 'มีอาการอื่นร่วมด้วยหรือไม่', hint: 'ไม่มี, บวมมาก, มีไข้, หายใจลำบาก' },
    Q5_GENERIC(),
  ],
  'แผลถลอก/ไหม้': [
    { header: 'ลักษณะแผลถลอกหรือไหม้', sub: 'แผลเป็นแบบไหน', hint: 'ถลอกเล็ก, ไหม้แดง, มีตุ่มน้ำ, ลวกผิว' },
    Q2_GENERIC('อาการ'),
    { header: 'ปัจจัยและบริบท', sub: 'เกิดจากอะไร', hint: 'ลื่นล้ม, น้ำร้อน, น้ำมันร้อน, แดดเผา' },
    { header: 'อาการร่วมที่สำคัญ', sub: 'มีอาการอื่นร่วมด้วยหรือไม่', hint: 'ไม่มี, ปวดแสบ, มีหนอง, บวมแดง' },
    Q5_GENERIC(),
  ],
  'กลาก/เกลื้อน': [
    { header: 'ลักษณะผื่นกลาก/เกลื้อน', sub: 'ผื่นเป็นแบบไหนและอยู่ตรงไหน', hint: 'วงกลมขอบแดง, ด่างขาวตามตัว, คันตามซอก' },
    Q2_GENERIC('อาการ'),
    Q3_GENERIC(),
    Q4_GENERIC(),
    Q5_GENERIC(),
  ],
  'หิด/เหา': [
    { header: 'ลักษณะอาการหิด/เหา', sub: 'อาการเป็นแบบไหน', hint: 'คันกลางคืน, มีรอยข่วน, พบเหา/รังไข่, คันศีรษะ' },
    Q2_GENERIC('อาการ'),
    { header: 'ปัจจัยและบริบท', sub: 'คนใกล้ชิดมีอาการคล้ายกันหรือไม่', hint: 'มีคนในบ้าน, เพื่อนร่วมหอ, ไม่มี, ไม่ทราบ' },
    Q4_GENERIC(),
    Q5_GENERIC(),
  ],
  'ฝีหนอง': [
    { header: 'ลักษณะฝีหนอง', sub: 'ฝีเป็นแบบไหนและอยู่ตรงไหน', hint: 'บวมแดงมีหนอง, ก้อนเจ็บร้อน, ฝีหัวขาว' },
    Q2_GENERIC('อาการ'),
    Q3_GENERIC(),
    { header: 'อาการร่วมที่สำคัญ', sub: 'มีอาการอื่นร่วมด้วยหรือไม่', hint: 'ไม่มี, มีไข้, ปวดตุบ, บวมลาม' },
    Q5_GENERIC(),
  ],
  'แผลในปาก': [
    { header: 'ลักษณะแผลในปาก', sub: 'แผลเป็นแบบไหนและอยู่ตรงไหน', hint: 'ร้อนในริมฝีปาก, แผลกระพุ้งแก้ม, แผลลิ้น, หลายจุด' },
    Q2_GENERIC('อาการ'),
    Q3_GENERIC(),
    Q4_GENERIC(),
    Q5_GENERIC(),
  ],
  'ปวดฟัน': [
    { header: 'ลักษณะอาการปวดฟัน', sub: 'ปวดฟันแบบไหน', hint: 'ปวดตุบๆ, เสียวฟัน, ปวดตอนเคี้ยว, ปวดร้าวขากรรไกร' },
    Q2_GENERIC('ปวด'),
    Q3_GENERIC(),
    { header: 'อาการร่วมที่สำคัญ', sub: 'มีอาการอื่นร่วมด้วยหรือไม่', hint: 'ไม่มี, เหงือกบวม, มีไข้, หน้าบวม' },
    Q5_GENERIC(),
  ],
  'ตาแดง': [
    { header: 'ลักษณะอาการตาแดง', sub: 'ตาแดงแบบไหน', hint: 'แดงทั้งตา, แดงมุมตา, มีขี้ตา, คันน้ำตาไหล' },
    Q2_GENERIC('อาการ'),
    Q3_GENERIC(),
    { header: 'อาการร่วมที่สำคัญ', sub: 'มีอาการอื่นร่วมด้วยหรือไม่', hint: 'ไม่มี, เคืองตา, ตามัว, เจ็บตา' },
    Q5_GENERIC(),
  ],
  'ตากุ้งยิง': [
    { header: 'ลักษณะตากุ้งยิง', sub: 'อาการเป็นแบบไหน', hint: 'เปลือกตาบวมแดง, มีหัวหนอง, เจ็บกด, คันตา' },
    Q2_GENERIC('อาการ'),
    Q3_GENERIC(),
    Q4_GENERIC(),
    Q5_GENERIC(),
  ],
  'หูอักเสบ': [
    { header: 'ลักษณะอาการหูอักเสบ', sub: 'หูมีอาการแบบไหน', hint: 'ปวดหู, มีน้ำไหล, หูอื้อ, ได้ยินลด' },
    Q2_GENERIC('อาการ'),
    Q3_GENERIC(),
    { header: 'อาการร่วมที่สำคัญ', sub: 'มีอาการอื่นร่วมด้วยหรือไม่', hint: 'ไม่มี, มีไข้, เวียนหัว, เจ็บตอนกลืน' },
    Q5_GENERIC(),
  ],
  'คัดจมูก/น้ำมูกไหล': [
    { header: 'ลักษณะคัดจมูก/น้ำมูก', sub: 'อาการเป็นแบบไหน', hint: 'คัดแน่น, น้ำมูกใส, น้ำมูกข้นเหลือง, จามบ่อย' },
    Q2_GENERIC('อาการ'),
    Q3_GENERIC(),
    { header: 'อาการร่วมที่สำคัญ', sub: 'มีอาการอื่นร่วมด้วยหรือไม่', hint: 'ไม่มี, เจ็บคอ, ไข้, ปวดหัว' },
    Q5_GENERIC(),
  ],
  'ภูมิแพ้': [
    { header: 'ลักษณะอาการภูมิแพ้', sub: 'มีอาการแบบไหน', hint: 'จามน้ำมูก, คันตา, ผื่นลมพิษ, หายใจแน่น' },
    Q2_GENERIC('อาการ'),
    { header: 'ปัจจัยและบริบท', sub: 'อะไรกระตุ้นอาการแพ้', hint: 'ฝุ่น, เกสร, อาหาร, ไม่ทราบ' },
    Q4_GENERIC(),
    Q5_GENERIC(),
  ],
  'นอนไม่หลับ': [
    { header: 'ลักษณะอาการนอนไม่หลับ', sub: 'นอนยากแบบไหน', hint: 'หลับยาก, ตื่นกลางดึก, ตื่นเช้าเกินไป, นอนหลับไม่สนิท' },
    Q2_GENERIC('อาการ'),
    { header: 'ปัจจัยและบริบท', sub: 'อะไรที่คิดว่าทำให้นอนไม่หลับ', hint: 'เครียด, กาแฟ, มือถือก่อนนอน, ไม่ทราบ' },
    Q4_GENERIC(),
    Q5_GENERIC(),
  ],
  'วิตกกังวล': [
    { header: 'ลักษณะอาการวิตกกังวล', sub: 'รู้สึกกังวลแบบไหน', hint: 'คิดมากนอนไม่หลับ, ใจสั่น, กระวนกระวาย, กลัวโดยไม่มีสาเหตุชัด' },
    Q2_GENERIC('อาการ'),
    Q3_GENERIC(),
    { header: 'อาการร่วมที่สำคัญ', sub: 'มีอาการอื่นร่วมด้วยหรือไม่', hint: 'ไม่มี, ใจสั่น, เหงื่อออก, นอนไม่หลับ' },
    Q5_GENERIC(),
  ],
};

const DEFAULT_BANK: FixedQuestion[] = [
  { header: 'ลักษณะอาการหลัก', sub: 'อาการหลักเป็นแบบไหน', hint: 'เล็กน้อย, ปานกลาง, รุนแรง, ไม่ทราบ' },
  Q2_GENERIC('อาการ'),
  Q3_GENERIC(),
  Q4_GENERIC(),
  Q5_GENERIC(),
];

const ALIASES: Record<string, string> = {
  'ปวดหัว': 'ปวดศีรษะ',
  'ปวดศีรษะ': 'ปวดศีรษะ',
  'มึนหัว': 'เวียนศีรษะ',
  'คลื่นไส้': 'คลื่นไส้/อาเจียน',
  'อาเจียน': 'คลื่นไส้/อาเจียน',
  'น้ำมูกไหล': 'คัดจมูก/น้ำมูกไหล',
  'คัดจมูก': 'คัดจมูก/น้ำมูกไหล',
  'แผล': 'บาดแผลทั่วไป',
  'แผลไหม้': 'แผลถลอก/ไหม้',
  'แผลถลอก': 'แผลถลอก/ไหม้',
  'กลาก': 'กลาก/เกลื้อน',
  'เกลื้อน': 'กลาก/เกลื้อน',
  'หิด': 'หิด/เหา',
  'เหา': 'หิด/เหา',
};

export function normalizeSymptomKey(name: string): string {
  const raw = String(name || '').trim();
  if (!raw || raw === 'ทั่วไป' || raw.toLowerCase() === 'general') return '';
  if (BANK[raw]) return raw;
  if (ALIASES[raw]) return ALIASES[raw];

  const lower = raw.toLowerCase();
  if (ALIASES_EN[lower]) return ALIASES_EN[lower];
  for (const [thKey, enLabel] of Object.entries(SYMPTOM_LABEL_EN)) {
    if (lower === enLabel.toLowerCase()) return thKey;
  }
  for (const [alias, key] of Object.entries(ALIASES_EN)) {
    if (alias.includes(' ') && lower.includes(alias)) return key;
  }
  for (const key of Object.keys(BANK)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) return key;
  }
  for (const [alias, key] of Object.entries(ALIASES)) {
    if (lower.includes(alias.toLowerCase())) return key;
  }
  for (const [alias, key] of Object.entries(ALIASES_EN)) {
    if (lower.includes(alias)) return key;
  }
  return raw;
}

export function getFixedQuestion(
  symptomName: string,
  questionNum: number,
  opts: FixedQuestionOpts = {},
): FixedQuestion | null {
  const n = Number(questionNum);
  if (!Number.isFinite(n) || n < 1 || n > 5) return null;
  const locale = resolveChatLocale(opts.locale);
  const key = normalizeSymptomKey(symptomName);
  const list = locale === 'en'
    ? ((key && BANK_EN[key]) || DEFAULT_BANK_EN)
    : ((key && BANK[key]) || DEFAULT_BANK);
  const q = list[n - 1] || null;
  if (!q) return null;

  // ผู้ชาย / ยังไม่ระบุเพศ → ไม่ใช้คำถามแบบถามตัวเองอย่างเดียว
  if (key === 'ปวดประจำเดือน' && n === 1) {
    const custom = getMenstrualQ1ForGender(opts.gender, locale);
    if (custom) return { ...custom };
  }

  return { ...q };
}

/** รูปแบบข้อความมาตรฐานที่ UI / repair ใช้ */
export function formatFixedScreeningQuestion(
  symptomName: string,
  questionNum: number,
  opts: FixedQuestionOpts = {},
): string {
  const q = getFixedQuestion(symptomName, questionNum, opts);
  if (!q) return '';
  const locale = resolveChatLocale(opts.locale);
  if (locale === 'en') {
    return [
      `🩺 Question ${questionNum}: ${q.header}?`,
      '',
      `* ${q.sub}? (e.g. ${q.hint})`,
      '',
      'Please answer the questions below.',
    ].join('\n');
  }
  return [
    `🩺 ข้อ ${questionNum}: ${q.header}?`,
    '',
    `* ${q.sub}? (เช่น ${q.hint})`,
    '',
    'รบกวนตอบคำถามเหล่านี้ให้ผมทราบนะครับ',
  ].join('\n');
}

/**
 * ปรับ parts ที่ parse จากข้อความแล้ว — ให้ข้อ 1 ปวดประจำเดือนของผู้ชายใช้คำถามคนใกล้ชิด
 * (กันเคสข้อความเก่าใน DB / เพศโหลดช้าตอนบันทึก)
 */
export function adaptScreeningPartsForGender(
  parts: any[],
  symptomName: string,
  gender?: string,
  locale: ChatLocale = 'th',
): any[] {
  if (!Array.isArray(parts) || !parts.length) return parts;

  const customQ1 = getMenstrualQ1ForGender(gender, locale);
  if (!customQ1) return parts;

  const key = normalizeSymptomKey(symptomName);
  const looksMenstrual =
    key === 'ปวดประจำเดือน'
    || parts.some((p) => /ปวดประจำเดือน|menstrual pain/i.test(String(p?.header || p?.text || '')));
  if (!looksMenstrual) return parts;

  return parts.map((p) => {
    if (!p || typeof p !== 'object') return p;
    const num = String(p.number ?? '').replace(/\s*\/\s*\d+$/, '').trim();
    if (p.type === 'question_block' && num === '1') {
      return {
        ...p,
        header: customQ1.header,
        subQuestions: [{ text: customQ1.sub, hint: customQ1.hint }],
      };
    }
    if (p.type === 'question' && /(?:ข้อ|question)\s*1\s*[:：]/i.test(String(p.text || ''))) {
      return {
        ...p,
        text: locale === 'en'
          ? `🩺 Question 1: ${customQ1.header}?`
          : `🩺 ข้อ 1: ${customQ1.header}?`,
        hint: customQ1.hint,
      };
    }
    return p;
  });
}

/** ข้อความหลอนแบบ placeholder / วนซ้ำ — ต้องทิ้งแล้วใช้คำถาม fix */
export function isHallucinatedScreeningText(text: string): boolean {
  const t = String(text || '');
  if (!t.trim()) return false;
  if (/(กำลังดำเนินการตามขั้นตอน|คำถามสำหรับคุณ|คำตอบสำหรับคุณ)/.test(t)) return true;
  const stethoscopeLines = t.split(/\r?\n/).filter((l) => /🩺/.test(l));
  if (stethoscopeLines.length >= 3 && !/(?:ข้อ|question)\s*\d+\s*[:：]/i.test(t)) return true;
  const placeholderHits = (t.match(/^\s*🩺?\s*\([^)]{0,40}\)\s*$/gm) || []).length;
  if (placeholderHits >= 2) return true;
  return false;
}

/** เลือกเลขข้อถัดไปจาก progress ของ chat — ไม่ย้อนกลับไปข้อที่ตอบครบแล้ว */
export function resolveNextFixedQuestionNum(progress: {
  highestAsked: number;
  userAnswers: number;
  answeredUpTo: number;
  nextQ: number;
  readyForSummary: boolean;
}): number | null {
  if (progress.readyForSummary) return null;
  if (progress.answeredUpTo >= 5) return null;

  // ยังตอบข้อที่ถามค้างไว้ไม่ครบ → ถามข้อเดิมซ้ำ
  if (progress.highestAsked > 0 && progress.answeredUpTo < progress.highestAsked) {
    return progress.highestAsked;
  }

  // ตอบครบแล้ว → ไปข้อถัดไป (อิง answeredUpTo เป็นหลัก)
  if (progress.answeredUpTo > 0) {
    const next = progress.answeredUpTo + 1;
    return next <= 5 ? next : null;
  }

  if (progress.highestAsked === 0) return 1;
  if (progress.userAnswers >= progress.highestAsked) {
    const next = Math.max(progress.nextQ, progress.highestAsked + 1);
    return next <= 5 ? next : null;
  }
  return progress.highestAsked > 0 ? progress.highestAsked : 1;
}

/** ประโยคปิดท้ายมาตรฐาน — ห้ามให้ AI เสนอแนะนำยาเอง */
export const PHARMACY_CONSULT_CTA =
  'หากต้องการคำแนะนำเพิ่มเติม กรุณาติดต่อเภสัชกรผ่านเว็บ TELEBOT-PHARMACY โดยกดปุ่ม "ปรึกษาเภสัชกร" ด้านบน';

export function pharmacyConsultCta(locale: ChatLocale = 'th'): string {
  return locale === 'en' ? PHARMACY_CONSULT_CTA_EN : PHARMACY_CONSULT_CTA;
}

/** แทนประโยคชวนแนะนำยา / CTA เก่า ให้เป็นประโยคมาตรฐาน */
export function rewritePharmacyConsultCta(text: string, locale: ChatLocale = 'th'): string {
  let out = String(text || '');
  if (!out) return out;
  const cta = pharmacyConsultCta(locale);

  out = out.replace(
    /\*?หาก(?:คุณ)?ต้องการให้แนะนำยา[\s\S]{0,160}?ก่อนใช้ยาเสมอ\*?\.?/gi,
    cta,
  );
  out = out.replace(
    /\*?หาก(?:คุณ)?ต้องการ(?:ให้)?แนะนำ(?:ยา|ยาบรรเทา)[\s\S]{0,160}?(?:แพทย์|เภสัชกร)[\s\S]{0,60}?เสมอ\*?\.?/gi,
    cta,
  );
  out = out.replace(
    /สามารถแจ้งได้ครับ\s*แต่ย้ำว่าควรปรึกษาเภสัชกรหรือแพทย์ก่อนใช้ยาเสมอ\.?/gi,
    cta,
  );
  out = out.replace(
    /หากต้องการคำแนะนำเพิ่มเติม\s*กรุณาติดต่อเภสัชกรผ่านเว็บ\s*TELEBOT-PHARMACY\s*(?:ไปกดปุ่ม|โดยกดปุ่ม)\s*["“”]?ปรึกษาเภสัช(?:กร)?["“”]?\s*(?:ด้านล่างนี้|ด้านบน)?\.?/gi,
    cta,
  );
  out = out.replace(
    /หากต้องการคำแนะนำเพิ่มเติม\s*กรุณาติดต่อเภสัชกรผ่านเว็บ\s*TELEBOT-PHARMACY\s*ที่เมนู\s*["“”]?ปรึกษาอาการ["“”]?\s*ครับ\.?/gi,
    cta,
  );
  out = out.replace(
    /For more advice,\s*please contact a pharmacist on\s*TELEBOT-PHARMACY by tapping the\s*["“”]?Consult pharmacist["“”]?\s*button\s*(?:below|above)\.?/gi,
    cta,
  );
  out = out.replace(
    /If you(?:'d| would)? like(?: me)? to recommend(?: a)? medicine[\s\S]{0,180}?pharmacist[\s\S]{0,80}\.?/gi,
    cta,
  );
  // รวม CTA เก่าอังกฤษ/ไทย → มาตรฐานตาม locale
  if (locale === 'en' && /หากต้องการคำแนะนำเพิ่มเติม/.test(out)) {
    out = out.replace(PHARMACY_CONSULT_CTA, PHARMACY_CONSULT_CTA_EN);
  }
  if (locale === 'th' && /For more advice, please contact a pharmacist/.test(out)) {
    out = out.replace(PHARMACY_CONSULT_CTA_EN, PHARMACY_CONSULT_CTA);
  }

  return out;
}

/** หัวข้อ + รายการเตือนเมื่อควรพบเภสัชกร (บังคับในสรุป) */
export const SEE_PHARMACIST_SECTION_TITLE = '⚠️ ควรพบเภสัชกรหากมีอาการเหล่านี้';

export const SEE_PHARMACIST_WARNING_ITEMS = [
  'อาการแย่ลงอย่างรวดเร็ว หรือไม่ดีขึ้นภายใน 1–2 วัน',
  'มีไข้สูงต่อเนื่อง / ไข้เกิน 39°C',
  'หายใจลำบาก หอบมาก หรือแน่นหน้าอก',
  'ปวดรุนแรงมากจนทนไม่ไหว',
  'มีอาการผิดปกติที่กังวล เช่น เลือดออกผิดปกติ เวียนหัวเดินเซ หรือหมดสติ',
] as const;

function formatSeePharmacistSection(locale: ChatLocale = 'th'): string {
  if (locale === 'en') {
    return [
      SEE_PHARMACIST_SECTION_TITLE_EN,
      ...SEE_PHARMACIST_WARNING_ITEMS_EN.map((t, i) => `${i + 1}. ${t}`),
    ].join('\n');
  }
  return [
    SEE_PHARMACIST_SECTION_TITLE,
    ...SEE_PHARMACIST_WARNING_ITEMS.map((t, i) => `${i + 1}. ${t}`),
  ].join('\n');
}

/**
 * ถ้าสรุปไม่มีส่วน "ควรพบเภสัชกรหากมีอาการเหล่านี้" ให้แทรกให้ครบก่อน CTA
 * ถ้ามีแต่รวมด้วย "/" ในบรรทัดเดียว ให้แตกเป็นข้อๆ
 */
export function ensureSeePharmacistSection(text: string, locale: ChatLocale = 'th'): string {
  let out = String(text || '').trim();
  if (!out) return out;
  const titleRe = locale === 'en'
    ? /see a pharmacist if you have these symptoms/i
    : /ควรพบเภสัชกรหากมีอาการเหล่านี้/i;
  const titleLine = locale === 'en' ? SEE_PHARMACIST_SECTION_TITLE_EN : SEE_PHARMACIST_SECTION_TITLE;
  const cta = pharmacyConsultCta(locale);

  if (titleRe.test(out) || /ควรพบเภสัชกรหากมีอาการเหล่านี้|see a pharmacist if you have these symptoms/i.test(out)) {
    out = out.replace(
      /((?:⚠️\s*)?(?:ควรพบเภสัชกรหากมีอาการเหล่านี้|See a pharmacist if you have these symptoms))\s*\n([^\n]+)/i,
      (full, _title, firstLine: string) => {
        const line = String(firstLine || '').trim();
        if (!line) return formatSeePharmacistSection(locale);
        if (/^\d+[\.\)]\s+/.test(line)) return full;

        const raw = line.replace(/^[-•*]\s*/, '').trim();
        const pieces = raw
          .split(/\s*\/\s*|\s*[;；]\s*/)
          .map((s) => s.trim())
          .filter((s) => s.length >= 2);

        if (pieces.length >= 2) {
          return [
            titleLine,
            ...pieces.map((t, i) => `${i + 1}. ${t}`),
          ].join('\n');
        }
        return `${titleLine}\n1. ${pieces[0] || raw}`;
      },
    );
    return out;
  }

  const section = formatSeePharmacistSection(locale);
  const ctaIdx = out.indexOf(cta);
  const thCtaIdx = out.indexOf(PHARMACY_CONSULT_CTA);
  const enCtaIdx = out.indexOf(PHARMACY_CONSULT_CTA_EN);
  const insertAt = ctaIdx >= 0 ? ctaIdx : (thCtaIdx >= 0 ? thCtaIdx : enCtaIdx);
  if (insertAt >= 0) {
    return `${out.slice(0, insertAt).trimEnd()}\n\n${section}\n\n${out.slice(insertAt)}`;
  }
  if (/👨‍⚕️|ปรึกษาเภสัชกรของเรา|Consult (?:our )?pharmacist/i.test(out)) {
    return out.replace(
      /(👨‍⚕️[^\n]*|ปรึกษาเภสัชกรของเรา[^\n]*|Consult (?:our )?pharmacist[^\n]*)/i,
      `${section}\n\n$1`,
    );
  }
  return `${out}\n\n${section}`;
}

function stripSummaryClipboardEmoji(line: string): string {
  return String(line || '')
    .replace(/^\s*📋\s*/, '')
    .replace(/\s*📋\s*$/, '')
    .trim();
}

function isPharmacyCtaLine(line: string): boolean {
  const t = String(line || '').trim();
  return /หากต้องการคำแนะนำเพิ่มเติม\s*กรุณาติดต่อเภสัชกรผ่านเว็บ\s*TELEBOT-PHARMACY/i.test(t)
    || /For more advice,\s*please contact a pharmacist on\s*TELEBOT-PHARMACY/i.test(t);
}

function isSummaryFooterLine(line: string): boolean {
  const t = String(line || '').trim();
  if (!t || /^-{2,}\s*$/.test(t)) return true;
  if (/^\*หมายเหตุ|^หมายเหตุ\s*[:：]/i.test(t)) return true;
  if (/^ข้อควรระวัง\s*[:：]/i.test(t)) return true;
  if (/^⚠️\s*คำแนะนำเพิ่มเติม\s*[:：]/i.test(t) && !isPharmacyCtaLine(t)) return true;
  if (/^คำแนะนำเพิ่มเติม\s*[:：]/i.test(t) && !isPharmacyCtaLine(t)) return true;
  if (/^หากคุณมีข้อสงสัย|^If you have (?:any )?(?:further )?questions/i.test(t)) return true;
  if (/^ข้อมูลนี้มีวัตถุประสงค์|^this information is for general|^information provided here is for general/i.test(t)) return true;
  return false;
}

function isSeePharmacistTitleLine(line: string): boolean {
  return /ควรพบเภสัชกรหากมีอาการเหล่านี้|see a pharmacist if you have these symptoms/i.test(String(line || ''));
}

function isSelfCareTitleLine(line: string): boolean {
  const t = String(line || '').trim();
  return /^💊/.test(t) || /วิธีดูแลตนเอง|basic self-care|self-care tips/i.test(t);
}

function isCtaHeaderLine(line: string): boolean {
  return /^👨‍⚕️|ปรึกษาเภสัชกรของเรา|Consult (?:our )?pharmacist/i.test(String(line || '').trim());
}

/** แทรก CTA มาตรฐานท้ายสรุป ถ้ายังไม่มี */
export function ensurePharmacyConsultCta(text: string, locale: ChatLocale = 'th'): string {
  const out = String(text || '').trim();
  if (!out) return out;
  if (isPharmacyCtaLine(out) || /หากต้องการคำแนะนำเพิ่มเติม.*TELEBOT-PHARMACY|For more advice.*TELEBOT-PHARMACY/i.test(out)) {
    return out;
  }
  const cta = pharmacyConsultCta(locale);
  const header = locale === 'en' ? '👨‍⚕️ Consult our pharmacist' : '👨‍⚕️ ปรึกษาเภสัชกรของเรา';
  return `${out}\n\n${header}\n${cta}`;
}

/**
 * จัดลำดับสรุป: เนื้อหา → ดูแลตนเอง → ควรพบเภสัชกร → ข้อควรระวัง/หมายเหตุ → CTA
 * และตัด 📋 ออกจากหัวข้อ "จากการซักประวัติอาการ"
 */
export function normalizeSummaryLayout(text: string, locale: ChatLocale = 'th'): string {
  const raw = String(text || '').trim();
  if (!raw) return raw;

  const lines = raw
    .split(/\r?\n/)
    .map((line) => stripSummaryClipboardEmoji(line))
    .filter((line, idx, arr) => {
      if (line) return true;
      return idx > 0 && idx < arr.length - 1;
    });

  const intro: string[] = [];
  const selfCare: string[] = [];
  const seePharm: string[] = [];
  const footer: string[] = [];
  const cta: string[] = [];

  let mode: 'intro' | 'selfcare' | 'seepharm' | 'footer' | 'cta' = 'intro';

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;

    if (isPharmacyCtaLine(t)) {
      cta.push(t);
      mode = 'cta';
      continue;
    }
    if (isCtaHeaderLine(t)) continue;

    if (isSummaryFooterLine(t)) {
      if (!/^-{2,}\s*$/.test(t)) footer.push(t);
      mode = 'footer';
      continue;
    }

    if (isSeePharmacistTitleLine(t)) {
      seePharm.push(t);
      mode = 'seepharm';
      continue;
    }
    if (isSelfCareTitleLine(t)) {
      selfCare.push(t);
      mode = 'selfcare';
      continue;
    }

    if (mode === 'seepharm' && /^\d+[\.\)]\s+/.test(t)) {
      seePharm.push(t);
      continue;
    }
    if (mode === 'selfcare' && /^\d+[\.\)]\s+/.test(t)) {
      selfCare.push(t);
      continue;
    }
    if (mode === 'footer') {
      footer.push(t);
      continue;
    }
    if (mode === 'cta') {
      cta.push(t);
      continue;
    }

    intro.push(t);
  }

  const blocks: string[] = [];
  if (intro.length) blocks.push(intro.join('\n'));
  if (selfCare.length) blocks.push(selfCare.join('\n'));
  if (seePharm.length) blocks.push(seePharm.join('\n'));
  if (footer.length) blocks.push(footer.join('\n'));
  if (cta.length) blocks.push(cta.join('\n'));

  return blocks.join('\n\n').trim();
}

/** ปรับข้อความสรุปให้ครบ: CTA + ส่วนควรพบเภสัชกร + ลำดับมาตรฐาน */
export function finalizeSummaryText(text: string, locale: ChatLocale = 'th'): string {
  return normalizeSummaryLayout(
    ensureSeePharmacistSection(
      ensurePharmacyConsultCta(rewritePharmacyConsultCta(String(text || ''), locale), locale),
      locale,
    ),
    locale,
  );
}

/** สรุปสำรองเมื่อ AI หลุดกลับไปถามข้อใหม่หลังครบ 5 ข้อ */
export function buildFallbackSummary(
  symptomName: string,
  qaPairs: Array<{ q: string; a: string }> = [],
  locale: ChatLocale = 'th',
  opts: { personalDisease?: string; patientName?: string } = {},
): string {
  const symptom = symptomDisplayName(symptomName, locale);
  const disease = normalizePersonalDisease(opts.personalDisease);
  const patient = String(opts.patientName || '').trim()
    || (locale === 'en' ? 'customer' : 'ผู้ใช้');
  const patientLine = locale === 'en'
    && (patient === 'ผู้ใช้' || patient === 'User' || patient === 'ลูกค้า')
    ? 'customer'
    : patient;
  const lines = (qaPairs || [])
    .filter((p) => p?.a)
    .slice(0, 5)
    .map((p, i) => (locale === 'en'
      ? `- Q${i + 1}: ${String(p.a).trim()}`
      : `- ข้อ ${i + 1}: ${String(p.a).trim()}`));
  const detail = lines.length
    ? lines.join('\n')
    : (locale === 'en'
      ? '- The user completed all 5 screening questions.'
      : '- ผู้ใช้ตอบครบ 5 ข้อคัดกรองแล้ว');

  if (locale === 'en') {
    return [
      'Preliminary symptom summary',
      `• Patient: ${patientLine}`,
      `• Likely symptom: ${symptom}`,
      `• Chronic conditions: ${disease || 'none'}`,
      disease
        ? `• Note: Self-care tips below consider the reported chronic condition(s): ${disease}`
        : '• Note: No chronic conditions were reported in the profile.',
      '• Findings:',
      detail,
      '',
      '💊 Basic self-care tips',
      '1. Rest well, drink plenty of fluids, and monitor your symptoms',
      '2. Avoid things that make your symptoms worse based on your answers',
      disease
        ? `3. Because of chronic condition(s) (${disease}), consult a pharmacist sooner if symptoms change`
        : '3. See a pharmacist or doctor if symptoms get worse',
      '',
      formatSeePharmacistSection('en'),
      '',
      '👨‍⚕️ Consult our pharmacist',
      PHARMACY_CONSULT_CTA_EN,
    ].join('\n');
  }

  return [
    'สรุปอาการเบื้องต้นของ User',
    `• ผู้ป่วย: ${patient}`,
    `• อาการที่น่าจะเป็น: ${symptom}`,
    `• โรคประจำตัว: ${disease || 'ไม่มี'}`,
    disease
      ? `• หมายเหตุ: ข้อแนะนำด้านล่างคำนึงถึงโรคประจำตัวที่แจ้งไว้ (${disease})`
      : '• หมายเหตุ: ไม่มีโรคประจำตัวในโปรไฟล์',
    '• ลักษณะที่พบ:',
    detail,
    '',
    '💊 วิธีดูแลตนเองเบื้องต้น',
    '1. พักผ่อนให้เพียงพอ ดื่มน้ำมากๆ และสังเกตอาการต่อ',
    '2. หลีกเลี่ยงสิ่งที่ทำให้อาการแย่ลงตามที่ตอบมา',
    disease
      ? `3. เนื่องจากมีโรคประจำตัว (${disease}) หากอาการเปลี่ยนไป ควรพบเภสัชกรเร็วขึ้น`
      : '3. หากอาการรุนแรงขึ้น ให้พบเภสัชกรหรือแพทย์',
    '',
    formatSeePharmacistSection('th'),
    '',
    '👨‍⚕️ ปรึกษาเภสัชกรของเรา',
    PHARMACY_CONSULT_CTA,
  ].join('\n');
}
