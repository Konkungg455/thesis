const SCREENING_TOPICS: Record<number, string> = {
    1: 'ลักษณะอาการหลัก',
    2: 'ความรุนแรงและระยะเวลา',
    3: 'ปัจจัยและบริบท',
    4: 'อาการร่วมและประวัติ',
    5: 'การดูแลตัวเองและผลกระทบ',
};

type QuestionTemplate = { header: string; sub: string; hint: string };

const SYMPTOM_Q1: Record<string, QuestionTemplate> = {
    'ท้องเสีย': {
        header: 'ลักษณะอาการท้องเสีย',
        sub: 'ถ่ายวันละกี่ครั้งและลักษณะอุจจาระ',
        hint: '1-2 ครั้งเหลว, 3-5 ครั้งเป็นน้ำ, 6-10 ครั้งมีเมือก, มีเลือดปนนิดหน่อย',
    },
    'ปวดท้อง': {
        header: 'ลักษณะอาการปวดท้อง',
        sub: 'ปวดตรงไหนและปวดแบบไหน',
        hint: 'ท้องบนปวดบีบ, ท้องล่างปวดตื้อ, รอบสะดือปวดแสบ, ปวดทั้งท้อง',
    },
    'ปวดศีรษะ': {
        header: 'ลักษณะอาการปวดหัว',
        sub: 'คุณปวดหัวแบบไหน',
        hint: 'ปวดตุบๆ, ปวดตื้อ, ปวดแปลบ, ปวดรอบหัว',
    },
    'เวียนศีรษะ': {
        header: 'ลักษณะอาการเวียนศีรษะ',
        sub: 'คุณรู้สึกแบบไหน',
        hint: 'ห้องหมุน, มึนหัว, ทรงตัวไม่ได้, จะเป็นลม',
    },
    'ผื่นคัน': {
        header: 'ลักษณะของผื่น',
        sub: 'ผื่นเป็นแบบไหนและอยู่ตรงไหน',
        hint: 'คันมากที่แขน, แดงที่ลำตัว, ตุ่มใสที่ใบหน้า, ลมพิษ',
    },
    'ไข้': {
        header: 'ลักษณะอาการ',
        sub: 'อาการหลักเป็นแบบไหน',
        hint: 'ไข้, ไอ, เจ็บคอ, ไข้+ไอ',
    },
    'ไอ': {
        header: 'ลักษณะอาการ',
        sub: 'อาการหลักเป็นแบบไหน',
        hint: 'ไข้, ไอ, เจ็บคอ, ไข้+ไอ',
    },
    'เจ็บคอ': {
        header: 'ลักษณะอาการ',
        sub: 'อาการหลักเป็นแบบไหน',
        hint: 'ไข้, ไอ, เจ็บคอ, ไข้+ไอ',
    },
};

function hasSubQuestionBullet(text: string): boolean {
    return /\n\s*[*•·\-]\s+.+\?/m.test(text);
}

