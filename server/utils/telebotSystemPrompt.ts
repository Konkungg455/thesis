import workflow from '../../n8n_workflow_telebot_chat.json';

let cached: string | null = null;

/** โหลด system prompt เดียวกับ n8n workflow (bundle ไป Vercel ด้วย) */
export function getTelebotSystemPrompt(): string {
    if (cached) return cached;

    const agent = workflow.nodes?.find((n) => String(n.type || '').includes('agent'));
    const msg = agent?.parameters?.options?.systemMessage;
    if (msg) {
        cached = msg;
        return msg;
    }

    cached = 'คุณคือ telebot ผู้ช่วยซักประวัติอาการ 32 อาการบัตรทอง ตอบภาษาไทย ถามทีละข้อตาม format 🩺 ข้อ N:';
    return cached;
}
