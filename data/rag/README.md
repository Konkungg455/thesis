# Medical RAG (train.json)

ชุดความรู้จาก `train.json` (Q&A แพทย์) สำหรับ AI Agent ใน n8n

## เตรียมข้อมูล

```bash
# แปลง Downloads/train.json → data/rag/train-pharmacy.jsonl
node scripts/prepare-rag-train.mjs

# หรือระบุ path
node scripts/prepare-rag-train.mjs "C:\Users\konku\Downloads\train.json"
```

## สร้าง vector index (Ollama `bge-m3`)

```bash
# ทดสอบเร็ว 50 เอกสาร
node scripts/build-rag-index.mjs --sample

# ชุดเภสัชทั้งหมดที่คัดแล้ว (แนะนำ)
node scripts/build-rag-index.mjs

# หรือจำกัดจำนวน
node scripts/build-rag-index.mjs --limit=1000
```

ผลลัพธ์: `data/rag/index.json` → ค้นผ่าน `POST /api/rag/search`

## n8n

Workflow แชทมี tool **Medical RAG** เรียก `http://127.0.0.1:3001/api/rag/search`  
ต้องรัน `npm run dev` (พอร์ต 3001) + มี `index.json` แล้ว

รีเจน workflow:

```bash
node scripts/build-n8n-32-symptoms.mjs
node scripts/setup-n8n-workflow.mjs
```
