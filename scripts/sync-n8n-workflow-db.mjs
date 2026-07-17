/**
 * Sync the webhook-bound n8n workflow from n8n_workflow_32_symptoms.json into sqlite.
 * Strips AI tools for Ollama models that do not support tool calling (e.g. gemma3:1b).
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { N8N_WEBHOOK_ID, N8N_WORKFLOW_ID } from './n8n-config.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDir, '..');
const dbPath = join(projectRoot, '.tools', 'n8n-data', '.n8n', 'database.sqlite');
const workflowFile = join(projectRoot, 'n8n_workflow_32_symptoms.json');
const webhookId = N8N_WEBHOOK_ID;
const preferredWorkflowId = process.env.N8N_WORKFLOW_ID || N8N_WORKFLOW_ID;
const targetModel = process.argv[2] || process.env.OLLAMA_MODEL || 'gemma4:latest';

const TOOL_NODE_TYPES = new Set([
  '@n8n/n8n-nodes-langchain.toolWikipedia',
  '@n8n/n8n-nodes-langchain.toolHttpRequest',
  '@n8n/n8n-nodes-langchain.toolCode',
]);
const MODELS_WITHOUT_TOOLS = /^gemma3:(1b|4b)$/i;

function prepareWorkflow(wf, model) {
  const stripTools = MODELS_WITHOUT_TOOLS.test(model);
  let nodes = wf.nodes.map((n) => {
    if (n.type === '@n8n/n8n-nodes-langchain.lmChatOllama') {
      return { ...n, parameters: { ...n.parameters, model } };
    }
    return n;
  });

  let connections = structuredClone(wf.connections);
  if (stripTools) {
    const removed = new Set(
      nodes.filter((n) => TOOL_NODE_TYPES.has(n.type)).map((n) => n.name),
    );
    nodes = nodes.filter((n) => !removed.has(n.name));
    for (const name of removed) delete connections[name];
    console.log(`  Lite mode: removed tools for ${model} (${[...removed].join(', ') || 'none'})`);
  }

  return { nodes, connections };
}

const wf = JSON.parse(readFileSync(workflowFile, 'utf8'));
const db = new DatabaseSync(dbPath);

function resolveWorkflowId() {
    if (preferredWorkflowId) {
        const row = db.prepare('SELECT id FROM workflow_entity WHERE id = ? LIMIT 1').get(preferredWorkflowId);
        if (row?.id) return row.id;
    }
    const hook = db.prepare(
        'SELECT workflowId FROM webhook_entity WHERE webhookPath LIKE ? LIMIT 1',
    ).get(`${webhookId}%`);
    return hook?.workflowId || null;
}

const workflowId = resolveWorkflowId();
if (!workflowId) {
    console.error('Webhook/workflow not registered — start n8n first, then re-run');
    process.exit(1);
}
copyFileSync(dbPath, `${dbPath}.bak-sync-${Date.now()}`);

const { nodes, connections } = prepareWorkflow(wf, targetModel);
db.prepare(`
  UPDATE workflow_entity
  SET nodes = ?, connections = ?, active = 1, updatedAt = datetime('now')
  WHERE id = ?
`).run(JSON.stringify(nodes), JSON.stringify(connections), workflowId);

db.prepare(`
  UPDATE workflow_entity SET active = 0
  WHERE id != ?
`).run(workflowId);

const row = db.prepare('SELECT name FROM workflow_entity WHERE id = ?').get(workflowId);
console.log(`Synced webhook workflow ${workflowId} (${row?.name})`);
console.log(`Model: ${targetModel}`);
console.log('Restart n8n to apply: npm run ai:start');
