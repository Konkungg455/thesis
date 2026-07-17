/**
 * กฎสำหรับ AI วินิจฉัยอาการ — ใช้ร่วมกันทั้ง chat_bot.vue และ chat-history.vue
 * ครอบคลุม 32 อาการเจ็บป่วยเล็กน้อย (สิทธิบัตรทอง สปสช.)
 *
 * หน้าที่ของ composable นี้คือเป็น "ด่านหน้า" ก่อนยิงเข้า n8n
 *  - ถ้าเป็น Red Flag → ไม่เรียก AI ตอบเตือนพร้อมส่งต่อเภสัช
 *  - ถ้าเป็นคำถามนอกเรื่อง → ไม่เรียก AI ตอบปฏิเสธสุภาพครั้งเดียว
 *  - ถ้าเป็นคำขอบคุณ → ตอบรับ + ลิงก์รีวิว
 *  - กรณีปกติ → ส่งให้ n8n วินิจฉัย (n8n จะถามทีละข้อ 5 section ข้อละ 1 คำถามย่อย)
 */
import { repairScreeningFormat } from '../../utils/repairScreeningFormat';
import { isAdultContentInput, REPLY_ADULT } from '../../utils/chatAdultContentFilter';
import { isGibberishInput } from '../../utils/gibberishFilter.js';
import {
  formatFixedScreeningQuestion,
  isHallucinatedScreeningText,
  normalizeSymptomKey,
  resolveNextFixedQuestionNum,
  buildFallbackSummary,
  rewritePharmacyConsultCta,
  ensureSeePharmacistSection,
  ensurePharmacyConsultCta,
  normalizeSummaryLayout,
  finalizeSummaryText,
  resolveUserGender,
  adaptScreeningPartsForGender,
  resolveChatLocale,
  symptomDisplayName,
  pharmacyConsultCta,
  normalizePersonalDisease,
} from '../../utils/fixedScreeningQuestions';

