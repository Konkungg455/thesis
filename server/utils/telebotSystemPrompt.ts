import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let cached: string | null = null;

/** โหลด system prompt เดียวกับ n8n workflow */
export function getTelebotSystemPrompt(): string {
    if (cached) return cached;

    try {
        const jsonPath = join(process.cwd(), 'n8n_workflow_telebot_chat.json');
        const json = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
            nodes?: Array<{ type?: string; parameters?: { options?: { systemMessage?: string } } }>;
        };
        const agent = json.nodes?.find((n) => String(n.type || '').includes('agent'));
        const msg = agent?.parameters?.options?.systemMessage;
        if (msg) {
            cached = msg;
            return msg;
        }
    } catch {
        // fallback below
    }

    cached = 'คุณคือ telebot ผู้ช่วยซักประวัติอาการ 32 อาการบัตรทอง ตอบภาษาไทย ถามทีละข้อตาม format 🩺 ข้อ N:';
    return cached;
}
