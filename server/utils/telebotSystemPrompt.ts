import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let cached: string | null = null;

/** โหลด system prompt จาก n8n_system_prompt.txt (5 ข้อ flat — ตรงกับ useAiChatRules) */
export function getTelebotSystemPrompt(): string {
    if (cached) return cached;

    try {
        const path = join(process.cwd(), 'n8n_system_prompt.txt');
        cached = readFileSync(path, 'utf-8');
        return cached;
    } catch {
        cached = 'คุณคือ telebot ผู้ช่วยซักประวัติอาการ 32 อาการบัตรทอง ตอบภาษาไทย ถามทีละข้อ format 🩺 ข้อ N: คำถามย่อย 1 ข้อเท่านั้น หลังครบ 5 ข้อให้สรุป 📋';
        return cached;
    }
}
