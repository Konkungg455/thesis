/** n8n local — workflow / webhook ที่ใช้จริงในโปรเจกต์ */
export const N8N_LOCAL_BASE = process.env.NUXT_N8N_INTERNAL_URL || 'http://127.0.0.1:5678';
export const N8N_WORKFLOW_ID = process.env.N8N_WORKFLOW_ID || 'kqH5LmZvBvgerQFY';
export const N8N_WEBHOOK_ID = process.env.NUXT_PUBLIC_N8N_CHAT_WEBHOOK_ID
    || '1f5ea30f-2ff0-4d32-b211-eccb342ee0df';
export const N8N_WORKFLOW_URL = `${N8N_LOCAL_BASE}/workflow/${N8N_WORKFLOW_ID}`;
export const N8N_WEBHOOK_CHAT_URL = `${N8N_LOCAL_BASE}/webhook/${N8N_WEBHOOK_ID}/chat`;
