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

const HEALTH_ANSWER_RE = /ห้องหมุน|หมุน|มึนหัว|ทรงตัว|ตุบ|ตื้อ|แปลบ|คลื่นไส้|ท้องเสีย|ไอ|เจ็บคอ|ผื่น|คัน|แดง|บวม|ชา|เหน็บ|เวียน|รู้สึก|เหมือน|เริ่ม|เป็น|มี|ไม่|เคย|ไม่เคย|\d|ชั่วโมง|นาที|วัน|สัปดาห์|เดือน|pain|ache|fever|mild|moderate|severe|better|worse|unknown|dizzy|headache|nausea/i;

function heuristicValidate(input: ValidateInput): ValidateResult | null {
    const answer = String(input.userAnswer || '').trim();
    const question = String(input.questionText || '').trim();
    if (!answer || !question) return { valid: false, source: 'heuristic', hint: 'empty' };

    if (answer.length <= 1 || /^[\?\.\!\,\s]+$/.test(answer)) {
        return { valid: false, source: 'heuristic', hint: 'too_short' };
    }

    if (/^(ครับ|ค่ะ|โอเค|ฮะ|อืม|ได้|ดี|555|ฮา|จ้า)$/i.test(answer)) {
        return { valid: false, source: 'heuristic', hint: 'chit_chat' };
    }

    if (/^(กินข้าว|ทานข้าว|ร้านอาหาร|แนะนำร้าน|ขอเพลง|ดูหนัง|เล่นเกม|หวย|ดูดวง)/i.test(answer)) {
        return { valid: false, source: 'heuristic', hint: 'irrelevant' };
    }

    const compact = answer.replace(/\s+/g, '');
    const vowelCount = (answer.match(/[าิีึืุูเแโใไ]/g) || []).length;
    if (compact.length >= 4 && vowelCount === 0 && !HEALTH_ANSWER_RE.test(answer)) {
        return { valid: false, source: 'heuristic', hint: 'gibberish' };
    }

    if (HEALTH_ANSWER_RE.test(answer) || answer.length >= 8) {
        return { valid: true, source: 'heuristic' };
    }

    return null;
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
        'Reply ONLY with compact JSON: {"valid":true} or {"valid":false,"hint":"short reason in Thai or English matching locale"}.',
        'valid=true when the answer reasonably addresses the current screening question about the locked symptom.',
        'valid=false for gibberish, unrelated topics, jokes, single letters, or answers that ignore the question.',
        'Mentioning feelings, duration, severity, triggers, or related body sensations counts as valid.',
        'Do not require perfect grammar. Accept descriptive answers about vertigo/spinning even without exact medical terms.',
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

    try {
        const ai = await callGroqValidate(config, input);
        if (ai) return ai;
    } catch (err) {
        console.warn('[ai-validate-answer] AI failed, using fallback:', err);
    }

    if (heuristic?.valid) return heuristic;
    return { valid: false, source: 'fallback', hint: 'unclear' };
}
