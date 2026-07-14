import { TELEBOT_SYSTEM_PROMPT } from './telebotPromptEmbedded';

let cached: string | null = null;

const FALLBACK = `คุณคือ telebot ผู้ช่วยซักประวัติอาการ 32 อาการบัตรทอง
ตอบภาษาตาม [OUTPUT_LANG] ที่ระบบแนบมา (Thai หรือ English)

รูปแบบคำถามบังคับ (เว็บเป็นผู้ถามข้อ 1-5):
🩺 ข้อ N: / 🩺 Question N:

* <คำถามย่อย>? (เช่น ...)/(e.g. ...)

รบกวนตอบคำถามเหล่านี้ให้ผมทราบนะครับ / Please answer the questions below.

กฎ: ห้ามสร้างคำถามคัดกรองเอง หลังครบ 5 ข้อออกสรุป 📋 ตามภาษาที่ระบุ`;

/** โหลด system prompt สำหรับ cloud AI (Groq บน Vercel) */
export function getTelebotSystemPrompt(): string {
    if (cached) return cached;
    const embedded = String(TELEBOT_SYSTEM_PROMPT || '').trim();
    cached = embedded.length > 500 ? embedded : FALLBACK;
    return cached;
}
