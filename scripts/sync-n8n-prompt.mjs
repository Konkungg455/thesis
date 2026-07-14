/**
 * ซิงก์ n8n_system_prompt.txt → workflow JSON + telebotPromptEmbedded.ts
 * รัน: node scripts/sync-n8n-prompt.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const prompt = readFileSync(join(root, 'n8n_system_prompt.txt'), 'utf-8');

const workflowFiles = [
  'n8n_workflow_32_symptoms.json',
  'n8n_workflow_telebot_chat.json',
];

for (const name of workflowFiles) {
  const wfPath = join(root, name);
  if (!existsSync(wfPath)) continue;
  const wf = JSON.parse(readFileSync(wfPath, 'utf-8'));
  const agent = wf.nodes?.find((n) => String(n.type || '').includes('agent'));
  if (!agent?.parameters?.options) {
    console.error(`ไม่พบ AI Agent ใน ${name}`);
    process.exit(1);
  }
  agent.parameters.options.systemMessage = prompt;
  writeFileSync(wfPath, `${JSON.stringify(wf, null, 2)}\n`, 'utf-8');
  console.log(`Synced prompt → ${name}`);
}

const embeddedPath = join(root, 'server/utils/telebotPromptEmbedded.ts');
const embedded = `// Auto-synced from n8n_system_prompt.txt\nexport const TELEBOT_SYSTEM_PROMPT = ${JSON.stringify(prompt)};\n`;
writeFileSync(embeddedPath, embedded, 'utf-8');
console.log('Synced prompt → telebotPromptEmbedded.ts');
