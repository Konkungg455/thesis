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

  const BLEEDING_MENTION_RE = /เลือดออก|อาเจียนเป็นเลือด|ถ่ายเป็นเลือด|ไอเป็นเลือด|มีเลือด|ปนเลือด|เลือดปน/i;
  const MILD_BLEEDING_RE = /นิดหน่อย|เล็กน้อย|นิดเดียว|ไม่มาก|แค่นิด|นิดๆ|เลือดน้อย|รอยเลือด|เป็นจุด|ปนเลือดนิด|เลือดออกนิด/i;
  const SEVERE_BLEEDING_RE = /มาก|เยอะ|ไม่หยุด|หยุดไม่ได้|ท่วม|พุ่ง|รุนแรง|ไหลไม่หยุด|เป็นลิตร|เต็ม|แก่น|สดเยอะ/i;

  // คำถามนอกเรื่อง — ไม่เกี่ยวสุขภาพ → ปฏิเสธสุภาพ ไม่เรียก AI
  // ⚠️ ห้ามใช้คำที่อาจปะทะกับคำเกี่ยวกับสุขภาพ
  //   เช่น "หนัง" ปะทะ "ผื่นผิวหนัง", "เกม" ปะทะ "เกมส์", ฯลฯ
  //   → ใช้คำที่ยาวขึ้นและมี context ชัดเจน
  const IRRELEVANT = [
    'กินข้าวหรือยัง', 'กินข้าว', 'ทานข้าว', 'กินอะไร', 'หิวข้าว', 'หิวแล้ว',
    'ไปเที่ยวไหน', 'ที่เที่ยว', 'แนะนำที่เที่ยว', 'ทำอะไรอยู่', 'เป็นไงบ้าง', 'ช่วงนี้เป็นไง',
    'ขอเพลง', 'ฟังเพลง', 'พยากรณ์อากาศ', 'จีบได้ไหม', 'รักฉันไหม',
    'หวย', 'เลขเด็ด', 'ราคาทอง', 'หุ้น', 'การเมือง', 'เลือกตั้ง',
    'แต่งกลอน', 'แต่งเพลง', 'เขียนโค้ด', 'เขียนโปรแกรม',
    'ดูหนัง', 'หนังเรื่อง', 'ซีรีย์', 'ซีรี่ย์', 'ดูละคร', 'นักแสดง', 'ดูดารา', 'เล่นเกม', 'บอกเกม',
    'อาหารอร่อย', 'ร้านอาหาร', 'แนะนำร้าน', 'เมนูแนะนำ', 'สั่งอาหาร', 'กินอะไรดี'
  ];

  const THANKS = ['ขอบคุณ', 'thanks', 'thank you', 'ขอบใจ', 'ขอบพระคุณ'];

  const containsAny = (text, list) => {
    const t = (text || '').toLowerCase();
    return list.some(k => t.includes(k.toLowerCase()));
  };

  /**
   * จำแนกประเภทข้อความ
   * - ถ้าข้อความมีคำว่า "อาการ" หรือ "ปวด" หรือชื่ออาการใน 32 list → ถือเป็น normal เลย
   *   (กันเคส "ผื่นผิวหนัง" บังเอิญมีตัวอักษร "หนัง" จาก IRRELEVANT)
   * @returns {'redflag' | 'irrelevant' | 'thanks' | 'normal'}
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
    const t = String(text || '');

    if (BLEEDING_MENTION_RE.test(t)) {
      if (MILD_BLEEDING_RE.test(t) && !SEVERE_BLEEDING_RE.test(t)) return false;
      if (SEVERE_BLEEDING_RE.test(t)) return true;
      if (containsAny(t, [
        'เลือดไหลไม่หยุด', 'อาเจียนเป็นเลือด', 'ถ่ายเป็นเลือดแดง', 'ถ่ายเป็นเลือดสด', 'ไอเป็นเลือด'
      ])) return true;
      return false;
    }

    return containsAny(t, RED_FLAGS);
  };

  const isInScreening = (messages) => {
    if (!Array.isArray(messages) || messages.length === 0) return false;
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistant) return false;
    if (lastAssistant.parts?.some(p => p.type === 'question_block' || p.type === 'question')) return true;
    return isScreeningQuestion(lastAssistant.text);
  };

  /** ตรวจคำตอบนอกประเด็น — โดยเฉพาะระหว่างซักประวัติ */
  const isOffTopicInput = (text, options = {}) => {
    const t = String(text || '').trim();
    if (!t) return false;

    if (containsAny(t, SYMPTOMS_32)) return false;
    if (SCREENING_ANSWER_RE.test(t) && containsAny(t, HEALTH_HINTS)) return false;
    if (SCREENING_ANSWER_RE.test(t) && t.length <= 80) return false;

    if (containsAny(t, IRRELEVANT)) {
      if (containsAny(t, HEALTH_HINTS) && !/^(กินข้าว|ทานข้าว|ร้านอาหาร|แนะนำร้าน)/i.test(t)) return false;
      return true;
    }

    if (/^(ช่วย|บอก|แนะนำ).*(ร้าน|อาหาร|เที่ยว|เพลง|เกม|หนัง)/i.test(t)) return true;

    const inScreening = options.inScreening ?? isInScreening(options.messages);
    if (!inScreening) return false;

    if (containsAny(t, HEALTH_HINTS)) return false;

    const CHIT_CHAT_RE = /^(ครับ|ค่ะ|โอเค|ฮะ|อืม|ได้|ดี|สวัสดี|หิว|อยากกิน|ขอบคุณ|555|ฮา|จ้า|ไม่รู้|ไม่ทราบ)/i;
    if (CHIT_CHAT_RE.test(t) && t.length < 60) return true;

    return false;
  };

  /**
   * จำแนกประเภทข้อความ
   * @param {string} text
   * @param {{ messages?: Array, inScreening?: boolean }} [options]
   * @returns {'redflag' | 'irrelevant' | 'thanks' | 'normal'}
   */
  const classifyInput = (text, options = {}) => {
    const ctx = { ...options, inScreening: options.inScreening ?? isInScreening(options.messages) };

    if (isRedFlagInput(text)) return 'redflag';
    if (isOffTopicInput(text, ctx)) return 'irrelevant';
    if (containsAny(text, HEALTH_HINTS)) return 'normal';
    if (containsAny(text, SYMPTOMS_32)) return 'normal';
    if (containsAny(text, THANKS)) return 'thanks';
    if (containsAny(text, IRRELEVANT)) return 'irrelevant';
    return 'normal';
  };

  /** กันหลุด — ถ้า user ตอบนอกเรื่อง ห้าม AI ถามข้อถัดไป */
  const stripOffTopicLeak = (aiOutput, userInput, options = {}) => {
    const ctx = { ...options, inScreening: options.inScreening ?? isInScreening(options.messages) };
    if (!isOffTopicInput(userInput, ctx)) return aiOutput;
    if (isScreeningQuestion(aiOutput) || /🩺\s*ข้อ\s*\d+/i.test(String(aiOutput || ''))) {
      return REPLY_IRRELEVANT;
    }
    return aiOutput;
  };

  // ข้อความสำเร็จรูป
  const REPLY_REDFLAG =
    '🚨 อาการที่คุณแจ้งมาอาจมีความเสี่ยงสูง เพื่อความปลอดภัยกรุณาติดต่อเภสัชกรของเราทันที ' +
    'หรือถ้ารู้สึกแย่ลงให้ไปโรงพยาบาลที่ใกล้ที่สุดค่ะ';

  const REPLY_IRRELEVANT =
    'ขออภัยค่ะ telebot ตอบได้เฉพาะเรื่องสุขภาพและอาการเจ็บป่วยเล็กน้อย 32 อาการบัตรทองเท่านั้น ' +
    'กรุณาตอบคำถามเกี่ยวกับอาการที่กำลังซักอยู่ หรือบอกอาการของคุณใหม่ค่ะ';

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
    const rawLines = normalizeMessageText(text).split(/\r?\n/);

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

      parts.push({ type: 'text', text: clean });
      i++;
    }
    return parts;
  };

  const getOptions = (hint) => splitOptions(hint);

  /** จัดประเภท + parse สำหรับบันทึก/โหลด UI */
  const classifyAssistantMessage = (text) => {
    const cleaned = normalizeMessageText(text);
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
    }
    const m = String(text).match(/ข้อ(?:ที่)?\s*(\d+)/i);
    return m ? parseInt(m[1], 10) : 0;
  };

  /** นับความคืบหน้าการซักประวัติ 5 ข้อ */
  const getChatProgress = (messages) => {
    const asked = new Set();
    let userAnswers = 0;
    let inScreening = false;

    for (const msg of messages || []) {
      if (msg.role === 'assistant') {
        const n = extractQuestionNumber(msg);
        if (n > 0 || isScreeningQuestion(msg.text)) {
          inScreening = true;
          if (n > 0) asked.add(n);
        }
      } else if (msg.role === 'user' && inScreening) {
        userAnswers++;
      }
    }

    const highestAsked = asked.size ? Math.max(...asked) : 0;
    const nextQ = Math.min(highestAsked + 1, SCREENING_TOTAL + 1);
    const readyForSummary = userAnswers >= SCREENING_TOTAL;

    return { highestAsked, userAnswers, nextQ, readyForSummary, total: SCREENING_TOTAL };
  };

  /** แนบ hint ให้ n8n รู้ว่าควรถามข้อไหน — กันถามซ้ำ + บังคับ 1 คำถามย่อย */
  const buildScreeningHint = (messages, symptomName = '') => {
    const p = getChatProgress(messages);
    const sym = symptomName && symptomName !== 'ทั่วไป' ? `อาการ: ${symptomName}` : '';

    if (p.readyForSummary) {
      return `[HINT] ${sym} เก็บครบ ${SCREENING_TOTAL} ข้อแล้ว → ออกสรุป 📋 ทันที ห้ามถามต่อ`.trim();
    }
    if (p.highestAsked === 0) {
      return `[HINT] ${sym} เริ่มซักประวัติ → ส่งข้อ 1 เท่านั้น (คำถามย่อย 1 ข้อ) หัวข้อ: ลักษณะอาการหลัก`.trim();
    }
    if (p.nextQ > SCREENING_TOTAL) {
      return `[HINT] ${sym} ครบ ${SCREENING_TOTAL} ข้อแล้ว → ออกสรุป 📋 ทันที`.trim();
    }

    const topics = {
      1: 'ลักษณะอาการหลัก',
      2: 'ความรุนแรงและระยะเวลา',
      3: 'ปัจจัยและบริบท',
      4: 'อาการร่วมและประวัติ',
      5: 'การดูแลตัวเองและผลกระทบ',
    };

    return `[HINT] ${sym} User ตอบข้อ ${p.highestAsked} แล้ว → ส่งข้อ ${p.nextQ} ทันที (คำถามย่อย 1 ข้อเท่านั้น) หัวข้อ: ${topics[p.nextQ] || 'ถัดไป'} ห้ามถามซ้ำข้อ ${p.highestAsked}`.trim();
  };

  return {
    SYMPTOMS_32,
    RED_FLAGS,
    IRRELEVANT,
    THANKS,
    classifyInput,
    isRedFlagInput,
    isOffTopicInput,
    isInScreening,
    stripOffTopicLeak,
    normalizeMessageText,
    parseAiMessage,
    getOptions,
    classifyAssistantMessage,
    buildAssistantMeta,
    buildScreeningHint,
    getChatProgress,
    SCREENING_TOTAL,
    isScreeningQuestion,
    REPLY_REDFLAG,
    REPLY_IRRELEVANT,
    REPLY_THANKS
  };
}
