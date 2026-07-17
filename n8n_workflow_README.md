# n8n + Ollama — ใช้งาน local ฟรี (ไม่ใช้ Docker / ไม่ใช้ n8n Cloud)

## สิ่งที่ต้องมี

| โปรแกรม | วิธีติดตั้ง | พอร์ต |
|---------|-------------|-------|
| **Ollama** | https://ollama.com/download/windows | 11434 |
| **Node.js** | มีอยู่แล้ว (รัน Nuxt) — n8n ใช้ Node 22 อัตโนมัติถ้าเครื่องเป็น v25 | — |
| **n8n** | รันผ่าน `npx` อัตโนมัติ — **ไม่ต้องติดตั้ง Docker** | 5678 |

## เริ่มใช้งาน (3 คำสั่ง)

```powershell
cd telebot_pharmacy

# เปิดเว็บ + Ollama + n8n ในคำสั่งเดียว
npm run dev

# ตรวจสุขภาพ AI (ถ้าต้องการ)
npm run ai:check
```

> `npm run dev` จะเปิด Ollama + n8n ให้อัตโนมัติถ้ายังไม่รัน (ไม่ต้อง `npm run ai:start` แยก)
> ถ้าไม่ต้องการ AI ให้ใช้ `npm run dev:nuxt`

## Workflow ที่ใช้งานจริง (แก้ตรงนี้)

**เปิด workflow นี้ใน n8n เมื่อต้องการแก้ node / prompt / model — อย่าสร้าง workflow ใหม่ซ้ำ**

```
http://127.0.0.1:5678/workflow/kqH5LmZvBvgerQFY
```

| ค่า | ID |
|-----|-----|
| Workflow ID | `kqH5LmZvBvgerQFY` |
| Webhook ID (Chat Trigger) | `1f5ea30f-2ff0-4d32-b211-eccb342ee0df` |
| ชื่อ workflow | TELEBOT-PHARMACY — 32 อาการ + Web Search |

### อัปเดต workflow

| วิธี | เมื่อไหร่ |
|------|----------|
| **แก้ใน n8n UI** ที่ URL ด้านบน | ปรับ node เล็กน้อย, ทดสอบทันที |
| **`node scripts/sync-n8n-prompt.mjs`** | แก้ `n8n_system_prompt.txt` แล้ว sync เข้า JSON + DB |
| **`node scripts/build-n8n-32-symptoms.mjs`** แล้ว **`npm run ai:fix-webhook`** | เปลี่ยนโครง node / filter / tools ใน repo |

> ค่า ID อยู่ที่ `scripts/n8n-config.mjs` — override ได้ด้วย env `N8N_WORKFLOW_ID`

## ตั้งค่า n8n (ครั้งแรกเท่านั้น)

1. เปิด **http://127.0.0.1:5678** → สมัคร account local (เก็บในเครื่อง ไม่ใช่ cloud)
2. **Workflows** → **Import from File** → เลือก `n8n_workflow_32_symptoms.json` (แนะนำ — มี Web Search)  
   หรือ `n8n_workflow_telebot_chat.json` (แบบเบา ไม่มี tool)  
   **ถ้ามี workflow `kqH5LmZvBvgerQFY` อยู่แล้ว → แก้ที่ URL ด้านบน ไม่ต้อง import ซ้ำ**
3. เปิด node **Ollama Chat Model** → Credentials → **Create new Ollama API**
   - Base URL: `http://127.0.0.1:11434`
   - Name: `Ollama (local)`
4. กด **Save** แล้ว **Activate** (toggle มุมขวาบน — สีเขียว)

## Webhook URL (ตรงกับเว็บ)

```
http://127.0.0.1:5678/webhook/1f5ea30f-2ff0-4d32-b211-eccb342ee0df/chat
```

เว็บ Nuxt เรียกผ่าน **`/api/ai-chat`** → proxy ไป URL ด้านบนอัตโนมัติ

## โครงสร้าง workflow (`n8n_workflow_32_symptoms.json`)

```
[Chat Trigger] → [Input Guard] → [Blocked?]
                                    ├─ ใช่ → [Blocked Reply] (regex ไม่เรียก AI)
                                    └─ ไม่ → [Preprocess] → [AI Agent — สรุปเท่านั้น]
                                      ↑ Ollama gemma4
                                      ↑ Window Buffer Memory (20)
                                      ↑ Wikipedia (tool)
                                      ↑ Web Search / DuckDuckGo (tool)
```

- **Input Guard** — กรองคำหยาบ / พิมพ์มั่ว / มุก (เช่n ปวดขี้) ด้วย regex ใน Code node **ไม่ใช้ LLM → ไม่หลอน**
- สร้าง/อัปเดต workflow: `node scripts/build-n8n-32-symptoms.mjs` แล้ว import ใหม่ใน n8n

## โน้ตบุ๊ค RAM ไม่พอ

- เปลี่ยน model ใน node **Ollama Chat Model** เป็น `gemma3:1b` หรือ `llama3.2:1b`
- รัน `ollama pull gemma3:1b` ก่อน

## ใช้ผ่าน ngrok / มือถือ

1. `npm run dev` (port 3001)
2. `ngrok http 192.168.x.x:3001`
3. AI ยังทำงานได้ — Nuxt server คุยกับ n8n ที่ `127.0.0.1:5678` ในเครื่องเดียวกัน

## แก้ปัญหา

| อาการ | วิธีแก้ |
|-------|---------|
| AI ไม่ตอบ | รัน `npm run ai:check` — ต้อง Activate workflow |
| Ollama offline | เปิดแอป Ollama จาก Start Menu |
| n8n ไม่ขึ้น | Node 25 ไม่รองรับ — สคริปต์จะดาวน์โหลด Node 22 ไป `.tools/` อัตโนมัติ |
| ช้ามาก | ครั้งแรก model โหลดเข้า RAM ใช้เวลา 30–90 วิ |
