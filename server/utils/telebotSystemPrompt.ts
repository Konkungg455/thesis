import { TELEBOT_SYSTEM_PROMPT } from './telebotPromptEmbedded';

let cached: string | null = null;

const FALLBACK = `คุณคือ telebot ผู้ช่วยซักประวัติอาการ 32 อาการบัตรทอง ตอบภาษาไทยเท่านั้น

รูปแบบคำถามบังคับ (ห้ามเปลี่ยน):
🩺 ข้อ N: <หัวข้อรวม>?

* <คำถามย่อย 1 ข้อ>? (เช่น ตัวเลือก1, ตัวเลือก2, ตัวเลือก3, ตัวเลือก4)

รบกวนตอบคำถามเหล่านี้ให้ผมทราบนะครับ

กฎ: 1 message = 1 ข้อใหญ่ + คำถามย่อย 1 บรรทัดขึ้นต้นด้วย "* " เท่านั้น ห้ามรวมหลายคำถามในบรรทัดหัวข้อ ถามทีละข้อ 1-5 แล้วสรุป 📋`;

/** โหลด system prompt สำหรับ cloud AI (Groq บน Vercel) */
export function getTelebotSystemPrompt(): string {
    if (cached) return cached;
    const embedded = String(TELEBOT_SYSTEM_PROMPT || '').trim();
    cached = embedded.length > 500 ? embedded : FALLBACK;
    return cached;
}
