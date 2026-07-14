/**
 * สร้าง vector index ด้วย Ollama bge-m3 จาก train-pharmacy.jsonl
 * รัน: node scripts/build-rag-index.mjs [--limit=500] [--sample]
 *
 * ผลลัพธ์: data/rag/index.json  (ใช้โดย /api/rag/search)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'data', 'rag');
mkdirSync(outDir, { recursive: true });

const args = process.argv.slice(2);
const useSample = args.includes('--sample');
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : (useSample ? 50 : 0);

const OLLAMA = (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/$/, '');
const MODEL = process.env.RAG_EMBED_MODEL || 'bge-m3';

const srcPath = useSample
  ? join(outDir, 'train-pharmacy-sample.jsonl')
  : join(outDir, 'train-pharmacy.jsonl');

if (!existsSync(srcPath)) {
  console.error('ยังไม่มีไฟล์', srcPath, '— รัน node scripts/prepare-rag-train.mjs ก่อน');
  process.exit(1);
}

const lines = readFileSync(srcPath, 'utf8').split(/\r?\n/).filter(Boolean);
const docs = lines.map((l) => JSON.parse(l));
const selected = limit > 0 ? docs.slice(0, limit) : docs;

async function embedOne(text) {
  const res = await fetch(`${OLLAMA}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, prompt: text.slice(0, 6000) }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`embed failed ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = await res.json();
  const emb = json.embedding || json.embeddings?.[0];
  if (!Array.isArray(emb) || !emb.length) throw new Error('empty embedding');
  return emb;
}

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

console.error(`Embedding ${selected.length} docs with ${MODEL} …`);
const vectors = [];
for (let i = 0; i < selected.length; i++) {
  const d = selected[i];
  try {
    const embedding = await embedOne(d.pageContent);
    vectors.push({
      id: d.id,
      text: d.pageContent,
      metadata: d.metadata || {},
      embedding,
    });
  } catch (err) {
    console.error(`[skip ${i}]`, err.message || err);
  }
  if ((i + 1) % 25 === 0 || i === selected.length - 1) {
    console.error(`  ${i + 1}/${selected.length}`);
  }
}

const indexPath = join(outDir, 'index.json');
writeFileSync(
  indexPath,
  JSON.stringify({
    model: MODEL,
    builtAt: new Date().toISOString(),
    count: vectors.length,
    dim: vectors[0]?.embedding?.length || 0,
    items: vectors,
  }),
  'utf8',
);

console.log(JSON.stringify({ ok: true, count: vectors.length, indexPath, model: MODEL }, null, 2));

// self-test
if (vectors.length) {
  const q = await embedOne('ปวดหัว มีไข้ ดูแลตัวเองอย่างไร');
  const ranked = vectors
    .map((v) => ({ id: v.id, score: cosine(q, v.embedding), preview: v.text.slice(0, 80) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  console.error('self-test top3:', ranked);
}
