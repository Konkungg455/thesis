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
import {
  formatFixedScreeningQuestion,
  isHallucinatedScreeningText,
  normalizeSymptomKey,
  resolveNextFixedQuestionNum,
  buildFallbackSummary,
  rewritePharmacyConsultCta,
  resolveUserGender,
  adaptScreeningPartsForGender,
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
    'มึน', 'เวียน', 'ชา', 'เหน็บ', 'เมา', 'ห้องหมุน', 'ทรงตัว', 'ตื้อ', 'ตุบ', 'แปลบ'
  ];

  const SCREENING_ANSWER_RE = /ห้องหมุน|มึนหัว|ทรงตัว|ตุบ|ตื้อ|แปลบ|คลื่นไส้|ท้องเสีย|ไอ|เจ็บคอ|ผื่น|คัน|แดง|บวม|ชา|เหน็บ|เวียน|ร้อน|เย็น|ดีขึ้น|แย่ลง|ไม่ทราบ|ไม่รู้|เคย|ไม่เคย|\d|ชั่วโมง|นาที|วัน|สัปดาห์|เดือน/i;

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

  const isInScreening = (messages) => {
    if (!Array.isArray(messages) || messages.length === 0) return false;
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistant) return false;
    if (lastAssistant.parts?.some(p => p.type === 'question_block' || p.type === 'question')) return true;
    return isScreeningQuestion(lastAssistant.text);
  };

  /** ตรวจคำตอบนอกประเด็น — โดยเฉพาะระหว่างซักประวัติ */
  const normalizeSymptom = (name) => String(name || '').replace(/\s+/g, '').toLowerCase();

  const findMentionedSymptoms = (text) => {
    const t = String(text || '');
    return SYMPTOMS_32.filter((s) => t.includes(s) || normalizeSymptom(t).includes(normalizeSymptom(s)));
  };

  /** ตอบชี้ไปอาการอื่นนอกหัวข้อที่เลือก — แต่ไม่บล็อกคำตอบอาการร่วม/ตัวเลือกในข้อ */
  const matchesQuestionOption = (text, messages) => {
    const t = String(text || '').trim().toLowerCase();
    if (!t) return false;
    const opts = getLastQuestionOptions(messages);
    if (!opts.length) return false;
    return opts.some((o) => {
      const opt = String(o || '').trim().toLowerCase();
      if (!opt) return false;
      return t === opt || t.includes(opt) || opt.includes(t);
    });
  };

  const isAccompanyingSymptomQuestion = (messages) => {
    const lastAssistant = [...(messages || [])].reverse().find((m) => m.role === 'assistant');
    if (!lastAssistant) return false;
    const t = String(lastAssistant.text || '');
    if (/อาการร่วม|มีอาการอื่น|ร่วมด้วย/i.test(t)) return true;
    if (lastAssistant.parts?.length) {
      const q = lastAssistant.parts.find((p) => p.type === 'question_block' || p.type === 'question');
      const header = String(q?.header || q?.text || '');
      if (/อาการร่วม|มีอาการอื่น|ร่วมด้วย/i.test(header)) return true;
    }
    return false;
  };

  const isWrongSymptomTopic = (text, symptomName, options = {}) => {
    const locked = String(symptomName || '').trim();
    if (!locked || locked === 'ทั่วไป') return false;
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
    const lockedN = normalizeSymptom(locked);
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

  /** ดึงตัวเลือกจากคำถามล่าสุดของ AI (เช่น ...) */
  const getLastQuestionOptions = (messages) => {
    const lastAssistant = [...(messages || [])].reverse().find((m) => m.role === 'assistant');
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
    const m = String(lastAssistant.text || '').match(/\(\s*เช่น\s*([^)]+)\)/i);
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
   * จำแนกประเภทข้อความ
   * @returns {'redflag' | 'profanity' | 'irrelevant' | 'off_topic_symptom' | 'thanks' | 'normal'}
   */
  const classifyInput = (text, options = {}) => {
    const ctx = {
      ...options,
      inScreening: options.inScreening ?? isInScreening(options.messages),
      symptomName: options.symptomName,
    };

    if (isRedFlagInput(text)) return 'redflag';
    if (isProfanityInput(text)) return 'profanity';
    // ด่านแรก: มุก/นอกเรื่อง เช่น "ปวดขี้" — ห้ามส่ง AI แม้มีคำว่าปวด
    if (isOffTopicInput(text, ctx)) return 'irrelevant';
    if (isWrongSymptomTopic(text, options.symptomName, ctx) && ctx.inScreening) return 'off_topic_symptom';
    if (ctx.inScreening && !isAnswerOnTopic(text, ctx)) return 'off_topic_symptom';
    if (containsAny(text, HEALTH_HINTS)) return 'normal';
    if (containsAny(text, SYMPTOMS_32)) return 'normal';
    if (containsAny(text, THANKS)) return 'thanks';
    if (containsAny(text, IRRELEVANT) || containsAny(text, ALWAYS_IRRELEVANT)) return 'irrelevant';
    return 'normal';
  };

  /** กันหลุด — ถ้า user ตอบนอกเรื่อง ห้าม AI ถามข้อถัดไป */
  const stripOffTopicLeak = (aiOutput, userInput, options = {}) => {
    const ctx = { ...options, inScreening: options.inScreening ?? isInScreening(options.messages) };
    if (!isOffTopicInput(userInput, ctx) && !isWrongSymptomTopic(userInput, options.symptomName, ctx)) {
      return aiOutput;
    }
    if (isScreeningQuestion(aiOutput) || /🩺\s*ข้อ\s*\d+/i.test(String(aiOutput || ''))) {
      if (isWrongSymptomTopic(userInput, options.symptomName, ctx)) {
        return buildOffSymptomReply(options.symptomName);
      }
      return REPLY_IRRELEVANT;
    }
    return aiOutput;
  };

  // ข้อความสำเร็จรูป
  const REPLY_REDFLAG =
    '🚨 อาการที่คุณแจ้งมาอาจมีความเสี่ยงสูง เพื่อความปลอดภัยกรุณากด "ติดต่อเภสัชกรของเราทันที" ' +
    'หรือถ้ารู้สึกแย่ลงให้ไปโรงพยาบาลที่ใกล้ที่สุดค่ะ';

  const REPLY_IRRELEVANT =
    'ขออภัยค่ะ telebot ตอบได้เฉพาะเรื่องสุขภาพและอาการเจ็บป่วยเล็กน้อย 32 อาการบัตรทองเท่านั้น ' +
    'กรุณาตอบคำถามเกี่ยวกับอาการที่กำลังซักอยู่ หรือบอกอาการของคุณใหม่ค่ะ';

  const REPLY_PROFANITY =
    'ขออภัยค่ะ กรุณาใช้ภาษาสุภาพในการสนทนากับ telebot นะคะ ' +
    'พิมพ์อธิบายอาการด้วยถ้อยคำสุภาพ แล้ว telebot จะช่วยคัดกรองให้ค่ะ';

  const buildOffSymptomReply = (symptomName) => {
    const name = String(symptomName || '').trim() || 'ที่เลือกไว้';
    return `ตอนนี้ telebot กำลังคัดกรองอาการ "${name}" อยู่ค่ะ กรุณาตอบเฉพาะเรื่องอาการนี้ ` +
      'ถ้าต้องการเปลี่ยนอาการ กรุณาเลือกหมวดอาการใหม่จากหน้าแรกค่ะ';
  };

  const REPLY_THANKS =
    'ด้วยความยินดีค่ะ 😊 หากการบริการของเราเป็นประโยชน์กับคุณ ' +
    'ฝากรีวิวให้กำลังใจทีมงานเราหน่อยนะคะ';

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
    // แยกข้อความที่ติดกับ "ข้อ N:" เช่น "รับทราบครับ ข้อ 1:"
    t = t.replace(/([^\n])\s*((?:🩺\s*)?ข้อ(?:ที่)?\s*\d+\s*[:：])/gi, '$1\n$2');
    t = t.replace(/\s+(?=\*\s+)/g, '\n');
    t = t.replace(/\s+(?=รบกวนตอบคำถาม)/gi, '\n');
    return t.trim();
  };

  const isScreeningQuestion = (text) => {
    const t = String(text || '');
    return /🩺\s*ข้อ\s*\d+/i.test(t)
      || /ข้อ\s*\d+\s*[:：][\s\S]*\*/m.test(t)
      || /รบกวนตอบคำถามเหล่านี้/i.test(t);
  };

  const isThanksOrReviewText = (text) => {
    if (!text) return false;
    if (isScreeningQuestion(text)) return false;
    if (/📋|สรุปอาการ/i.test(text)) return false;
    return /ขอบคุณที่ใช้บริการ|รบกวนฝากรีวิว|เขียนรีวิว|ฝากรีวิว|ความคิดเห็นของคุณ.*ช่วยให้เราพัฒนา|ด้วยความยินดี/i.test(String(text));
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

    // header: "🩺 ข้อ N: <ข้อความ>?"
    const HEADER_RE =
      /^\s*ข้อ(?:ที่)?\s*(\d+(?:\s*\/\s*\d+)?)\s*[:：]\s*(.+?)\??\s*$/i;
    // sub-question: "* <ข้อความ>? (เช่น A, B, C)"  หรือ  "- <ข้อความ>? (...)"
    const SUB_Q_RE =
      /^\s*[*•·\-]\s+(.+?)\??\s*(?:\((?:\s*(?:เช่น|ตัวอย่าง|ex)\s*[:：]?\s*)?(.+?)\)\s*)?$/i;
    // คำถาม inline แบบเก่า: "🩺 ข้อ N: <q>? (เช่น ...)"
    const INLINE_Q_RE =
      /^\s*ข้อ(?:ที่)?\s*(\d+(?:\s*\/\s*\d+)?)\s*[:：]\s*(.+?)\?\s*\((?:\s*(?:เช่น|ตัวอย่าง|ex)\s*[:：]?\s*)?(.+?)\)\s*$/i;
    const ACK_RE = /^\s*(รับทราบ|เข้าใจแล้ว|ขอบคุณครับ|ขอบคุณค่ะ|โอเค|ok)[ครับค่ะ\s.!]*$/i;
    const CLOSING_RE = /รบกวนตอบคำถามเหล่านี้/i;

    const parts = [];
    let hasQuestionBlock = false;
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
        parts.push({
          type: 'question',
          text: `🩺 ข้อ ${inlineM[1]}: ${inlineM[2].trim()}?`,
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
        parts.push({
          type: 'question',
          text: `🩺 ข้อ ${headerM[1]}: ${header}?`,
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

      // รายการตัวเลข / bullet สำหรับสรุป (ดูแลตนเอง ฯลฯ)
      const listM = noEmoji.match(/^\s*(\d+)[\.\)]\s+(.+)$/);
      if (listM) {
        parts.push({ type: 'list_item', number: listM[1], text: listM[2].trim() });
        i++;
        continue;
      }
      const bulletM = noEmoji.match(/^\s*[-•*]\s+(.+)$/);
      if (bulletM && !hasQuestionBlock) {
        parts.push({ type: 'list_item', number: '', text: bulletM[1].trim() });
        i++;
        continue;
      }
      if (/^(?:💊|⚠️|👨‍⚕️|📋)/.test(clean.trim()) || /วิธีดูแลตนเอง|ควรพบเภสัชกร|สรุปอาการ/.test(clean)) {
        parts.push({ type: 'section_title', text: clean.trim() });
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
  const classifyAssistantMessage = (text) => {
    const cleaned = repairScreeningFormat(normalizeMessageText(text));
    const lower = cleaned.toLowerCase();
    const isRedFlag = cleaned.includes('🚨')
      || lower.includes('อาการเสี่ยง')
      || lower.includes('พบเภสัชกรทันที');
    const isSummary = cleaned.includes('📋') || lower.includes('สรุปอาการ');
    const isReview = !isSummary && !isRedFlag && isThanksOrReviewText(cleaned);
    const parts = parseAiMessage(cleaned);
    return { text: cleaned, parts, isRedFlag, isSummary, isReview };
  };

  const buildAssistantMeta = (text) => {
    const c = classifyAssistantMessage(text);
    return {
      parts: c.parts,
      isSummary: c.isSummary,
      isRedFlag: c.isRedFlag,
      isReview: c.isReview
    };
  };

  const SCREENING_TOTAL = 5;

  const extractQuestionNumber = (msg) => {
    const text = msg?.text || '';
    if (msg?.parts?.length) {
      const block = msg.parts.find(p => p.type === 'question_block' || p.type === 'question');
      if (block?.number) return parseInt(String(block.number).split('/')[0], 10) || 0;
      if (block?.text) {
        const pm = String(block.text).match(/ข้อ(?:ที่)?\s*(\d+)/i);
        if (pm) return parseInt(pm[1], 10) || 0;
      }
    }
    const m = String(text).match(/ข้อ(?:ที่)?\s*(\d+)/i);
    return m ? parseInt(m[1], 10) : 0;
  };

  /** นับความคืบหน้าการซักประวัติ 5 ข้อ — ไม่นับคำตอบนอกประเด็น */
  const getChatProgress = (messages) => {
    const asked = new Set();
    let userAnswers = 0;
    let inScreening = false;
    let answeredUpTo = 0;

    for (const msg of messages || []) {
      if (msg.role === 'assistant') {
        const n = extractQuestionNumber(msg);
        if (n > 0 || isScreeningQuestion(msg.text)) {
          inScreening = true;
          if (n > 0) asked.add(n);
        }
      } else if (msg.role === 'user' && inScreening) {
        if (msg.skipProgress) continue;
        userAnswers++;
        // จับคู่คำตอบกับข้อล่าสุดที่ถามไป ณ ตอนนั้น
        const askedSoFar = asked.size ? Math.max(...asked) : 0;
        if (askedSoFar > 0) answeredUpTo = Math.max(answeredUpTo, askedSoFar);
      }
    }

    const highestAsked = asked.size ? Math.max(...asked) : 0;
    const nextQ = Math.min(Math.max(highestAsked, answeredUpTo) + 1, SCREENING_TOTAL + 1);
    const readyForSummary =
      userAnswers >= SCREENING_TOTAL
      || (highestAsked >= SCREENING_TOTAL && userAnswers >= highestAsked)
      || (answeredUpTo >= SCREENING_TOTAL);

    return {
      highestAsked,
      userAnswers,
      answeredUpTo,
      nextQ,
      readyForSummary,
      total: SCREENING_TOTAL,
    };
  };

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
    if (progress.readyForSummary || progress.highestAsked >= SCREENING_TOTAL) return null;

    let qNum = resolveNextFixedQuestionNum(progress);
    if (!qNum) return null;
    // กันย้อนกลับ: ข้อถัดไปต้องมากกว่า highestAsked ที่ตอบครบแล้ว
    if (progress.userAnswers >= progress.highestAsked && progress.highestAsked > 0) {
      qNum = Math.max(qNum, progress.highestAsked + 1);
    }
    if (qNum > SCREENING_TOTAL) return null;

    const gender = opts.gender || resolveUserGender(opts.profile || null);
    const text = formatFixedScreeningQuestion(key, qNum, { gender });
    return text ? { text, questionNum: qNum, symptom: key } : null;
  };

  /**
   * สร้าง prompt ให้ AI เขียนสรุปเอง (ไม่ใช้เทมเพลต fix)
   */
  const buildSummaryChatInput = (messages, symptomName = '', profileLine = '', lastUserText = '') => {
    const qa = extractScreeningQA(messages);
    const answers = qa.length
      ? qa.map((p, i) => `ข้อ ${i + 1}: ${p.a}`).join('\n')
      : '(ครบ 5 ข้อแล้ว — อ้างอิงประวัติใน memory)';
    const locked = symptomName && symptomName !== 'ทั่วไป'
      ? `[LOCKED_TOPIC] อาการที่เลือก: ${symptomName}`
      : '';
    return [
      profileLine,
      locked,
      '[SYSTEM] ครบ 5 ข้อคัดกรองแล้ว — เขียนสรุปผลการประเมินอาการเองเป็นภาษาธรรมชาติ อ่านง่าย ห้ามยึดเทมเพลตตายตัว ห้ามถามข้อใหม่ ห้ามพิมพ์ 🩺 ข้อ N หรือ placeholder ห้ามเสนอแนะนำยา ส่วน "💊 วิธีดูแลตนเองเบื้องต้น" ต้องแบ่งเป็นข้อๆ หมายเลข 1. 2. 3. … (3–5 ข้อ สั้นชัด ห้ามเขียนย่อหน้ายาวรวมกัน) ให้ปิดท้ายว่า: หากต้องการคำแนะนำเพิ่มเติม กรุณาติดต่อเภสัชกรผ่านเว็บ TELEBOT-PHARMACY ไปกดปุ่ม "ปรึกษาเภสัช" ด้านล่างนี้',
      '[CHAT_ANSWERS]',
      answers,
      lastUserText ? `คำตอบล่าสุดของ User: ${lastUserText}` : '',
    ].filter(Boolean).join('\n\n');
  };

  /**
   * หลังครบ 5 ข้อ — รับสรุปจาก AI; ถ้าเด้งไปถามข้อ/หลอนค่อยใช้สรุปสำรอง
   */
  const coerceSummaryOrPass = (messages, symptomName, aiText) => {
    const progress = getChatProgress(messages);
    const text = String(aiText || '').trim();
    const mustSummarize = progress.readyForSummary || progress.highestAsked >= SCREENING_TOTAL;

    if (!mustSummarize) {
      if (isScreeningQuestion(text)) {
        const n = extractQuestionNumber({ text });
        if (n > 0 && n <= progress.highestAsked && progress.userAnswers >= n) {
          const fixed = getFixedScreeningReply(messages, symptomName);
          if (fixed?.text) return { text: fixed.text, isSummary: false, coerced: true };
        }
      }
      if (isHallucinatedScreeningText(text)) {
        const fixed = getFixedScreeningReply(messages, symptomName);
        if (fixed?.text) return { text: fixed.text, isSummary: false, coerced: true };
      }
      return { text, isSummary: false, coerced: false };
    }

    // ครบแล้ว — ห้ามมีคำถามคัดกรอง; สรุปจาก AI ผ่านได้เลยถ้าไม่ใช่คำถาม
    const looksLikeQuestion =
      isHallucinatedScreeningText(text)
      || isScreeningQuestion(text)
      || /🩺\s*ข้อ\s*\d+/i.test(text)
      || /รบกวนตอบคำถามเหล่านี้/i.test(text);

    if (!text || looksLikeQuestion) {
      return {
        text: buildFallbackSummary(symptomName, extractScreeningQA(messages)),
        isSummary: true,
        coerced: true,
      };
    }
    return { text: rewritePharmacyConsultCta(text), isSummary: true, coerced: false };
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
    isProfanityInput,
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
    coerceSummaryOrPass,
    buildSummaryChatInput,
    formatFixedScreeningQuestion,
    isHallucinatedScreeningText,
    rewritePharmacyConsultCta,
    resolveUserGender,
    adaptScreeningPartsForGender,
    SCREENING_TOTAL,
    isScreeningQuestion,
    buildOffSymptomReply,
    REPLY_REDFLAG,
    REPLY_IRRELEVANT,
    REPLY_PROFANITY,
    REPLY_THANKS
  };
}
