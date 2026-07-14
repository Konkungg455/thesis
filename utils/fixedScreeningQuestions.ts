/**
 * คำถามคัดกรองทำหยาบแบบตายตัว (32 อาการ × 5 ข้อ)
 * ใช้แทนการให้โมเดลคิดคำถามเอง — กันหลอน placeholder
 */

export type FixedQuestion = {
  header: string;
  sub: string;
  hint: string;
};

export type FixedQuestionOpts = {
  /** เพศจากโปรไฟล์ เช่น ชาย / หญิง / M / F */
  gender?: string;
};

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
export function getMenstrualQ1ForGender(gender?: string): FixedQuestion | null {
  if (isFemaleGender(gender)) return null; // ใช้ชุด default ใน BANK
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
  'แผลไหม้': 'แผลถลอก/ไหม้',
  'แผลถลอก': 'แผลถลอก/ไหม้',
  'กลาก': 'กลาก/เกลื้อน',
  'เกลื้อน': 'กลาก/เกลื้อน',
  'หิด': 'หิด/เหา',
  'เหา': 'หิด/เหา',
};

export function normalizeSymptomKey(name: string): string {
  const raw = String(name || '').trim();
  if (!raw || raw === 'ทั่วไป') return '';
  if (BANK[raw]) return raw;
  if (ALIASES[raw]) return ALIASES[raw];
  const lower = raw.toLowerCase();
  for (const key of Object.keys(BANK)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) return key;
  }
  for (const [alias, key] of Object.entries(ALIASES)) {
    if (lower.includes(alias.toLowerCase())) return key;
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
  const key = normalizeSymptomKey(symptomName);
  const list = (key && BANK[key]) || DEFAULT_BANK;
  const q = list[n - 1] || null;
  if (!q) return null;

  // ผู้ชาย / ยังไม่ระบุเพศ → ไม่ใช้คำถามแบบถามตัวเองอย่างเดียว
  if (key === 'ปวดประจำเดือน' && n === 1) {
    const custom = getMenstrualQ1ForGender(opts.gender);
    if (custom) return { ...custom };
  }

  return q;
}

