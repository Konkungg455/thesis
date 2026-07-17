import { isAdultContentInput } from '../../utils/chatAdultContentFilter';

type ValidateInput = {
    symptom: string;
    questionNum: number;
    questionText: string;
    userAnswer: string;
    locale?: string;
};

type ValidateResult = {
    valid: boolean;
    source: 'heuristic' | 'fallback';
    hint?: string;
};

const PROFANITY_RE = /(ควย|เหี้ย|สัส+|ระยำ|ชาติ\s*หมา|หน้าหี|จิ๋ม|เย็ด|ชิบหาย|เชี่ย|เชี้ย|แม่ง|อีห่า|ไอ้สัตว์|ไอ้เวร|พ่อมึง|แม่มึง|\bf+u+c+k|\bshit\b|\bbitch\b)/i;

function heuristicValidate(input: ValidateInput): ValidateResult {
    const answer = String(input.userAnswer || '').trim();
    if (!answer) return { valid: false, source: 'heuristic', hint: 'empty' };
    if (isAdultContentInput(answer)) return { valid: false, source: 'heuristic', hint: 'adult' };
    if (PROFANITY_RE.test(answer)) return { valid: false, source: 'heuristic', hint: 'profanity' };
    return { valid: true, source: 'heuristic' };
}

export async function validateScreeningAnswer(
    _config: ReturnType<typeof useRuntimeConfig>,
    input: ValidateInput,
): Promise<ValidateResult> {
    return heuristicValidate(input);
}
