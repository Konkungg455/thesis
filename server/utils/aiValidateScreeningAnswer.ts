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
    source: 'heuristic' | 'ai' | 'fallback';
    hint?: string;
};

const PROFANITY_RE = /(ควย|เหี้ย|สัส+|ระยำ|ชาติ\s*หมา|หน้าหี|จิ๋ม|เย็ด|ชิบหาย|เชี่ย|เชี้ย|แม่ง|อีห่า|ไอ้สัตว์|ไอ้เวร|พ่อมึง|แม่มึง|\bf+u+c+k|\bshit\b|\bbitch\b)/i;

function hasSpamRepetition(raw: string, compact: string): boolean {
    if (/ๆ{2,}/.test(raw)) return true;
    if (new RegExp('(.)\\1{3,}', 'u').test(compact)) return true;
    if (/^(555+|666+|ฮา+|haha+|hehe+|lol+|wow+|omg+|เทพ+|เจ๋+|โคตร+|แจ่ม+|cool+|nice+|okok+|yesyes+)[ๆ]*$/iu.test(compact)) {
        return true;
    }
    if (/^[ก-ฮ]{1,4}ๆ+$/u.test(compact)) return true;
    return false;
}

function isGibberishInput(text: string): boolean {
    const t = String(text || '').trim();
    if (!t) return true;
    if (t.length <= 1 || /^[\?\.\!\,\s]+$/.test(t)) return true;
    if (/^[\d\s]+$/.test(t) && /\d/.test(t)) return true;
    if (/^[\s\.\,\!\?\-\+\=\*\#\@\%\^\&\(\)\[\]\{\}\|\\\:\;\"\'\<\>\/\~\`_]+$/.test(t)) return true;

    const compact = t.replace(/\s+/g, '');
    if (hasSpamRepetition(t, compact)) return true;
    if (/[ก-๙]/.test(t)) {
        const vowelCount = (t.match(/[าิีึืุูเแโใไ]/g) || []).length;
        if (compact.length <= 40) return false;
        if (compact.length >= 6 && vowelCount === 0) return true;
        return false;
    }

    if (/^[a-zA-Z\s]+$/.test(t) && compact.length >= 6) {
        const vowels = (t.match(/[aeiouAEIOU]/g) || []).length;
        const ratio = vowels / compact.length;
        if (/^(ok|okay|yes|no|none|pain|hurt|mild|moderate|severe|today|yesterday|help|rest|food|sleep|stress|unknown|unsure|maybe|headache|fever|cough|nausea|dizzy|better|worse)$/i.test(compact)) {
            return false;
        }
        if (!/\s/.test(t) && compact.length >= 7 && ratio < 0.38) return true;
        if (vowels === 0) return true;
        if (compact.length >= 12 && ratio <= 0.25) return true;
        if (/^([b-df-hj-np-tv-xz]{2,6})\1+$/i.test(compact)) return true;
    }

    return false;
}

function isJokeAnswerInput(text: string): boolean {
    const t = String(text || '').trim();
    if (!t) return false;
    const alwaysIrrelevant = [
        'ปวดขี้', 'ปวดตด', 'ปวดง่วง', 'ปวดเบื่อ', 'ปวดรัก', 'ปวดเงิน', 'ปวดสอบ',
        'ปวดการบ้าน', 'ปวดเกม', 'ปวดมือถือ', 'ปวดwifi', 'ปวดเน็ต',
        'อยากขี้', 'อยากอึ', 'เล่าเรื่องผี', 'มุกตลก', 'ทายใจ', 'เป่ายิ้งฉุบ',
        'จีบได้ไหม', 'รักฉันไหม', 'มีแฟนหรือยัง', 'ทีเด็ดบอล', 'แทงบอล',
        'หวย', 'เลขเด็ด', 'ดูดวง', 'แต่งกลอน', 'เขียนโค้ด',
    ];
    const lower = t.toLowerCase();
    if (alwaysIrrelevant.some((k) => lower.includes(k.toLowerCase()))) return true;
    if (/ปวด\s*(ขี้|ตด|อึ|ง่วง|เบื่อ|รัก|เงิน|สอบ|การบ้าน|เกม|มือถือ|wifi|เน็ต|ใจ)/i.test(t)) return true;
    if (/^(กินข้าว|ทานข้าว|ร้านอาหาร|แนะนำร้าน|ขอเพลง|ดูหนัง|เล่นเกม|หวย|ดูดวง|จีบได้ไหม|รักฉันไหม)/i.test(t)) return true;
    return false;
}

function heuristicValidate(input: ValidateInput): ValidateResult | null {
    const answer = String(input.userAnswer || '').trim();
    if (!answer) return { valid: false, source: 'heuristic', hint: 'empty' };
    if (isAdultContentInput(answer)) return { valid: false, source: 'heuristic', hint: 'adult' };
    if (PROFANITY_RE.test(answer)) return { valid: false, source: 'heuristic', hint: 'profanity' };
    if (isGibberishInput(answer)) return { valid: false, source: 'heuristic', hint: 'gibberish' };
    if (isJokeAnswerInput(answer)) return { valid: false, source: 'heuristic', hint: 'joke' };
    return { valid: true, source: 'heuristic' };
}

function aiApiKey(config: ReturnType<typeof useRuntimeConfig>): string {
    return String(process.env.NUXT_AI_API_KEY || config.aiApiKey || '').trim();
}

function aiModel(config: ReturnType<typeof useRuntimeConfig>): string {
    const fromEnv = String(process.env.NUXT_AI_MODEL || config.aiModel || '').trim();
    if (fromEnv) return fromEnv;
    const provider = String(process.env.NUXT_AI_PROVIDER || config.aiProvider || 'groq').trim().toLowerCase();
    return provider === 'gemini' ? 'gemini-2.0-flash' : 'llama-3.3-70b-versatile';
}

function parseAiJson(text: string): ValidateResult | null {
    const raw = String(text || '').trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
        const parsed = JSON.parse(match[0]) as { valid?: boolean; hint?: string };
        if (typeof parsed.valid !== 'boolean') return null;
        return {
            valid: parsed.valid,
            source: 'ai',
            hint: parsed.hint ? String(parsed.hint) : undefined,
        };
    } catch {
        return null;
    }
}

async function callGroqValidate(
    config: ReturnType<typeof useRuntimeConfig>,
    input: ValidateInput,
): Promise<ValidateResult | null> {
    const key = aiApiKey(config);
    if (!key) return null;

    const provider = String(process.env.NUXT_AI_PROVIDER || config.aiProvider || 'groq').trim().toLowerCase();
    if (provider === 'gemini') return null;

    const base = String(process.env.NUXT_AI_BASE_URL || config.aiBaseUrl || 'https://api.groq.com/openai/v1').trim();
    const model = aiModel(config);
    const locale = String(input.locale || 'th').toLowerCase() === 'en' ? 'en' : 'th';
    const system = [
        'You validate patient answers during telehealth symptom screening.',
        'Reply ONLY with compact JSON: {"valid":true} or {"valid":false,"hint":"gibberish"}.',
        'valid=false ONLY for gibberish keyboard mash, digits-only, or punctuation-only replies.',
        'valid=true for any real-language answer including "ไม่รู้", "ไม่ทราบ", off-topic chat, or short polite replies.',
    ].join(' ');

    const user = [
        `Locale: ${locale}`,
        `Locked symptom: ${input.symptom}`,
        `Question number: ${input.questionNum}`,
        `Question:\n${input.questionText}`,
        `Patient answer:\n${input.userAnswer}`,
    ].join('\n\n');

    const res = await $fetch<{
        choices?: Array<{ message?: { content?: string } }>;
    }>(`${base.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
        },
        body: {
            model,
            temperature: 0,
            max_tokens: 120,
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: user },
            ],
        },
        timeout: 20_000,
    });

    return parseAiJson(res?.choices?.[0]?.message?.content || '');
}

export async function validateScreeningAnswer(
    config: ReturnType<typeof useRuntimeConfig>,
    input: ValidateInput,
): Promise<ValidateResult> {
    const heuristic = heuristicValidate(input);
    if (heuristic && !heuristic.valid) return heuristic;
    if (heuristic?.valid) return heuristic;

    try {
        const ai = await callGroqValidate(config, input);
        if (ai) return ai;
    } catch (err) {
        console.warn('[ai-validate-answer] AI failed, using fallback:', err);
    }

    return { valid: true, source: 'fallback' };
}