/** รูปแบบข้อความมาตรฐานที่ UI / repair ใช้ */
export function formatFixedScreeningQuestion(
  symptomName: string,
  questionNum: number,
  opts: FixedQuestionOpts = {},
): string {
  const q = getFixedQuestion(symptomName, questionNum, opts);
  if (!q) return '';
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
): any[] {
  if (!Array.isArray(parts) || !parts.length) return parts;

  const customQ1 = getMenstrualQ1ForGender(gender);
  if (!customQ1) return parts;

  const key = normalizeSymptomKey(symptomName);
  const looksMenstrual =
    key === 'ปวดประจำเดือน'
    || parts.some((p) => /ปวดประจำเดือน/.test(String(p?.header || p?.text || '')));
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
    if (p.type === 'question' && /ข้อ\s*1\s*[:：]/i.test(String(p.text || ''))) {
      return {
        ...p,
        text: `🩺 ข้อ 1: ${customQ1.header}?`,
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
  if (stethoscopeLines.length >= 3 && !/ข้อ\s*\d+\s*[:：]/i.test(t)) return true;
  const placeholderHits = (t.match(/^\s*🩺?\s*\([^)]{0,40}\)\s*$/gm) || []).length;
  if (placeholderHits >= 2) return true;
  return false;
}

/** เลือกเลขข้อถัดไปจาก progress ของ chat — ไม่ย้อนกลับไปข้อที่ถามไปแล้ว */
export function resolveNextFixedQuestionNum(progress: {
  highestAsked: number;
  userAnswers: number;
  nextQ: number;
  readyForSummary: boolean;
}): number | null {
  if (progress.readyForSummary) return null;
  if (progress.highestAsked >= 5) return null;
  if (progress.highestAsked === 0) return 1;
  // ตอบข้อล่าสุดครบแล้ว → ไปข้อถัดไป (ห้ามกลับไปข้อเล็กกว่า)
  if (progress.userAnswers >= progress.highestAsked) {
    const next = Math.max(progress.nextQ, progress.highestAsked + 1);
    return next <= 5 ? next : null;
  }
  // ยังตอบข้อล่าสุดไม่ครบ → ถามข้อเดิมซ้ำเท่านั้น (ไม่ย้อนไปข้อ 1)
  return progress.highestAsked;
}

/** ประโยคปิดท้ายมาตรฐาน — ห้ามให้ AI เสนอแนะนำยาเอง */
export const PHARMACY_CONSULT_CTA =
  'หากต้องการคำแนะนำเพิ่มเติม กรุณาติดต่อเภสัชกรผ่านเว็บ TELEBOT-PHARMACY ไปกดปุ่ม "ปรึกษาเภสัช" ด้านล่างนี้';

/** แทนประโยคชวนแนะนำยา / CTA เก่า ให้เป็นประโยคมาตรฐาน */
export function rewritePharmacyConsultCta(text: string): string {
  let out = String(text || '');
  if (!out) return out;

  out = out.replace(
    /\*?หาก(?:คุณ)?ต้องการให้แนะนำยา[\s\S]{0,160}?ก่อนใช้ยาเสมอ\*?\.?/gi,
    PHARMACY_CONSULT_CTA,
  );
  out = out.replace(
    /\*?หาก(?:คุณ)?ต้องการ(?:ให้)?แนะนำ(?:ยา|ยาบรรเทา)[\s\S]{0,160}?(?:แพทย์|เภสัชกร)[\s\S]{0,60}?เสมอ\*?\.?/gi,
    PHARMACY_CONSULT_CTA,
  );
  out = out.replace(
    /สามารถแจ้งได้ครับ\s*แต่ย้ำว่าควรปรึกษาเภสัชกรหรือแพทย์ก่อนใช้ยาเสมอ\.?/gi,
    PHARMACY_CONSULT_CTA,
  );
  out = out.replace(
    /หากต้องการคำแนะนำเพิ่มเติม\s*กรุณาติดต่อเภสัชกรผ่านเว็บ\s*TELEBOT-PHARMACY\s*ที่เมนู\s*["“”]?ปรึกษาอาการ["“”]?\s*ครับ\.?/gi,
    PHARMACY_CONSULT_CTA,
  );

  return out;
}

/** สรุปสำรองเมื่อ AI หลุดกลับไปถามข้อใหม่หลังครบ 5 ข้อ */
export function buildFallbackSummary(symptomName: string, qaPairs: Array<{ q: string; a: string }> = []): string {
  const symptom = normalizeSymptomKey(symptomName) || symptomName || 'อาการที่เลือก';
  const lines = (qaPairs || [])
    .filter((p) => p?.a)
    .slice(0, 5)
    .map((p, i) => `- ข้อ ${i + 1}: ${String(p.a).trim()}`);
  const detail = lines.length
    ? lines.join('\n')
    : '- ผู้ใช้ตอบครบ 5 ข้อคัดกรองแล้ว';

  return [
    '📋 สรุปอาการเบื้องต้นของ User',
    `• ผู้ป่วย: User`,
    `• อาการที่น่าจะเป็น: ${symptom}`,
    '• ลักษณะที่พบ:',
    detail,
    '',
    '💊 วิธีดูแลตนเองเบื้องต้น',
    '1. พักผ่อนให้เพียงพอ ดื่มน้ำมากๆ และสังเกตอาการต่อ',
    '2. หลีกเลี่ยงสิ่งที่ทำให้อาการแย่ลงตามที่ตอบมา',
    '3. หากอาการรุนแรงขึ้น ให้พบเภสัชกรหรือแพทย์',
    '',
    '⚠️ ควรพบเภสัชกรหากมีอาการเหล่านี้',
    '- อาการแย่ลงเร็ว / มีไข้สูง / หายใจลำบาก / ปวดรุนแรงมาก',
    '',
    '👨‍⚕️ ปรึกษาเภสัชกรของเรา',
    PHARMACY_CONSULT_CTA,
  ].join('\n');
}
