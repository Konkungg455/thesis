/**
 * แปลง train.json → RAG documents สำหรับ telebot
 * รัน: node scripts/prepare-rag-train.mjs [path/to/train.json]
 *
 * ผลลัพธ์:
 *  - data/rag/train-pharmacy.jsonl  (โฟกัสอาการเภสัช/บัตรทอง ~เร็วพอ ingest)
 *  - data/rag/train-all.meta.json   (สถิติของไฟล์เต็ม — ไม่คัดลอก 25MB เข้า git)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'data', 'rag');
mkdirSync(outDir, { recursive: true });

const defaultSrc = join(process.env.USERPROFILE || process.env.HOME || '', 'Downloads', 'train.json');
const src = process.argv[2] || defaultSrc;

if (!existsSync(src)) {
  console.error('ไม่พบไฟล์ train.json ที่', src);
  process.exit(1);
}

const PHARMA_KEYWORDS = [
  'ปวดศีรษะ', 'ปวดหัว', 'migraine', 'headache',
  'เวียนศีรษะ', 'dizziness', 'vertigo',
  'ปวดข้อ', 'ปวดกล้ามเนื้อ', 'ปวดหลัง', 'myalgia', 'arthralgia',
  'ไข้', 'fever', 'ไข้หวัด',
  'ไอ', 'cough', 'เจ็บคอ', 'sore throat', 'pharyngitis',
  'ปวดท้อง', 'ท้องเสีย', 'ท้องผูก', 'diarrhea', 'constipation', 'abdominal',
  'ริดสีดวง', 'hemorrhoid',
  'คลื่นไส้', 'อาเจียน', 'nausea', 'vomit',
  'กรดไหลย้อน', 'gerd', 'reflux',
  'ประจำเดือน', 'menstrual', 'dysmenorrhea', 'ตกขาว', 'vaginal',
  'ผื่น', 'คัน', 'rash', 'itch', 'urticaria', 'allergy', 'แพ้',
  'บาดแผล', 'wound', 'แมลง', 'กัด', 'ต่อย', 'burn', 'ไหม้', 'ถลอก',
  'กลาก', 'เกลื้อน', 'หิด', 'เหา', 'fungal',
  'ฝี', 'หนอง', 'abscess',
  'แผลในปาก', 'aphthous', 'ปวดฟัน', 'toothache', 'dental',
  'ตาแดง', 'conjunctivitis', 'กุ้งยิง', 'stye',
  'หูอักเสบ', 'otitis', 'คัดจมูก', 'น้ำมูก', 'rhinitis', 'sinus',
  'ภูมิแพ้', 'allergic',
  'นอนไม่หลับ', 'insomnia', 'วิตกกังวล', 'anxiety',
  'ยาแก้ปวด', 'paracetamol', 'ibuprofen', 'antihistamine', 'ยาแก้แพ้',
  'เภสัช', 'otc', 'over-the-counter', 'primary care', 'self-care',
  'influenza', 'common cold', 'GERD', 'PPI',
];

const raw = JSON.parse(readFileSync(src, 'utf8'));
if (!Array.isArray(raw)) {
  console.error('train.json ต้องเป็น array');
  process.exit(1);
}

const toDoc = (row, i) => {
  const q = String(row.Question || '').trim();
  const a = String(row.Response || '').trim();
  const cot = String(row.Complex_CoT || '').trim();
  if (!q || !a) return null;
  return {
    id: `train-${i}`,
    pageContent: `คำถาม: ${q}\n\nคำตอบอ้างอิง: ${a}${cot ? `\n\nเหตุผลสั้นๆ: ${cot.slice(0, 600)}` : ''}`,
    metadata: { source: 'train.json', index: i },
  };
};

const allDocs = [];
const pharmaDocs = [];
for (let i = 0; i < raw.length; i++) {
  const doc = toDoc(raw[i], i);
  if (!doc) continue;
  allDocs.push(doc);
  const hay = doc.pageContent.toLowerCase();
  if (PHARMA_KEYWORDS.some((kw) => hay.includes(kw.toLowerCase()))) {
    pharmaDocs.push(doc);
  }
}

// จำกัดชุดเภสัชให้ ingest ใน n8n ได้เร็ว (ยังครอบคลุมหลายอาการ)
const MAX_PHARMA = Number(process.env.RAG_PHARMA_LIMIT || 2500);
const pharmaSlice = pharmaDocs.slice(0, MAX_PHARMA);

const jsonlPath = join(outDir, 'train-pharmacy.jsonl');
writeFileSync(jsonlPath, pharmaSlice.map((d) => JSON.stringify(d)).join('\n') + '\n', 'utf8');

// สำเนาต้นฉบับไว้ใน data/rag (ไม่ commit — ใหญ่)
const localCopy = join(outDir, 'train.json');
try {
  copyFileSync(src, localCopy);
} catch {
  /* ignore */
}

writeFileSync(
  join(outDir, 'train-all.meta.json'),
  JSON.stringify(
    {
      source: src,
      totalRows: raw.length,
      validDocs: allDocs.length,
      pharmacyMatched: pharmaDocs.length,
      pharmacyExported: pharmaSlice.length,
      exportedAt: new Date().toISOString(),
      jsonl: 'train-pharmacy.jsonl',
      embeddingModelHint: 'bge-m3',
    },
    null,
    2,
  ),
  'utf8',
);

// ชุดเล็กสำหรับ smoke test / demo
writeFileSync(
  join(outDir, 'train-pharmacy-sample.jsonl'),
  pharmaSlice.slice(0, 50).map((d) => JSON.stringify(d)).join('\n') + '\n',
  'utf8',
);

console.log(JSON.stringify({
  ok: true,
  source: src,
  totalRows: raw.length,
  pharmacyMatched: pharmaDocs.length,
  pharmacyExported: pharmaSlice.length,
  jsonl: jsonlPath,
}, null, 2));