function extractSymptom(contextInput: string): string {
    const hint = String(contextInput || '');
    const m = hint.match(/อาการ:\s*([^\n\[]+)/i);
    const fromHint = (m?.[1] || '').trim();
    const combined = `${fromHint}\n${hint}`.toLowerCase();
    for (const key of Object.keys(SYMPTOM_Q1)) {
        if (combined.includes(key.toLowerCase())) return key;
    }
    return '';
}

function guessOptionHints(subText: string, questionNum: number): string {
    const t = subText.toLowerCase();
    if (/ท้องเสีย|ถ่าย|อุจจาระ/.test(t)) {
        return '1-2 ครั้งเหลว, 3-5 ครั้งเป็นน้ำ, มีเลือดปนนิดหน่อย, ไม่มีเลือด';
    }
    if (/เลือด/.test(t)) {
        return 'ไม่มีเลือด, ปนเลือดนิดหน่อย, มีเลือดมาก, ไม่ทราบ';
    }
    if (/นาน|เมื่อไหร่|เริ่ม|กี่วัน|ชั่วโมง/.test(t)) {
        return 'วันนี้, เมื่อวาน, 2-3 วัน, มากกว่า 1 สัปดาห์';
    }
    if (/รุนแรง|เจ็บ|ปวด/.test(t)) {
        return 'เล็กน้อย, ปานกลาง, รุนแรง, ทนทานได้';
    }
    if (questionNum === 3) return 'อาหาร, ยา, พักผ่อน, ไม่ทราบ';
    if (questionNum === 4) return 'ไม่มี, มีไข้ร่วม, มีอาเจียน, เคยเป็นมาก่อน';
    if (questionNum === 5) return 'ยังทำงานได้, กระทบมาก, กินยาเอง, ยังไม่ได้ดูแล';
    return 'เล็กน้อย, ปานกลาง, รุนแรง, ไม่ทราบ';
}

function pickTemplate(symptom: string, questionNum: number): QuestionTemplate | null {
    if (questionNum !== 1 || !symptom) return null;
    return SYMPTOM_Q1[symptom] || null;
}

function normalizeLines(text: string): string[] {
    return String(text || '')
        .replace(/\\n/g, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/([^\n])\s*((?:🩺\s*)?ข้อ(?:ที่)?\s*\d+\s*[:：])/gi, '$1\n$2')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
}

/** แปลงคำถาม AI ที่หลอน (ไม่มี * คำถามย่อย) ให้เป็นรูปแบบมาตรฐาน */
export function repairScreeningFormat(text: string, contextInput = ''): string {
    const raw = String(text || '').trim();
    if (!raw) return raw;
    if (!/ข้อ\s*\d+\s*[:：]/i.test(raw)) return raw;
    if (hasSubQuestionBullet(raw)) return raw;
    if (/📋|สรุปอาการ/i.test(raw)) return raw;
    if (/🚨|อาการเสี่ยง|พบเภสัชกรทันที/i.test(raw)) return raw;

    const lines = normalizeLines(raw);
    const headerIdx = lines.findIndex((line) => /ข้อ\s*\d+\s*[:：]/i.test(line));
    if (headerIdx < 0) return raw;

    const headerLine = lines[headerIdx].replace(/\*\*/g, '');
    const hm = headerLine.match(/^(?:🩺\s*)?ข้อ(?:ที่)?\s*(\d+)\s*[:：]\s*(.+?)\??\s*$/i);
    if (!hm) return raw;

    const num = Number(hm[1]);
    const body = hm[2].trim();
    const symptom = extractSymptom(contextInput);
    const template = pickTemplate(symptom, num);

    let topic = SCREENING_TOPICS[num] || 'รายละเอียดอาการ';
    let subText = body.replace(/\?+$/, '');
    let hint = '';

    if (template) {
        topic = template.header;
        subText = template.sub;
        hint = template.hint;
    } else {
        const parenM = body.match(/^(.+?)\s*\((?:เช่น|ตัวอย่าง)?\s*(.+?)\)\s*$/i);
        if (parenM) {
            subText = parenM[1].trim().replace(/\?+$/, '');
            hint = parenM[2].trim();
        }
        const looksLikeFullQuestion = body.length > 28 || /คุณ|ไหม|หรือ|และ/.test(body);
        if (looksLikeFullQuestion && SCREENING_TOPICS[num]) {
            topic = SCREENING_TOPICS[num];
        }
        if (!hint) hint = guessOptionHints(subText, num);
    }

    const hasClosing = lines.slice(headerIdx + 1).some((line) => /รบกวนตอบคำถาม/i.test(line));
    const prefix = lines.slice(0, headerIdx).join('\n');
    const rebuilt = [
        prefix,
        `🩺 ข้อ ${num}: ${topic}?`,
        '',
        `* ${subText}? (เช่น ${hint})`,
        hasClosing ? '' : 'รบกวนตอบคำถามเหล่านี้ให้ผมทราบนะครับ',
    ].filter((line, idx, arr) => !(line === '' && idx === arr.length - 1)).join('\n');

    return rebuilt.trim();
}
