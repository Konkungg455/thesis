import { getTelebotSystemPrompt } from './telebotSystemPrompt';

type CloudProvider = 'groq' | 'openai' | 'gemini';

function aiApiKey(config: ReturnType<typeof useRuntimeConfig>): string {
    return String(process.env.NUXT_AI_API_KEY || config.aiApiKey || '').trim();
}

function aiProvider(config: ReturnType<typeof useRuntimeConfig>): CloudProvider {
    const p = String(process.env.NUXT_AI_PROVIDER || config.aiProvider || 'groq').trim().toLowerCase();
    if (p === 'openai' || p === 'gemini') return p;
    return 'groq';
}

function aiModel(config: ReturnType<typeof useRuntimeConfig>): string {
    const fromEnv = String(process.env.NUXT_AI_MODEL || config.aiModel || '').trim();
    if (fromEnv) return fromEnv;
    return aiProvider(config) === 'gemini'
        ? 'gemini-2.0-flash'
        : 'llama-3.3-70b-versatile';
}

/** Vercel / production — ใช้ cloud LLM แทน n8n+ngrok */
export function shouldUseCloudAi(config: ReturnType<typeof useRuntimeConfig>): boolean {
    const mode = String(process.env.NUXT_AI_MODE || config.aiMode || '').trim().toLowerCase();
    if (mode === 'n8n') return false;
    if (mode === 'cloud') return true;

    // บน Vercel ใช้ cloud เสมอ (ไม่ fallback ไป n8n/ngrok)
    if (process.env.VERCEL) return true;

    return false;
}

export function hasAiApiKey(config: ReturnType<typeof useRuntimeConfig>): boolean {
    return Boolean(aiApiKey(config));
}

async function callOpenAiCompatible(
    baseUrl: string,
    apiKey: string,
    model: string,
    chatInput: string,
): Promise<string> {
    const res = await $fetch<{
        choices?: Array<{ message?: { content?: string } }>;
    }>(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: {
            model,
            temperature: 0.2,
            messages: [
                { role: 'system', content: getTelebotSystemPrompt() },
                { role: 'user', content: chatInput },
            ],
        },
        timeout: 120_000,
    });

    const text = res?.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('empty AI response');
    return text;
}

async function callGemini(apiKey: string, model: string, chatInput: string): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await $fetch<{
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    }>(url, {
        method: 'POST',
        body: {
            systemInstruction: { parts: [{ text: getTelebotSystemPrompt() }] },
            contents: [{ role: 'user', parts: [{ text: chatInput }] }],
            generationConfig: { temperature: 0.2 },
        },
        timeout: 120_000,
    });

    const text = res?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) throw new Error('empty Gemini response');
    return text;
}

export async function callCloudAi(
    config: ReturnType<typeof useRuntimeConfig>,
    chatInput: string,
): Promise<{ output: string }> {
    const key = aiApiKey(config);
    if (!key) {
        throw createError({
            statusCode: 503,
            statusMessage: 'ตั้ง NUXT_AI_API_KEY บน Vercel (Groq ฟรี: console.groq.com)',
        });
    }

    const provider = aiProvider(config);
    const model = aiModel(config);

    let output: string;
    if (provider === 'gemini') {
        output = await callGemini(key, model, chatInput);
    } else if (provider === 'openai') {
        const base = String(process.env.NUXT_AI_BASE_URL || config.aiBaseUrl || 'https://api.openai.com/v1').trim();
        output = await callOpenAiCompatible(base, key, model, chatInput);
    } else {
        const base = String(process.env.NUXT_AI_BASE_URL || config.aiBaseUrl || 'https://api.groq.com/openai/v1').trim();
        output = await callOpenAiCompatible(base, key, model, chatInput);
    }

    return { output };
}

export function cloudAiStatus(config: ReturnType<typeof useRuntimeConfig>) {
    return {
        enabled: shouldUseCloudAi(config),
        provider: aiProvider(config),
        model: aiModel(config),
        hasKey: Boolean(aiApiKey(config)),
    };
}