export function useAiChatRules() {
  // 32 อาการเจ็บป่วยเล็กน้อย (สิทธิบัตรทอง)
  const SYMPTOMS_32 = [
    'ปวดศีรษะ', 'เวียนศีรษะ', 'ปวดข้อ', 'ปวดกล้ามเนื้อ', 'ไข้',
    'ไอ', 'เจ็บคอ', 'ปวดท้อง', 'ท้องเสีย', 'ท้องผูก',
    'ริดสีดวงทวาร', 'คลื่นไส้/อาเจียน', 'กรดไหลย้อน', 'ปวดประจำเดือน', 'ตกขาวผิดปกติ',
    'ผื่นคัน', 'บาดแผลทั่วไป', 'แมลงสัตว์กัดต่อย', 'แผลถลอก/ไหม้', 'ผื่นแพ้',
    'กลาก/เกลื้อน', 'หิด/เหา', 'ฝีหนอง', 'แผลในปาก', 'ปวดฟัน',
    'ตาแดง', 'ตากุ้งยิง', 'หูอักเสบ', 'คัดจมูก/น้ำมูกไหล', 'ภูมิแพ้',
    'นอนไม่หลับ', 'วิตกกังวล'
  ];

  // 🚨 Red Flag — ส่งต่อเภสัชทันที (เฉพาะอาการรุนแรงจริง)
  const RED_FLAGS = [
    'เลือดไหลไม่หยุด', 'อาเจียนเป็นเลือด', 'ถ่ายเป็นเลือดแดง', 'ถ่ายเป็นเลือดสด', 'ไอเป็นเลือด',
    'หายใจไม่ออก', 'หายใจลำบาก', 'หอบเหนื่อย', 'แน่นหน้าอก', 'เจ็บหน้าอก',
    'หน้ามืดหมดสติ', 'หมดสติ', 'ชัก', 'แขนขาอ่อนแรง', 'พูดไม่ชัด', 'ปากเบี้ยว',
    'ปวดศีรษะรุนแรง', 'อาเจียนพุ่ง', 'ตามัวเฉียบพลัน',
    'ผื่นทั่วตัว', 'หน้าบวม', 'ปากบวม', 'แพ้รุนแรง',
    'ไข้สูงมาก', 'ไข้ 40', 'ไข้ 41',
    'ปวดท้องรุนแรง', 'อุบัติเหตุ', 'งูกัด', 'สุนัขกัด'
  ];

  const BLEEDING_MENTION_RE = /เลือดออก|เลือดไหล|อาเจียนเป็นเลือด|ถ่ายเป็นเลือด|ไอเป็นเลือด|มีเลือด|ปนเลือด|เลือดปน/i;
  const MILD_BLEEDING_RE = /นิดหน่อย|เล็กน้อย|นิดเดียว|ไม่มาก|แค่นิด|นิดๆ|เลือดน้อย|รอยเลือด|เป็นจุด|ปนเลือดนิด|เลือดออกนิด/i;
  const SEVERE_BLEEDING_RE = /มาก|เยอะ|ไม่หยุด|หยุดไม่ได้|ท่วม|พุ่ง|รุนแรง|ไหลไม่หยุด|เป็นลิตร|เต็ม|แก่น|สดเยอะ/i;
  const EMERGENCY_PHRASE_RE = /เลือดไหลไม่หยุด|เลือด(?:ออก|ไหล)?.{0,8}ไม่หยุด|ไม่หยุด.{0,8}เลือด|หายใจไม่ออก|หายใจลำบาก|หอบ(?:เหนื่อย|มาก)|แน่นหน้าอก|เจ็บหน้าอก|หมดสติ|หน้ามืด|ชัก|แขนขาอ่อนแรง|พูดไม่ชัด|ปากเบี้ยว|อาเจียนพุ่ง|ตามัวเฉียบพลัน|ผื่นทั่วตัว|แพ้รุนแรง|ไข้\s*4[0-9]|งูกัด|สุนัขกัด/i;

  // คำถามนอกเรื่อง — ไม่เกี่ยวสุขภาพ → ปฏิเสธสุภาพ ไม่เรียก AI
  // ⚠️ ห้ามใช้คำสั้นที่ปะทะอาการจริง เช่น "หนัง" ใน "ผื่นผิวหนัง"
  const IRRELEVANT = [
    // อาหาร / กิน
    'กินข้าวหรือยัง', 'กินข้าว', 'ทานข้าว', 'กินอะไร', 'หิวข้าว', 'หิวแล้ว', 'หิวมาก',
    'อาหารอร่อย', 'ร้านอาหาร', 'แนะนำร้าน', 'เมนูแนะนำ', 'สั่งอาหาร', 'กินอะไรดี',
    'ของหวาน', 'ชานม', 'กาแฟไหม', 'ไปกินข้าว', 'เลี้ยงข้าว', 'หิวน้ำ', 'ขอกิน',
    'ส้มตำ', 'ข้าวมันไก่', 'หมูกระทะ', 'บุฟเฟ่ต์', 'เดลิเวอรี่', 'โปรโมชั่นอาหาร',
    // ท่องเที่ยว / นัดแชท
    'ไปเที่ยวไหน', 'ที่เที่ยว', 'แนะนำที่เที่ยว', 'ทำอะไรอยู่', 'เป็นไงบ้าง', 'ช่วงนี้เป็นไง',
    'ไปไหนดี', 'เที่ยวทะเล', 'เที่ยวภูเขา', 'คาเฟ่สวย', 'จุดเช็คอิน', 'ถ่ายรูปสวย',
    'ว่างไหม', 'ว่างมั้ย', 'คุยเล่น', 'มาคุยกัน', 'เบื่อจัง', 'เหงามาก',
    // ความบันเทิง
    'ขอเพลง', 'ฟังเพลง', 'เพลงอะไรดี', 'แนะนำเพลง', 'mv เพลง',
    'ดูหนัง', 'หนังเรื่อง', 'ซีรีย์', 'ซีรี่ย์', 'ดูละคร', 'นักแสดง', 'ดูดารา',
    'เล่นเกม', 'บอกเกม', 'เกมออนไลน์', 'rov', 'valorant', 'ฟีฟาย', 'mc กรีฟ',
    'ยูทูบ', 'ติ๊กต๊อก', 'tiktok', 'ไลฟ์สด', 'คลิปตลก', 'มีมตลก',
    // การเงิน / การเมือง / ดวง
    'หวย', 'เลขเด็ด', 'ราคาทอง', 'หุ้น', 'คริปโต', 'bitcoin', 'บิทคอยน์',
    'การเมือง', 'เลือกตั้ง', 'พรรคการเมือง', 'นายก',
    'พยากรณ์อากาศ', 'ดูดวง', 'ไพ่ยิปซี', 'ฮวงจุ้ย', 'เลขธง',
    // ความรัก / จีบ
    'จีบได้ไหม', 'รักฉันไหม', 'มีแฟนยัง', 'มีแฟนหรือยัง', 'คนคุย', 'ทักจีบ',
    'อกหัก', 'ขอคำคมหวาน', 'แคปชั่นรัก', 'จีบสาว', 'จีบหนุ่ม',
    // เรียน / งานนอกสุขภาพ
    'การบ้าน', 'อาจารย์', 'สอบวิชา', 'เรียนพิเศษ', 'ติวสอบ', 'การบ้านอาจารย์',
    'วิชาคณิต', 'วิชาไทย', 'วิชาอังกฤษ', 'ส่งการบ้าน', 'งานกลุ่ม', 'พรีเซนต์งาน',
    'เขียนโค้ด', 'เขียนโปรแกรม', 'ทำเว็บ', 'debug code', 'python ช่วย',
    'แต่งกลอน', 'แต่งเพลง', 'แต่งนิยาย', 'เขียนเรียงความ',
    // แกล้ง / มุก / คำถามไร้สาระ ที่ไม่ใช่ 32 อาการ
    'ปวดขี้', 'ปวดตด', 'ปวดง่วง', 'ปวดเบื่อ', 'ปวดรัก', 'ปวดเงิน', 'ปวดสอบ',
    'ปวดการบ้าน', 'ปวดเกม', 'ปวดมือถือ', 'ปวดwifi', 'ปวดเน็ต', 'ปวดใจจัง',
    'อยากขี้', 'อยากอึ', 'ขี้ไม่ออกมุก', 'บ้าไปแล้วหรอ', 'โกหกฉันสิ',
    'เล่าเรื่องผี', 'มีผีไหม', 'ผีหลอก', 'บ้านผีสิง',
    'ใครสวยสุด', 'ใครหล่อสุด', 'จัดอันดับดารา', 'ซุบดีเจ',
    'แปลภาษาให้หน่อย', 'สอนภาษาอังกฤษ', 'สอบ ielts',
    'สูตรคณิต', 'แก้สมการ', 'chatgpt คือ', 'คุณเป็น ai ไหม',
    'เปิดเพลงให้ฟัง', 'เล่านิทาน', 'เล่าเรื่องตลก', 'มุกตลก',
    'ทายใจ', 'ทายเลข', 'เป่ายิ้งฉุบ', 'เล่นทาย',
    'สั่งซื้อของ', 'ช้อปปิ้ง', 'lazada', 'shopee', 'ขายของ',
    'hack เฟส', 'แฮกเฟส', 'รหัสผ่านเฟส', 'รหัส wifi',
    'วิธีรวยเร็ว', 'ลงทุน forex', 'ทีเด็ดบอล', 'แทงบอล',
    'how to make bomb', 'วิธีโกงข้อสอบ',
  ];

  /** นอกประเด็นแบบตายตัว — แม้มีคำว่า "ปวด/อาการ" ก็ไม่ส่งเข้า AI */
  const ALWAYS_IRRELEVANT = [
    'ปวดขี้', 'ปวดตด', 'ปวดง่วง', 'ปวดเบื่อ', 'ปวดรัก', 'ปวดเงิน', 'ปวดสอบ',
    'ปวดการบ้าน', 'ปวดเกม', 'ปวดมือถือ', 'ปวดwifi', 'ปวดเน็ต',
    'อยากขี้', 'อยากอึ', 'เล่าเรื่องผี', 'มุกตลก', 'ทายใจ', 'เป่ายิ้งฉุบ',
    'จีบได้ไหม', 'รักฉันไหม', 'มีแฟนหรือยัง', 'ทีเด็ดบอล', 'แทงบอล',
    'หวย', 'เลขเด็ด', 'ดูดวง', 'แต่งกลอน', 'เขียนโค้ด',
  ];

  const THANKS = ['ขอบคุณ', 'thanks', 'thank you', 'ขอบใจ', 'ขอบพระคุณ'];

  const containsAny = (text, list) => {
    const t = (text || '').toLowerCase();
    return list.some(k => t.includes(k.toLowerCase()));
  };

  /** คำหยาบ / ไม่สุภาพ — กันก่อนส่งเข้า AI */
  const PROFANITY = [
    'ควย', 'เหี้ย', 'เหี้ยไรวะ', 'สัส', 'สัตว์นรก', 'ไอ้สัตว์', 'ไอ้เวร', 'ไอ้บ้า',
    'ระยำ', 'ชาติหมา', 'หน้าหี', 'หี', 'จิ๋ม', 'เย็ด', 'เอากัน', 'เงี่ยน',
    'ชิบหาย', 'เชี่ย', 'เชี้ย', 'แม่ง', 'มึงโง่', 'กูจะ', 'ไอ้เวรเอ๊ย',
    'อีดอก', 'ไอ้ดอก', 'พ่อมึง', 'แม่มึง', 'เย็ดแม่', 'เย็ดพ่อ',
    'fuck', 'fucking', 'shit', 'bitch', 'asshole', 'dick', 'pussy', 'motherfucker',
  ];

  const PROFANITY_RE = /(ควย|เหี้ย|สัส+|ระยำ|ชาติ\s*หมา|หน้าหี|จิ๋ม|เย็ด|ชิบหาย|เชี่ย|เชี้ย|แม่ง|อีห่า|ไอ้สัตว์|ไอ้เวร|พ่อมึง|แม่มึง|\bf+u+c+k|\bshit\b|\bbitch\b)/i;

  const isProfanityInput = (text) => {
    const t = String(text || '').trim();
    if (!t) return false;
    if (containsAny(t, PROFANITY)) return true;
    return PROFANITY_RE.test(t);
  };

  /** มุก/คำตอบแกล้ง — เช่n ปวดขี้, ปวดเงิน (ไม่ใช่คำตอบซักประวัติจริง) */
  const JOKE_ANSWER_RE = /ปวด\s*(ขี้|ตด|อึ|ง่วง|เบื่อ|รัก|เงิน|สอบ|การบ้าน|เกม|มือถือ|wifi|เน็ต|ใจ)/i;

  const isJokeAnswerInput = (text) => {
    const t = String(text || '').trim();
    if (!t) return false;
    if (containsAny(t, ALWAYS_IRRELEVANT)) return true;
    if (JOKE_ANSWER_RE.test(t)) return true;
    if (/^(กินข้าว|ทานข้าว|ร้านอาหาร|แนะนำร้าน|ขอเพลง|ดูหนัง|เล่นเกม|หวย|ดูดวง|จีบได้ไหม|รักฉันไหม)/i.test(t)) return true;
    return false;
  };

  /**
   * จำแนกประเภทข้อความ
   * - ถ้าข้อความมีคำว่า "อาการ" หรือ "ปวด" หรือชื่ออาการใน 32 list → ถือเป็น normal เลย
   *   (กันเคส "ผื่นผิวหนัง" บังเอิญมีตัวอักษร "หนัง" จาก IRRELEVANT)
   * @returns {'redflag' | 'profanity' | 'irrelevant' | 'off_topic_symptom' | 'thanks' | 'normal'}
   */
  const HEALTH_HINTS = [
    'อาการ', 'ปวด', 'เจ็บ', 'ไอ', 'ไข้', 'คลื่นไส้', 'อาเจียน', 'ผื่น', 'ผิวหนัง',
    'คัน', 'แพ้', 'ท้อง', 'ถ่าย', 'ปัสสาวะ', 'ตา', 'หู', 'จมูก', 'คอ', 'ฟัน',
    'ประจำเดือน', 'นอนไม่หลับ', 'เครียด', 'วิตก', 'แผล', 'หนอง', 'กัด', 'ลวก',
    'มึน', 'เวียน', 'ชา', 'เหน็บ', 'เมา', 'ห้องหมุน', 'หมุน', 'ทรงตัว', 'ตื้อ', 'ตุบ', 'แปลบ',
    'รู้สึก', 'เหมือน', 'สิ่งแวดล้อม', 'เริ่ม', 'เป็นมา', 'มีอาการ', 'ไม่มี', 'ไม่ทราบ',
    'เล็กน้อย', 'ปานกลาง', 'รุนแรง', 'วันนี้', 'เมื่อวาน', 'เลือด', 'เลือดออก', 'บาด', 'มีด', 'ตำ', 'ฟกช้ำ', 'ฉีก',
    'นิดหน่อย', 'เฉยๆ', 'มือ', 'ขา', 'แขน', 'นิ้ว', 'แสบ',
    'ไม่แน่ใจ', 'จำไม่ได้', 'ไม่ค่อยรู้', 'ไม่รู้สาเหตุ', 'ไม่ว่า',
    'pain', 'ache', 'fever', 'cough', 'nausea', 'vomit', 'rash', 'itch', 'allergy',
    'diarrhea', 'constipation', 'wound', 'tooth', 'headache', 'dizzy', 'burn', 'sting',
    'sore', 'swelling', 'sensitivity', 'throbbing', 'symptom', 'injury',
  ];

  const SCREENING_ANSWER_RE = /ห้องหมุน|หมุน|มึนหัว|ทรงตัว|ตุบ|ตื้อ|แปลบ|คลื่นไส้|ท้องเสีย|ไอ|เจ็บคอ|ผื่น|คัน|แดง|บวม|ชา|เหน็บ|เวียน|รู้สึก|เหมือน|สิ่งแวดล้อม|เล็กน้อย|ปานกลาง|รุนแรง|วันนี้|เมื่อวาน|เลือด|เลือดออก|บาด|แผล|มีด|ตำ|ฟกช้ำ|ฉีก|นิดหน่อย|ดีขึ้น|แย่ลง|ไม่ทราบ|ไม่รู้|เคย|ไม่เคย|\d|ชั่วโมง|นาที|วัน|สัปดาห์|เดือน|throbbing|sensitivity|mild|moderate|severe|yesterday|today|week|hour|day|none|fever|nausea|rest|painkiller|better|worse|unknown|itchy|swollen|dizzy|cough|headache|spinning|vertigo|lightheaded/i;

  /** เลือดออกเล็กน้อยระหว่างซักประวัติ → ไม่ใช่ฉุกเฉิน */
  const isRedFlagInput = (text) => {
    const t = String(text || '').trim();
    if (!t) return false;

    // ประโยคฉุกเฉินชัดเจน — จับก่อนกฎอื่นทั้งหมด
    if (EMERGENCY_PHRASE_RE.test(t)) return true;
    if (containsAny(t, RED_FLAGS)) return true;

    if (BLEEDING_MENTION_RE.test(t)) {
      if (MILD_BLEEDING_RE.test(t) && !SEVERE_BLEEDING_RE.test(t)) return false;
      if (SEVERE_BLEEDING_RE.test(t)) return true;
      if (containsAny(t, [
        'เลือดไหลไม่หยุด', 'อาเจียนเป็นเลือด', 'ถ่ายเป็นเลือดแดง', 'ถ่ายเป็นเลือดสด', 'ไอเป็นเลือด'
      ])) return true;
      return false;
    }

    return false;
  };

  /** ตรวจคำตอบนอกประเด็น — โดยเฉพาะระหว่างซักประวัติ */
  const normalizeSymptom = (name) => String(name || '').replace(/\s+/g, '').toLowerCase();

  const findMentionedSymptoms = (text) => {
    const t = String(text || '');
    const lower = t.toLowerCase();
    const hits = new Set();
    const sorted = [...SYMPTOMS_32].sort((a, b) => b.length - a.length);
    for (const s of sorted) {
      if (s.length < 3) continue;
      if (t.includes(s) || normalizeSymptom(t).includes(normalizeSymptom(s))) hits.add(s);
      const en = symptomDisplayName(s, 'en');
      if (en && en.length >= 3 && lower.includes(String(en).toLowerCase())) hits.add(s);
    }
    const key = normalizeSymptomKey(t);
    if (key && SYMPTOMS_32.includes(key)) hits.add(key);
    return [...hits];
  };

  const getLastScreeningAssistant = (messages) => {
    let last = null;
    for (const msg of messages || []) {
      if (msg.role !== 'assistant') continue;
      if (isScreeningQuestion(msg.text) || extractQuestionNumber(msg) > 0) last = msg;
    }
    return last;
  };

  /** ตอบชี้ไปอาการอื่นนอกหัวข้อที่เลือก — แต่ไม่บล็อกคำตอบอาการร่วม/ตัวเลือกในข้อ */
  const matchesQuestionOption = (text, messages) => {
    const t = String(text || '').trim().toLowerCase();
    if (!t) return false;
    const opts = getLastQuestionOptions(messages);
    if (!opts.length) return false;

    const optionTokens = ['เล็กน้อย', 'ปานกลาง', 'รุนแรง', 'วันนี้', 'เมื่อวาน', 'ไม่ทราบ', 'ไม่รู้', 'mild', 'moderate', 'severe', 'today', 'yesterday', 'unknown', 'unsure'];
    for (const token of optionTokens) {
      const tok = token.toLowerCase();
      if (t.includes(tok) && opts.some((o) => String(o || '').toLowerCase().includes(tok))) return true;
    }

    return opts.some((o) => {
      const opt = String(o || '').trim().toLowerCase();
      if (!opt) return false;
      if (t === opt || t.includes(opt) || opt.includes(t)) return true;
      const optHead = opt.split(/[\s,]+/)[0];
      if (optHead.length >= 3 && t.includes(optHead)) return true;
      return false;
    });
  };

  const isAccompanyingSymptomQuestion = (messages) => {
    const lastAssistant = getLastScreeningAssistant(messages);
    if (!lastAssistant) return false;
    const t = String(lastAssistant.text || '');
    if (/อาการร่วม|มีอาการอื่น|ร่วมด้วย|accompanying symptoms|any other symptoms/i.test(t)) return true;
    if (lastAssistant.parts?.length) {
      const q = lastAssistant.parts.find((p) => p.type === 'question_block' || p.type === 'question');
      const header = String(q?.header || q?.text || '');
      if (/อาการร่วม|มีอาการอื่น|ร่วมด้วย|accompanying symptoms|any other symptoms/i.test(header)) return true;
    }
    return false;
  };

  const isWrongSymptomTopic = (text, symptomName, options = {}) => {
    const locked = String(symptomName || '').trim();
    const lockedKey = normalizeSymptomKey(locked) || locked;
    if (!lockedKey || lockedKey === 'ทั่วไป') return false;
    const t = String(text || '').trim();
    if (!t) return false;
    // ฉุกเฉินไม่ใช่การเปลี่ยนหัวข้อ
    if (isRedFlagInput(t)) return false;

    // ตอบตรงตัวเลือกในคำถามล่าสุด (เช่น มีไข้ ในข้ออาการร่วม) → ไม่ใช่เปลี่ยนหัวข้อ
    if (matchesQuestionOption(t, options.messages)) return false;

    // ข้อถามอาการร่วม → อนุญาตพูดชื่ออาการอื่นสั้นๆ ยกเว้นขอเปลี่ยนหัวข้อชัดเจน
    if (isAccompanyingSymptomQuestion(options.messages)) {
      if (!/(เปลี่ยนอาการ|อยากเปลี่ยน|ขอเปลี่ยน|ไม่ใช่เรื่องนี้|ขอถามเรื่องอื่น|เลิกคัดกรอง)/i.test(t)) {
        return false;
      }
    }

    const mentioned = findMentionedSymptoms(t);
    if (!mentioned.length) return false;
    const lockedN = normalizeSymptom(lockedKey);
    const other = mentioned.filter((s) => {
      const sn = normalizeSymptom(s);
      return sn !== lockedN && !lockedN.includes(sn) && !sn.includes(lockedN);
    });
    const mentionsLocked = mentioned.some((s) => {
      const sn = normalizeSymptom(s);
      return sn === lockedN || lockedN.includes(sn) || sn.includes(lockedN);
    });
    if (!other.length) return false;
    if (mentionsLocked) return false;

    // ประโยคสั้นที่เป็นแค่ชื่อ/อาการร่วม (เช่น "มีไข้", "เหงือกบวม") ระหว่างซัก → ไม่บล็อก
    const inScreening = options.inScreening ?? isInScreening(options.messages);
    if (inScreening && t.length <= 40 && !/(เปลี่ยน|ไม่ใช่|เลิก|ขอถามเรื่อง|อยากถามเรื่อง)/i.test(t)) {
      return false;
    }

    return true;
  };

  /** ดึงตัวเลือกจากคำถามคัดกรองล่าสุด (ไม่ใช่ข้อความเตือน) */
  const getLastQuestionOptions = (messages) => {
    const lastAssistant = getLastScreeningAssistant(messages);
    if (!lastAssistant) return [];
    if (lastAssistant.parts?.length) {
      const q = lastAssistant.parts.find((p) => p.type === 'question_block' || p.type === 'question');
      if (q?.options?.length) return q.options.map((o) => String(o).trim()).filter(Boolean);
      if (q?.hint) return splitOptions(q.hint);
      if (Array.isArray(q?.subQuestions) && q.subQuestions.length) {
        const hints = q.subQuestions
          .map((sq) => String(sq?.hint || '').trim())
          .filter(Boolean)
          .flatMap((h) => splitOptions(h));
        if (hints.length) return hints;
      }
    }
    const m = String(lastAssistant.text || '').match(/\(\s*(?:เช่น|e\.g\.|eg\.?)\s*([^)]+)\)/i);
    return m ? splitOptions(m[1]) : [];
  };

  /**
   * คำตอบตรงประเด็นพอสำหรับซักหยาบไหม
   * - นอกเรื่อง / อาการคนละหัวข้อ → false
   * - ระหว่างคัดกรอง ถ้าไม่เกี่ยวกับสุขภาพและไม่ตรงตัวเลือก → false
   */
  const isAnswerOnTopic = (text, options = {}) => {
    const t = String(text || '').trim();
    if (!t) return false;
    // อาการฉุกเฉินไม่ถือว่า "นอกหัวข้อ" — ให้ classify จัดการเป็น redflag
    if (isRedFlagInput(t)) return true;
    if (isOffTopicInput(text, options)) return false;

    // ตรงตัวเลือกในคำถาม → ผ่านก่อน (กัน false positive เรื่องอาการอื่น)
    if (matchesQuestionOption(t, options.messages)) return true;

    // ตอบว่าไม่ทราบ/ไม่รู้สาเหตุ → ผ่าน (เช่n ไม่ทราบ, ไม่ว่าเกิดจากอะไร)
    if (isUncertaintyAnswer(t)) return true;

    const symptomName = String(options.symptomName || '').trim();
    if (isWrongSymptomTopic(t, symptomName, options)) return false;

    const inScreening = options.inScreening ?? isInScreening(options.messages);
    if (!inScreening) return true;

    if (containsAny(t, HEALTH_HINTS) || containsAny(t, SYMPTOMS_32) || SCREENING_ANSWER_RE.test(t)) {
      return true;
    }

    return false;
  };

  const isOffTopicInput = (text, options = {}) => {
    const t = String(text || '').trim();
    if (!t) return false;

    // มุก / คำถามกวนๆ ที่แกล้งใส่คำว่า "ปวด..." → บล็อกเสมอ
    if (containsAny(t, ALWAYS_IRRELEVANT)) return true;
    if (/ปวด\s*(ขี้|ตด|อึ|ง่วง|เบื่อ|รัก|เงิน|สอบ|การบ้าน|เกม|มือถือ|wifi|เน็ต|ใจ)/i.test(t)) return true;

    if (containsAny(t, SYMPTOMS_32)) return false;
    if (SCREENING_ANSWER_RE.test(t) && containsAny(t, HEALTH_HINTS)) return false;
    if (SCREENING_ANSWER_RE.test(t) && t.length <= 80) return false;

    if (containsAny(t, IRRELEVANT)) {
      // ถ้าเจอคำนอกเรื่องชัดเจน → บล็อก (ไม่ให้คำว่า "ปวด" ในมุกหลุดไป AI)
      if (/^(กินข้าว|ทานข้าว|ร้านอาหาร|แนะนำร้าน|ขอเพลง|ดูหนัง|เล่นเกม)/i.test(t)) return true;
      if (containsAny(t, ALWAYS_IRRELEVANT)) return true;
      // ประโยคสั้นที่ทั้งประโยคเป็นหัวข้อนอกเรื่อง
      if (t.length <= 40 && !containsAny(t, SYMPTOMS_32)) return true;
      if (containsAny(t, HEALTH_HINTS) && !/^(กินข้าว|ทานข้าว|ร้านอาหาร|แนะนำร้าน)/i.test(t)) {
        // มีทั้งสุขภาพ + นอกเรื่อง → ถ้ามีคำนอกเรื่องยาวชัด ให้บล็อก
        const hit = IRRELEVANT.find((k) => t.toLowerCase().includes(k.toLowerCase()));
        if (hit && hit.length >= 4) return true;
        return false;
      }
      return true;
    }

    if (/^(ช่วย|บอก|แนะนำ).*(ร้าน|อาหาร|เที่ยว|เพลง|เกม|หนัง|อาจารย์|การบ้าน|มุก|นิทาน)/i.test(t)) return true;
    if (/(อาจารย์|การบ้าน|สอบวิชา|วิชาคณิต|วิชาไทย|เขียนโค้ด|แต่งกลอน)/i.test(t) && !containsAny(t, HEALTH_HINTS)) return true;
    if (/(เล่าเรื่องผี|ทายใจ|เป่ายิ้งฉุบ|มุกตลก|ขอคำคม|แคปชั่น)/i.test(t)) return true;

    const inScreening = options.inScreening ?? isInScreening(options.messages);
    if (!inScreening) return false;

    if (containsAny(t, HEALTH_HINTS)) return false;

    const CHIT_CHAT_RE = /^(ครับ|ค่ะ|โอเค|ฮะ|อืม|ได้|ดี|สวัสดี|หิว|อยากกิน|ขอบคุณ|555|ฮา|จ้า|ไม่รู้|ไม่ทราบ)/i;
    if (CHIT_CHAT_RE.test(t) && t.length < 60) return true;

    return false;
  };

  /**
   * จำแนกประเภทข้อความ — red flag, คำหยาด, พิมพ์มั่ว (เฉพาะช่วงซักประวัติ)
   * @returns {'redflag' | 'adult' | 'profanity' | 'gibberish' | 'thanks' | 'normal'}
   */
  const classifyInput = (text, options = {}) => {
    if (isRedFlagInput(text)) return 'redflag';
    if (isAdultContentInput(text)) return 'adult';
    if (isProfanityInput(text)) return 'profanity';
    if (isGibberishInput(text) && isActiveFixedScreening(options.messages)) return 'gibberish';
    if (containsAny(text, THANKS)) return 'thanks';
    return 'normal';
  };

  const stripOffTopicLeak = (aiOutput) => aiOutput;

  // ข้อความสำเร็จรูป
  const REPLY_REDFLAG =
    '🚨 อาการที่คุณแจ้งมาอาจมีความเสี่ยงสูง เพื่อความปลอดภัยกรุณากด "ติดต่อเภสัชกรของเราทันที" ' +
    'หรือถ้ารู้สึกแย่ลงให้ไปโรงพยาบาลที่ใกล้ที่สุดค่ะ';
  const REPLY_REDFLAG_EN =
    '🚨 The symptoms you reported may be high-risk. For your safety, please tap "Contact our pharmacist now" ' +
    'or go to the nearest hospital if you feel worse.';

  const REPLY_IRRELEVANT =
    'ขออภัยค่ะ telebot ตอบได้เฉพาะเรื่องสุขภาพและอาการเจ็บป่วยเล็กน้อย 32 อาการบัตรทองเท่านั้น ' +
    'กรุณาตอบคำถามเกี่ยวกับอาการที่กำลังซักอยู่ หรือบอกอาการของคุณใหม่ค่ะ';
  const REPLY_IRRELEVANT_EN =
    'Sorry, telebot can only help with health topics and the 32 minor illness symptoms. ' +
    'Please answer about the symptom currently being screened, or describe your symptom again.';

  const REPLY_PROFANITY =
    'ขออภัยค่ะ กรุณาใช้ภาษาสุภาพในการสนทนากับ telebot นะคะ ' +
    'พิมพ์อธิบายอาการด้วยถ้อยคำสุภาพ แล้ว telebot จะช่วยคัดกรองให้ค่ะ';
  const REPLY_PROFANITY_EN =
    'Sorry, please use polite language with telebot. ' +
    'Describe your symptoms politely and telebot will continue the screening.';

  const REPLY_ADULT_TH = REPLY_ADULT.th;
  const REPLY_ADULT_EN = REPLY_ADULT.en;

  const buildOffSymptomReply = (symptomName, locale = 'th') => {
    const loc = resolveChatLocale(locale);
    const name = symptomDisplayName(symptomName, loc);
    if (loc === 'en') {
      return `telebot is currently screening for "${name}". Please answer only about this symptom. ` +
        'If you want to change the symptom, please select a new category from the homepage.';
    }
    const fallback = String(symptomName || '').trim() || 'ที่เลือกไว้';
    return `ตอนนี้ telebot กำลังคัดกรองอาการ "${fallback}" อยู่ค่ะ กรุณาตอบเฉพาะเรื่องอาการนี้ ` +
      'ถ้าต้องการเปลี่ยนอาการ กรุณาเลือกหมวดอาการใหม่จากหน้าแรกค่ะ';
  };

  const REPLY_THANKS =
    'ด้วยความยินดีค่ะ 😊 หากการบริการของเราเป็นประโยชน์กับคุณ ' +
    'ฝากรีวิวให้กำลังใจทีมงานเราหน่อยนะคะ';
  const REPLY_THANKS_EN =
    'You are welcome 😊 If our service was helpful, please leave a review to support our team.';

  const getReply = (kind, locale = 'th') => {
    const loc = resolveChatLocale(locale);
    const map = {
      redflag: loc === 'en' ? REPLY_REDFLAG_EN : REPLY_REDFLAG,
      adult: loc === 'en' ? REPLY_ADULT_EN : REPLY_ADULT_TH,
      irrelevant: loc === 'en' ? REPLY_IRRELEVANT_EN : REPLY_IRRELEVANT,
      profanity: loc === 'en' ? REPLY_PROFANITY_EN : REPLY_PROFANITY,
      thanks: loc === 'en' ? REPLY_THANKS_EN : REPLY_THANKS,
    };
    return map[kind] || '';
  };

  /**
   * แปลงข้อความ AI เป็น array ของ part เพื่อ render ใน UI
   *
   * รองรับรูปแบบคำถามที่ AI อาจตอบมา:
   *   1) ข้อ N: <คำถาม>? (เช่น A, B, C)
   *   2) ข้อ N: <คำถาม>? เช่น A, B, C        ← ไม่มีวงเล็บ
   *   3) ข้อ N: <คำถาม>? (A, B, C)            ← ไม่มี "เช่น"
   *   4) ข้อ N: <คำถาม>? \n - A \n - B \n - C  ← option แยกบรรทัด (bullet)
   *   5) ข้อ N: <คำถาม>? \n 1) A \n 2) B       ← option แยกบรรทัด (number)
   *   6) คำถาม? (เช่น ...) \n  → fallback ถ้าไม่มี "ข้อ"
   *
   * Part types:
   *   { type: 'question', text, hint? }
   *   { type: 'ack', text }
   *   { type: 'text', text }
   */
  const stripBold = (s) => String(s || '').replace(/\*\*/g, '');

  // ลบ emoji + bullet นำหน้า สำหรับ match (เก็บไว้แสดงผลทีหลัง)
  const stripLeadingDeco = (s) => String(s || '')
    .replace(/^[\s\p{Emoji_Presentation}\p{Extended_Pictographic}🩺❓💡✅⭐]+/u, '')
    .trim();

  // จับ option จาก hint string เช่น "A, B, C" หรือ "A | B | C"
  const splitOptions = (hint) => {
    if (!hint) return [];
    return String(hint)
      .split(/[,，、|/]\s*/)
      .map(s => s.replace(/^[\s\-•·*]+|[\s.?!]+$/g, '').trim())
      .filter(s => s.length > 0 && s.length <= 60);
  };

  // จับบรรทัด option แบบ bullet/number เช่น "- A", "• A", "1) A", "1. A"
  const OPTION_LINE_RE = /^\s*(?:[-•·*]|\d+[.)])\s+(.+?)\s*$/;

  /** แปลงข้อความก่อน parse — กันกรณี newline หายตอนบันทึก/โหลด */
  const normalizeMessageText = (text) => {
    let t = String(text || '');
    t = t.replace(/\\n/g, '\n').replace(/<br\s*\/?>/gi, '\n');
    // แยกข้อความที่ติดกับ "ข้อ N:" / "Question N:"
    t = t.replace(/([^\n])\s*((?:🩺\s*)?(?:ข้อ(?:ที่)?|question)\s*\d+\s*[:：])/gi, '$1\n$2');
    t = t.replace(/\s+(?=\*\s+)/g, '\n');
    t = t.replace(/\s+(?=รบกวนตอบคำถาม|Please answer the questions)/gi, '\n');
    return t.trim();
  };

  const isScreeningQuestion = (text) => {
    const t = String(text || '');
    return /🩺\s*(?:ข้อ|question)\s*\d+/i.test(t)
      || /(?:^|\n)\s*(?:ข้อ(?:ที่)?|question)\s*\d+\s*[:：]/im.test(t)
      || /(?:ข้อ|question)\s*\d+\s*[:：][\s\S]*\*/im.test(t)
      || /รบกวนตอบคำถามเหล่านี้|Please answer the questions below/i.test(t);
  };

  const isThanksOrReviewText = (text) => {
    if (!text) return false;
    if (isScreeningQuestion(text)) return false;
    if (/📋|สรุปอาการ|Preliminary symptom summary|symptom summary/i.test(text)) return false;
    return /ขอบคุณที่ใช้บริการ|รบกวนฝากรีวิว|เขียนรีวิว|ฝากรีวิว|ความคิดเห็นของคุณ.*ช่วยให้เราพัฒนา|ด้วยความยินดี|you are welcome|leave a review/i.test(String(text));
  };

  const parseAiMessage = (text) => {
    if (!text) return [];
    const rawLines = repairScreeningFormat(normalizeMessageText(text))
      .split(/\r?\n/)
      .flatMap((line) => {
        // แยก "1. ... 2. ... 3. ..." ที่ติดในบรรทัดเดียวให้เป็นหลายบรรทัด
        const t = String(line || '');
        if (!/(?:^|\s)\d+[\.\)]\s+\S/.test(t)) return [line];
        const bits = t.split(/(?=(?:^|\s)\d+[\.\)]\s+)/).map((s) => s.trim()).filter(Boolean);
        return bits.length > 1 ? bits : [line];
      });

    // header: "🩺 ข้อ N:" / "🩺 Question N:"
    const HEADER_RE =
      /^\s*(?:ข้อ(?:ที่)?|question)\s*(\d+(?:\s*\/\s*\d+)?)\s*[:：]\s*(.+?)\??\s*$/i;
    // sub-question: "* <ข้อความ>? (เช่น A, B, C)" / "(e.g. ...)"
    const SUB_Q_RE =
      /^\s*[*•·\-]\s+(.+?)\??\s*(?:\((?:\s*(?:เช่น|ตัวอย่าง|ex|e\.g\.|eg\.?)\s*[:：]?\s*)?(.+?)\)\s*)?$/i;
    // คำถาม inline แบบเก่า
    const INLINE_Q_RE =
      /^\s*(?:ข้อ(?:ที่)?|question)\s*(\d+(?:\s*\/\s*\d+)?)\s*[:：]\s*(.+?)\?\s*\((?:\s*(?:เช่น|ตัวอย่าง|ex|e\.g\.|eg\.?)\s*[:：]?\s*)?(.+?)\)\s*$/i;
    const ACK_RE = /^\s*(รับทราบ|เข้าใจแล้ว|ขอบคุณครับ|ขอบคุณค่ะ|โอเค|ok|okay|got it|understood)[ครับค่ะ\s.!]*$/i;
    const CLOSING_RE = /รบกวนตอบคำถามเหล่านี้|Please answer the questions below/i;

    const parts = [];
    let hasQuestionBlock = false;
    let listVariant = ''; // 'care' | 'precaution' | 'warn' | ''
    let careListCount = 0;
    let precListCount = 0;
    let warnListCount = 0;
    const SUMMARY_LIST_MAX = 5;
    let i = 0;
    while (i < rawLines.length) {
      const clean = stripBold(rawLines[i]);
      const noEmoji = stripLeadingDeco(clean);

      if (!noEmoji) {
        i++;
        continue;
      }

      // 1) Inline question (รูปแบบเก่า) "ข้อ N: q? (เช่น ...)"
      const inlineM = noEmoji.match(INLINE_Q_RE);
      if (inlineM) {
        const isEnQ = /question/i.test(noEmoji);
        parts.push({
          type: 'question',
          text: isEnQ
            ? `🩺 Question ${inlineM[1]}: ${inlineM[2].trim()}?`
            : `🩺 ข้อ ${inlineM[1]}: ${inlineM[2].trim()}?`,
          hint: inlineM[3].trim()
        });
        i++;
        continue;
      }

      // 2) Question block (รูปแบบใหม่) "ข้อ N: <header>?" + sub-questions ใต้บรรทัด
      const headerM = noEmoji.match(HEADER_RE);
      if (headerM) {
        const header = headerM[2].trim();
        const subs = [];

        // เก็บ sub-questions ที่ตามมา (* / • / -)
        let j = i + 1;
        while (j < rawLines.length) {
          const nextRaw = rawLines[j];
          const next = stripLeadingDeco(stripBold(nextRaw));

          if (!next) {
            j++;
            continue;
          }

          const subM = next.match(SUB_Q_RE);
          if (subM) {
            subs.push({
              text: subM[1].trim(),
              hint: (subM[2] || '').trim()
            });
            j++;
            continue;
          }
          break;
        }

        if (subs.length > 0) {
          parts.push({
            type: 'question_block',
            number: headerM[1],
            header,
            subQuestions: subs
          });
          hasQuestionBlock = true;
          i = j;
          continue;
        }

        // ไม่มี sub → ตกลงเป็น question แบบ header อย่างเดียว
        const isEnQ = /question/i.test(noEmoji);
        parts.push({
          type: 'question',
          text: isEnQ
            ? `🩺 Question ${headerM[1]}: ${header}?`
            : `🩺 ข้อ ${headerM[1]}: ${header}?`,
          hint: ''
        });
        i++;
        continue;
      }

      // 3) Ack line
      if (ACK_RE.test(stripLeadingDeco(clean.trim()))) {
        parts.push({ type: 'ack', text: clean });
        i++;
        continue;
      }

      if (hasQuestionBlock && CLOSING_RE.test(noEmoji)) {
        i++;
        continue;
      }

      // รายการตัวเลข / bullet สำหรับสรุป (ดูแลตนเอง / ควรพบเภสัชกร)
      const pushListItems = (number, text) => {
        const body = String(text || '').trim();
        if (!body) return;

        let variant = listVariant;
        let displayNum = number == null ? '' : String(number);

        if (variant === 'care') {
          if (careListCount >= SUMMARY_LIST_MAX) return;
          careListCount += 1;
          displayNum = String(careListCount);
        } else if (variant === 'warn') {
          if (warnListCount >= SUMMARY_LIST_MAX) return;
          warnListCount += 1;
          displayNum = String(warnListCount);
        } else if (variant === 'precaution') {
          if (precListCount >= SUMMARY_LIST_MAX) return;
          precListCount += 1;
          displayNum = '';
        }

        // กรณีเตือนที่ติด "/" ในบรรทัดเดียว → แยกเป็นข้อๆ
        if (variant === 'warn' && /\s\/\s/.test(body) && !/^\d+[\.\)]/.test(body)) {
          const pieces = body.split(/\s*\/\s*/).map((s) => s.trim()).filter((s) => s.length >= 2);
          if (pieces.length >= 2) {
            pieces.forEach((t) => {
              if (warnListCount >= SUMMARY_LIST_MAX) return;
              warnListCount += 1;
              parts.push({
                type: 'list_item',
                number: String(warnListCount),
                text: t,
                variant: variant || undefined,
              });
            });
            return;
          }
        }

        parts.push({
          type: 'list_item',
          number: displayNum,
          text: body,
          variant: variant || undefined,
        });
      };

      const listM = noEmoji.match(/^\s*(\d+)[\.\)]\s+(.+)$/);
      if (listM) {
        pushListItems(listM[1], listM[2]);
        i++;
        continue;
      }
      const bulletM = noEmoji.match(/^\s*[-•*]\s+(.+)$/);
      if (bulletM && !hasQuestionBlock) {
        pushListItems('', bulletM[1]);
        i++;
        continue;
      }

      // ประโยคปิดท้ายชวนปรึกษาเภสัช — แยกเพื่อจัด UI สวยๆ
      if (
        /หากต้องการคำแนะนำเพิ่มเติม\s*กรุณาติดต่อเภสัชกรผ่านเว็บ\s*TELEBOT-PHARMACY/i.test(clean)
        || /For more advice,\s*please contact a pharmacist on\s*TELEBOT-PHARMACY/i.test(clean)
        || /ไปกดปุ่ม\s*["“”]?ปรึกษาเภสัช/i.test(clean)
        || /tapping the\s*["“”]?Consult pharmacist/i.test(clean)
      ) {
        parts.push({ type: 'pharmacy_cta', text: clean.trim() });
        listVariant = '';
        i++;
        continue;
      }

      // ข้อควรระวัง / คำแนะนำเพิ่มเติม / หมายเหตุ — แสดงท้ายสรุป (หลังส่วนควรพบเภสัชกร)
      if (
        /^⚠️\s*คำแนะนำเพิ่มเติม\s*[:：]/i.test(noEmoji)
        || /^คำแนะนำเพิ่มเติม\s*[:：]/i.test(noEmoji)
        || /^หากคุณมีข้อสงสัย/i.test(noEmoji)
        || /^\*หมายเหตุ|^หมายเหตุ\s*[:：]/i.test(noEmoji)
        || /^ข้อมูลนี้มีวัตถุประสงค์/i.test(noEmoji)
        || /^คำเตือน\s*[:：]/i.test(noEmoji)
        || /^หากอาการยังคง|^หากอาการรุนแรง/i.test(noEmoji)
        || /^ไม่สามารถใช้แทนคำแนะนำ/i.test(noEmoji)
        || /^โปรดไปพบแพทย์ทันที/i.test(noEmoji)
      ) {
        parts.push({ type: 'footer_note', text: clean.trim() });
        listVariant = '';
        i++;
        continue;
      }

      // ข้ามเครื่องหมาย * เดี่ยวที่ AI ใส่มา
      if (/^\*\s*$/.test(clean.trim())) {
        i++;
        continue;
      }

      if (/^(?:💊|⚠️|👨‍⚕️|📋)/.test(clean.trim())
        || /วิธีดูแลตนเอง|คำแนะนำในการดูแลตนเอง|ข้อควรระวัง|ควรพบเภสัชกร|สรุปอาการ|จากการซักประวัติ|self-care|see a pharmacist|symptom summary|Preliminary|โรคประจำตัว|chronic condition|precautions?\s*[:：]/i.test(clean)) {
        let title = clean.trim().replace(/^📋\s*/, '');
        // หัวข้อปรึกษาเภสัชก่อน CTA — รวมไปกับแบนเนอร์ถ้าบรรทัดถัดไปเป็น CTA
        if (/👨‍⚕️|ปรึกษาเภสัชกรของเรา|Consult our pharmacist/i.test(title)
          && !/หากต้องการ|For more advice/i.test(title)) {
          const nextRaw = rawLines[i + 1] ? stripBold(rawLines[i + 1]) : '';
          const nextIsCta = /หากต้องการคำแนะนำเพิ่มเติม|For more advice.*TELEBOT|ปรึกษาเภสัช/i.test(nextRaw);
          if (nextIsCta) {
            i++;
            continue;
          }
          parts.push({ type: 'pharmacy_cta', text: title });
          listVariant = '';
          i++;
          continue;
        }
        if (/วิธีดูแลตนเอง|คำแนะนำในการดูแลตนเอง|self-care/i.test(title)) listVariant = 'care';
        else if (/ข้อควรระวัง|precautions?\s*[:：]/i.test(title)) listVariant = 'precaution';
        else if (/ควรพบเภสัชกร|see a pharmacist/i.test(title)) listVariant = 'warn';
        else listVariant = '';
        parts.push({ type: 'section_title', text: title, variant: listVariant || undefined });
        i++;
        continue;
      }

      parts.push({ type: 'text', text: clean });
      i++;
    }
    return parts;
  };

  const getOptions = (hint) => splitOptions(hint);

  /** จัดประเภท + parse สำหรับบันทึก/โหลด UI */
  const classifyAssistantMessage = (text, locale = 'th') => {
    let cleaned = repairScreeningFormat(normalizeMessageText(text));
    const loc = resolveChatLocale(locale);
    const isSummaryLike = /📋|สรุปอาการ|จากการซักประวัติ|Preliminary symptom summary|symptom summary|symptom assessment summary/i.test(cleaned);
    if (isSummaryLike) {
      cleaned = finalizeSummaryText(cleaned, loc);
    }
    const lower = cleaned.toLowerCase();
    const isRedFlag = cleaned.includes('🚨')
      || lower.includes('อาการเสี่ยง')
      || lower.includes('พบเภสัชกรทันที');
    const isSummary = isSummaryLike || /สรุปอาการ|จากการซักประวัติ|Preliminary symptom summary|symptom summary/i.test(cleaned);
    const isReview = !isSummary && !isRedFlag && isThanksOrReviewText(cleaned);
    const parts = parseAiMessage(cleaned);
    return { text: cleaned, parts, isRedFlag, isSummary, isReview };
  };

  const buildAssistantMeta = (text, locale = 'th') => {
    const c = classifyAssistantMessage(text, locale);
    return {
      parts: c.parts,
      isSummary: c.isSummary,
      isRedFlag: c.isRedFlag,
      isReview: c.isReview
    };
  };

  const SCREENING_TOTAL = 5;

  const UNCERTAINTY_ANSWER_RE = /ไม่ทราบ|ไม่รู้|ไม่แน่ใจ|จำไม่ได้|ไม่ค่อยรู้|ไม่รู้สาเหตุ|ไม่ว่า|ไม่คิดว่า|unknown|not sure|don't know|dont know|no idea|unsure/i;

  const isUncertaintyAnswer = (text) => UNCERTAINTY_ANSWER_RE.test(String(text || '').trim());

  const parseScreeningQuestionNumFromText = (text) => {
    const m = String(text || '').match(/(?:🩺\s*)?(?:ข้อ(?:ที่)?|question)\s*(\d+)/i);
    return m ? parseInt(m[1], 10) || 0 : 0;
  };

  const extractQuestionNumber = (msg) => {
    const text = msg?.text || '';
    if (msg?.parts?.length) {
      const block = msg.parts.find(p => p.type === 'question_block' || p.type === 'question');
      if (block?.number) return parseInt(String(block.number).split('/')[0], 10) || 0;
      if (block?.text) {
        const pm = String(block.text).match(/(?:ข้อ(?:ที่)?|question)\s*(\d+)/i);
        if (pm) return parseInt(pm[1], 10) || 0;
      }
    }
    const m = String(text).match(/(?:ข้อ(?:ที่)?|question)\s*(\d+)/i);
    return m ? parseInt(m[1], 10) : parseScreeningQuestionNumFromText(text);
  };

  /** นับความคืบหน้าการซักประวัติ 5 ข้อ — จับคู่ Q→A ตามลำดับ */
  const getChatProgress = (messages) => {
    const asked = new Set();
    let userAnswers = 0;
    let answeredUpTo = 0;
    let pendingQ = 0;
    let lastAssistantQ = 0;
    let inScreening = false;

    for (const msg of messages || []) {
      if (msg.role === 'assistant') {
        let n = extractQuestionNumber(msg);
        if (n <= 0 && isScreeningQuestion(msg.text)) {
          n = parseScreeningQuestionNumFromText(msg.text);
        }
        if (n > 0) {
          inScreening = true;
          asked.add(n);
          lastAssistantQ = n;
          pendingQ = n;
        } else if (isScreeningQuestion(msg.text)) {
          inScreening = true;
        }
      } else if (msg.role === 'user' && inScreening) {
        if (msg.skipProgress) continue;
        userAnswers++;
        const qForAnswer = pendingQ || lastAssistantQ;
        if (qForAnswer > 0) {
          answeredUpTo = Math.max(answeredUpTo, qForAnswer);
          pendingQ = 0;
        } else if (asked.size) {
          answeredUpTo = Math.max(answeredUpTo, Math.max(...asked));
        }
      }
    }

    const highestAsked = asked.size ? Math.max(...asked) : 0;
    const nextQ = Math.min(Math.max(highestAsked, answeredUpTo) + 1, SCREENING_TOTAL + 1);
    const readyForSummary =
      answeredUpTo >= SCREENING_TOTAL
      || userAnswers >= SCREENING_TOTAL
      || (highestAsked >= SCREENING_TOTAL && answeredUpTo >= SCREENING_TOTAL);

    return {
      highestAsked,
      userAnswers,
      answeredUpTo,
      nextQ,
      readyForSummary,
      total: SCREENING_TOTAL,
      pendingQ,
    };
  };

  const isInScreening = (messages) => {
    const progress = getChatProgress(messages);
    if (progress.readyForSummary) return false;
    if (progress.highestAsked > 0 && progress.highestAsked <= SCREENING_TOTAL) return true;
    if (!Array.isArray(messages) || messages.length === 0) return false;
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistant) return false;
    if (lastAssistant.parts?.some(p => p.type === 'question_block' || p.type === 'question')) return true;
    return isScreeningQuestion(lastAssistant.text);
  };

  /** ข้อความคำถามคัดกรองล่าสุด (ก่อนคำตอบของผู้ใช้) */
  const getLastScreeningQuestionText = (messages) => {
    const last = getLastScreeningAssistant(messages);
    return last ? String(last.text || '').trim() : '';
  };

  /** พิมพ์มั่วระหว่างซักประวัติ — ถามข้อเดิมซ้ำ (ไม่แสดงข้อความเตือน) */
  const buildGibberishScreeningReply = (messages, symptomName = '', locale = 'th', opts = {}) => {
    if (!isActiveFixedScreening(messages)) return getLastScreeningQuestionText(messages) || '';

    const key = normalizeSymptomKey(symptomName);
    const progress = getChatProgress(messages);
    const qNum = progress.pendingQ || progress.highestAsked || progress.answeredUpTo + 1 || 1;
    if (key && qNum <= SCREENING_TOTAL) {
      const gender = opts.gender || resolveUserGender(opts.profile || null);
      const qText = formatFixedScreeningQuestion(key, qNum, {
        gender,
        locale: resolveChatLocale(locale),
      });
      if (qText) return qText;
    }
    return getLastScreeningQuestionText(messages) || '';
  };

  const buildInvalidAnswerReply = (symptomName, questionText, locale = 'th') => {
    const loc = resolveChatLocale(locale);
    const name = symptomDisplayName(symptomName, loc) || String(symptomName || '').trim();
    const qLine = String(questionText || '').split('\n').find((l) => /🩺|ข้อ\s*\d|question\s*\d/i.test(l)) || '';
    if (loc === 'en') {
      return [
        `Your answer doesn't seem to match the current screening question about "${name}".`,
        'Please describe your symptom clearly so we can continue.',
        qLine ? `\n${qLine}` : '',
        '\n✍️ Please type your answer in the box below.',
      ].filter(Boolean).join('\n');
    }
    return [
      `คำตอบนี้ยังไม่เกี่ยวกับคำถามที่ถามอยู่ค่ะ กรุณาตอบเรื่องอาการ "${name}" ให้ชัดเจนอีกครั้งนะคะ`,
      qLine ? `\n${qLine}` : '',
      '\n✍️ กรุณาพิมพ์คำตอบในช่องด้านล่างได้เลยครับ',
    ].filter(Boolean).join('\n');
  };

  /** @deprecated ไม่ validate คำตอบแล้ว — ให้ผ่านเสมอ (กรองที่ classifyInput แล้ว) */
  const checkScreeningAnswer = async () => ({ valid: true, skipped: true });

  /** ดึงคู่ Q/A จากประวัติ สำหรับสรุปสำรอง */
  const extractScreeningQA = (messages) => {
    const pairs = [];
    let pendingQ = '';
    for (const msg of messages || []) {
      if (msg.role === 'assistant' && isScreeningQuestion(msg.text)) {
        pendingQ = String(msg.text || '').split('\n')[0] || '';
      } else if (msg.role === 'user' && pendingQ && !msg.skipProgress) {
        pairs.push({ q: pendingQ, a: String(msg.text || '').trim() });
        pendingQ = '';
      }
    }
    return pairs;
  };

  /** แนบ hint ให้ AI — ล็อกหัวข้อ + สรุปเมื่อครบ */
  const buildScreeningHint = (messages, symptomName = '') => {
    const p = getChatProgress(messages);
    const locked = symptomName && symptomName !== 'ทั่วไป'
      ? `[LOCKED_TOPIC] อาการที่เลือก: ${symptomName} — สรุปเฉพาะอาการนี้ ห้ามถามข้อใหม่ ห้ามเปลี่ยนหัวข้อ`
      : '';
    const sym = symptomName && symptomName !== 'ทั่วไป' ? `อาการ: ${symptomName}` : '';

    let progressHint = '';
    if (p.readyForSummary || p.highestAsked >= SCREENING_TOTAL) {
      progressHint = `[HINT] ${sym} เก็บครบ ${SCREENING_TOTAL} ข้อแล้ว → ออกสรุป 📋 ทันที ห้ามถามข้อ 1-5 ซ้ำ`.trim();
    } else if (p.highestAsked === 0) {
      progressHint = `[HINT] ${sym} ระบบจะถามข้อ 1 แบบ fix เอง — คุณอย่าถาม`.trim();
    } else {
      progressHint = `[HINT] ${sym} กำลังซักข้อ ${p.highestAsked}/${SCREENING_TOTAL} — ระบบถามเอง ห้ามสร้างคำถาม`.trim();
    }

    return [locked, progressHint].filter(Boolean).join('\n');
  };

  /**
   * คำถามข้อถัดไปแบบตายตัว (ไม่เรียก AI) — กันหลอน / ถามซ้ำ
   * @param opts.gender เพศจากโปรไฟล์ — ใช้ปรับคำถาม เช่น ปวดประจำเดือนในผู้ชาย
   */
  const getFixedScreeningReply = (messages, symptomName = '', opts = {}) => {
    const key = normalizeSymptomKey(symptomName);
    if (!key) return null;
    const progress = getChatProgress(messages);
    if (progress.readyForSummary || progress.answeredUpTo >= SCREENING_TOTAL) return null;

    let qNum = resolveNextFixedQuestionNum(progress);

    // กันถามซ้ำ: ตอบข้อล่าสุดครบแล้ว → บังคับไปข้อถัดไป
    if (progress.answeredUpTo > 0 && progress.answeredUpTo >= progress.highestAsked) {
      qNum = Math.max(qNum || 0, progress.answeredUpTo + 1);
    } else if (progress.highestAsked > 0 && progress.answeredUpTo < progress.highestAsked) {
      qNum = progress.highestAsked;
    }

    if (!qNum && progress.answeredUpTo < SCREENING_TOTAL) {
      qNum = progress.answeredUpTo + 1 || 1;
    }
    if (!qNum || qNum > SCREENING_TOTAL) return null;

    // กันถามซ้ำ: เพิ่งตอบข้อ N แล้ว → ห้ามถามข้อ N อีก
    const lastMsg = messages?.[messages.length - 1];
    if (
      lastMsg?.role === 'user'
      && !lastMsg.skipProgress
      && qNum <= progress.answeredUpTo
      && progress.answeredUpTo < SCREENING_TOTAL
    ) {
      qNum = progress.answeredUpTo + 1;
    }

    const gender = opts.gender || resolveUserGender(opts.profile || null);
    const locale = resolveChatLocale(opts.locale);
    const text = formatFixedScreeningQuestion(key, qNum, { gender, locale });
    return text ? { text, questionNum: qNum, symptom: key } : null;
  };

  /** ยังอยู่ในช่วงคัดกรอง 5 ข้อ (ห้ามเรียก n8n ถามซ้ำ) */
  const isActiveFixedScreening = (messages) => {
    const p = getChatProgress(messages);
    return !p.readyForSummary && p.answeredUpTo < SCREENING_TOTAL;
  };

  /**
   * สร้าง prompt ให้ AI เขียนสรุปเอง (ไม่ใช้เทมเพลต fix)
   * @param opts.personalDisease โรคประจำตัวจากโปรไฟล์
   * @param opts.patientName ชื่อเรียกในสรุป
   */
  const buildSummaryChatInput = (messages, symptomName = '', profileLine = '', lastUserText = '', locale = 'th', opts = {}) => {
    const loc = resolveChatLocale(locale);
    const qa = extractScreeningQA(messages);
    const answers = qa.length
      ? qa.map((p, i) => (loc === 'en' ? `Q${i + 1}: ${p.a}` : `ข้อ ${i + 1}: ${p.a}`)).join('\n')
      : (loc === 'en'
        ? '(All 5 answers collected — use chat memory)'
        : '(ครบ 5 ข้อแล้ว — อ้างอิงประวัติใน memory)');
    const locked = symptomName && symptomName !== 'ทั่วไป'
      ? `[LOCKED_TOPIC] symptom: ${symptomName} (${symptomDisplayName(symptomName, loc)})`
      : '';
    const cta = pharmacyConsultCta(loc);
    const diseaseRaw = opts.personalDisease ?? '';
    const disease = normalizePersonalDisease(diseaseRaw);
    const chronicBlock = loc === 'en'
      ? `[CHRONIC_CONDITIONS] ${disease || 'none'}\n[CHRONIC_RULE] You MUST factor chronic conditions into the summary, self-care tips, and pharmacist warning. If none, state "none". Do not prescribe medicines.`
      : `[CHRONIC_CONDITIONS] ${disease || 'ไม่มี'}\n[CHRONIC_RULE] ต้องนำโรคประจำตัวมาประกอบการสรุป แนะนำการดูแลตนเอง และข้อควรพบเภสัชกรเสมอ ถ้าไม่มีให้ระบุว่า "ไม่มี" ห้ามแนะนำยา`;
    const systemLine = loc === 'en'
      ? `[SYSTEM] Screening is complete — write the assessment summary in clear natural English using the screening answers AND chronic conditions. Do not ask a new question. Do not print 🩺 Question N or placeholders. Do not recommend medicines. Mention relevant chronic conditions in the summary. Include both "💊 Basic self-care tips" and "⚠️ See a pharmacist if you have these symptoms" as numbered lists 1. 2. 3. … (3–5 items each, short, no long paragraphs, do not join with "/"). End exactly with: ${cta}`
      : `[SYSTEM] ครบ 5 ข้อคัดกรองแล้ว — เขียนสรุปผลการประเมินอาการเองเป็นภาษาธรรมชาติ โดยต้องวิเคราะห์ร่วมกับโรคประจำตัวใน [CHRONIC_CONDITIONS]/[PROFILE] ด้วย อ่านง่าย ห้ามยึดเทมเพลตตายตัว ห้ามถามข้อใหม่ ห้ามพิมพ์ 🩺 ข้อ N หรือ placeholder ห้ามเสนอแนะนำยา ต้องมีครบ: "💊 คำแนะนำในการดูแลตนเองเบื้องต้น:" (ไม่เกิน 5 ข้อ), "ข้อควรระวัง:" (1–3 ข้อ), "⚠️ ควรพบเภสัชกรหากมีอาการเหล่านี้" (ไม่เกิน 5 ข้อ) — แบ่งเป็นข้อๆ หมายเลข 1. 2. 3. … สั้นชัด ห้ามย่อหน้ายาว ห้ามรวมอาการด้วย "/" ให้ปิดท้ายว่า: ${cta}`;
    return [
      profileLine,
      chronicBlock,
      locked,
      `[OUTPUT_LANG] ${loc === 'en' ? 'English' : 'Thai'}`,
      systemLine,
      '[CHAT_ANSWERS]',
      answers,
      lastUserText ? (loc === 'en' ? `Latest user answer: ${lastUserText}` : `คำตอบล่าสุดของ User: ${lastUserText}`) : '',
    ].filter(Boolean).join('\n\n');
  };

  /**
   * หลังครบ 5 ข้อ — รับสรุปจาก AI; ถ้าเด้งไปถามข้อ/หลอนค่อยใช้สรุปสำรอง
   * @param opts.personalDisease / opts.patientName สำหรับสรุปสำรอง
   */
  const coerceSummaryOrPass = (messages, symptomName, aiText, locale = 'th', opts = {}) => {
    const loc = resolveChatLocale(locale);
    const progress = getChatProgress(messages);
    const text = String(aiText || '').trim();
    const mustSummarize = progress.readyForSummary || progress.highestAsked >= SCREENING_TOTAL;

    if (!mustSummarize) {
      if (isScreeningQuestion(text) || isHallucinatedScreeningText(text)) {
        const fixed = getFixedScreeningReply(messages, symptomName, { locale: loc, ...opts });
        if (fixed?.text) return { text: fixed.text, isSummary: false, coerced: true };
      }
      return { text, isSummary: false, coerced: false };
    }

    // ครบแล้ว — ห้ามมีคำถามคัดกรอง; สรุปจาก AI ผ่านได้เลยถ้าไม่ใช่คำถาม
    const looksLikeQuestion =
      isHallucinatedScreeningText(text)
      || isScreeningQuestion(text)
      || /🩺\s*(?:ข้อ|question)\s*\d+/i.test(text)
      || /รบกวนตอบคำถามเหล่านี้|Please answer the questions below/i.test(text);

    if (!text || looksLikeQuestion) {
      return {
        text: buildFallbackSummary(symptomName, extractScreeningQA(messages), loc, {
          personalDisease: opts.personalDisease,
          patientName: opts.patientName,
        }),
        isSummary: true,
        coerced: true,
      };
    }
    return {
      text: finalizeSummaryText(text, loc),
      isSummary: true,
      coerced: false,
    };
  };

  return {
    SYMPTOMS_32,
    RED_FLAGS,
    IRRELEVANT,
    ALWAYS_IRRELEVANT,
    THANKS,
    PROFANITY,
    classifyInput,
    isRedFlagInput,
    isAdultContentInput,
    isProfanityInput,
    isGibberishInput,
    isJokeAnswerInput,
    isOffTopicInput,
    isWrongSymptomTopic,
    isAnswerOnTopic,
    isInScreening,
    stripOffTopicLeak,
    normalizeMessageText,
    parseAiMessage,
    getOptions,
    classifyAssistantMessage,
    buildAssistantMeta,
    buildScreeningHint,
    getChatProgress,
    getFixedScreeningReply,
    isActiveFixedScreening,
    coerceSummaryOrPass,
    buildSummaryChatInput,
    formatFixedScreeningQuestion,
    isHallucinatedScreeningText,
    rewritePharmacyConsultCta,
    finalizeSummaryText,
    normalizeSummaryLayout,
    resolveUserGender,
    adaptScreeningPartsForGender,
    resolveChatLocale,
    symptomDisplayName,
    getReply,
    SCREENING_TOTAL,
    isScreeningQuestion,
    buildOffSymptomReply,
    getLastScreeningQuestionText,
    buildInvalidAnswerReply,
    buildGibberishScreeningReply,
    checkScreeningAnswer,
    REPLY_REDFLAG,
    REPLY_IRRELEVANT,
    REPLY_PROFANITY,
    REPLY_THANKS
  };
}
