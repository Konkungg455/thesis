/**
 * ค้นหาเอกสารจาก RAG index (สร้างด้วย scripts/build-rag-index.mjs)
 * POST { query: string, topK?: number }
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

type RagItem = {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
  embedding: number[];
};

type RagIndex = {
  model: string;
  count: number;
  items: RagItem[];
};

let cached: RagIndex | null = null;

function loadIndex(): RagIndex | null {
  if (cached) return cached;
  const path = join(process.cwd(), 'data', 'rag', 'index.json');
  if (!existsSync(path)) return null;
  cached = JSON.parse(readFileSync(path, 'utf8')) as RagIndex;
  return cached;
}

function cosine(a: number[], b: number[]) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

async function embedQuery(text: string, model: string) {
  const host = String(process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const res = await fetch(`${host}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: text.slice(0, 4000) }),
  });
  if (!res.ok) {
    throw createError({ statusCode: 502, statusMessage: `Ollama embed failed: ${res.status}` });
  }
  const json = await res.json() as { embedding?: number[]; embeddings?: number[][] };
  const emb = json.embedding || json.embeddings?.[0];
  if (!Array.isArray(emb)) {
    throw createError({ statusCode: 502, statusMessage: 'Empty embedding from Ollama' });
  }
  return emb;
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({})) as { query?: string; topK?: number };
  const query = String(body.query || '').trim();
  if (!query) {
    throw createError({ statusCode: 400, statusMessage: 'query required' });
  }

  const index = loadIndex();
  if (!index?.items?.length) {
    return {
      status: 'empty',
      message: 'ยังไม่มี RAG index — รัน node scripts/prepare-rag-train.mjs แล้ว node scripts/build-rag-index.mjs --sample',
      hits: [],
    };
  }

  const topK = Math.min(Math.max(Number(body.topK) || 4, 1), 10);
  const qEmb = await embedQuery(query, index.model || 'bge-m3');

  const hits = index.items
    .map((item) => ({
      id: item.id,
      score: cosine(qEmb, item.embedding),
      text: item.text,
      metadata: item.metadata || {},
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return {
    status: 'ok',
    model: index.model,
    count: index.count,
    query,
    hits,
    context: hits.map((h, i) => `[#${i + 1} score=${h.score.toFixed(3)}]\n${h.text}`).join('\n\n---\n\n'),
  };
});
