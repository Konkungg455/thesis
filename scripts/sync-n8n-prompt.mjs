/**
 * ซิงก์ n8n_system_prompt.txt → n8n_workflow_telebot_chat.json
 * รัน: node scripts/sync-n8n-prompt.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const prompt = readFileSync(join(root, 'n8n_system_prompt.txt'), 'utf-8');
const wfPath = join(root, 'n8n_workflow_telebot_chat.json');
const wf = JSON.parse(readFileSync(wfPath, 'utf-8'));

const agent = wf.nodes?.find((n) => String(n.type || '').includes('agent'));
if (!agent?.parameters?.options) {
    console.error('ไม่พบ AI Agent node ใน workflow');
    process.exit(1);
}

agent.parameters.options.systemMessage = prompt;
writeFileSync(wfPath, `${JSON.stringify(wf, null, 2)}\n`, 'utf-8');

const embeddedPath = join(root, 'server/utils/telebotPromptEmbedded.ts');
const embedded = `// Auto-synced from n8n_system_prompt.txt\nexport const TELEBOT_SYSTEM_PROMPT = ${JSON.stringify(prompt)};\n`;
writeFileSync(embeddedPath, embedded, 'utf-8');

console.log('Synced prompt → n8n_workflow_telebot_chat.json + telebotPromptEmbedded.ts');
