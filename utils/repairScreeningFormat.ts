import {
    formatFixedScreeningQuestion,
    isHallucinatedScreeningText,
    normalizeSymptomKey,
} from './fixedScreeningQuestions';

const SCREENING_TOPICS: Record<number, string> = {
    1: 'ลักษณะอาการหลัก',
    2: 'ความรุนแรงและระยะเวลา',
    3: 'ปัจจัยและบริบท',
    4: 'อาการร่วมและประวัติ',
    5: 'การดูแลตัวเองและผลกระทบ',
};

function hasSubQuestionBullet(text: string): boolean {
    return /\n\s*[*•·\-]\s+.+\?/m.test(text);
}

function extractSymptom(contextInput: string): string {
    const hint = String(contextInput || '');
    const locked = hint.match(/\[LOCKED_TOPIC\]\s*(?:อาการที่เลือก|symptom):\s*([^\n\—\-\(]+)/i);
    if (locked?.[1]) return normalizeSymptomKey(locked[1].trim());
    const m = hint.match(/(?:อาการ(?:ที่เลือก)?|symptom)\s*:\s*([^\n\[]+)/i);
    const fromHint = (m?.[1] || '').trim();
    return normalizeSymptomKey(fromHint || hint);
}

function extractQuestionNum(text: string): number {
    const m = String(text || '').match(/(?:ข้อ(?:ที่)?|question)\s*(\d+)/i);
    return m ? Number(m[1]) : 0;
}

function extractHintQuestionNum(contextInput: string): number {
    const t = String(contextInput || '');
    const m = t.match(/ส่งข้อ\s*(\d+)/i) || t.match(/ข้อ\s*(\d+)\s*ทันที/i) || t.match(/เริ่ม.*ข้อ\s*1/i) || t.match(/question\s*(\d+)/i);
    if (/เริ่มคัดกรอง|ส่งข้อ 1|start screening/i.test(t)) return 1;
    return m ? Number(m[1]) : 0;
}

function extractLocale(contextInput: string): 'th' | 'en' {
    if (/\[OUTPUT_LANG\]\s*English/i.test(String(contextInput || ''))) return 'en';
    return 'th';
}

function normalizeLines(text: string): string[] {
    return String(text || '')
        .replace(/\\n/g, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/([^\n])\s*((?:🩺\s*)?(?:ข้อ(?:ที่)?|question)\s*\d+\s*[:：])/gi, '$1\n$2')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
}

function extractGender(contextInput: string): string {
    const m = String(contextInput || '').match(/เพศ:\s*([^\n|]+)/i)
        || String(contextInput || '').match(/gender:\s*([^\n|]+)/i);
    return (m?.[1] || '').trim();
}

/** แปลงคำถาม AI ที่หลอน ให้เป็นคำถาม fix มาตรฐาน */
export function repairScreeningFormat(text: string, contextInput = ''): string {
    const raw = String(text || '').trim();
    if (!raw) return raw;
    if (/📋|สรุปอาการ|Preliminary symptom summary|symptom summary/i.test(raw)) return raw;
    if (/🚨|อาการเสี่ยง|พบเภสัชกรทันที|emergency|high-risk/i.test(raw)) return raw;

    const symptom = extractSymptom(contextInput);
    const locale = extractLocale(contextInput);
    const genderOpts = { gender: extractGender(contextInput), locale };
    const fromText = extractQuestionNum(raw);
    const fromHint = extractHintQuestionNum(contextInput);
    const qNum = fromText || fromHint || 1;

    // หลอน placeholder / วนซ้ำ → เปลี่ยนเป็นคำถาม fix ทั้งก้อน
    if (isHallucinatedScreeningText(raw)) {
        const fixed = formatFixedScreeningQuestion(symptom || 'ทั่วไป', qNum, genderOpts);
        return fixed || raw;
    }

    if (!/(?:ข้อ|question)\s*\d+\s*[:：]/i.test(raw)) return raw;
    if (hasSubQuestionBullet(raw) && /รบกวนตอบคำถาม|Please answer the questions/i.test(raw)) {
        // มีรูปแบบครบอยู่แล้ว แต่ถ้ามี symptom ให้บังคับเป็นข้อความ fix
        if (symptom) {
            const fixed = formatFixedScreeningQuestion(symptom, fromText || qNum, genderOpts);
            if (fixed) return fixed;
        }
        return raw;
    }

    // ไม่มี bullet / format พัง → ใช้คำถาม fix
    if (symptom) {
        const fixed = formatFixedScreeningQuestion(symptom, fromText || qNum, genderOpts);
        if (fixed) return fixed;
    }

    const lines = normalizeLines(raw);
    const headerIdx = lines.findIndex((line) => /(?:ข้อ|question)\s*\d+\s*[:：]/i.test(line));
    if (headerIdx < 0) return raw;

    const headerLine = lines[headerIdx].replace(/\*\*/g, '');
    const hm = headerLine.match(/^(?:🩺\s*)?(?:ข้อ(?:ที่)?|question)\s*(\d+)\s*[:：]\s*(.+?)\??\s*$/i);
    if (!hm) return raw;

    const num = Number(hm[1]);
    const fixed = formatFixedScreeningQuestion('ทั่วไป', num, genderOpts);
    if (fixed) return fixed;

    if (locale === 'en') {
        return [
            `🩺 Question ${num}: ${hm[2].trim()}?`,
            '',
            `* ${hm[2].trim().replace(/\?+$/, '')}? (e.g. mild, moderate, severe, unknown)`,
            '',
            'Please answer the questions below.',
        ].join('\n');
    }

    const topic = SCREENING_TOPICS[num] || hm[2].trim();
    return [
        `🩺 ข้อ ${num}: ${topic}?`,
        '',
        `* ${hm[2].trim().replace(/\?+$/, '')}? (เช่น เล็กน้อย, ปานกลาง, รุนแรง, ไม่ทราบ)`,
        '',
        'รบกวนตอบคำถามเหล่านี้ให้ผมทราบนะครับ',
    ].join('\n');
}
