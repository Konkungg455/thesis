# n8n Workflow — AI วินิจฉัย 32 อาการบัตรทอง (ไฟล์เดียว)

ใช้ **ไฟล์เดียว** `n8n_workflow_32_symptoms.json` — import แล้วใช้งานได้เลย

## วิธีใช้ (3 ขั้นตอน)

### 1. Import workflow
1. เปิด n8n ที่ `http://localhost:5678`
2. **Workflows** → **Add Workflow** → **⋯** → **Import from File**
3. เลือก `n8n_workflow_32_symptoms.json`

### 2. ตั้ง Credential (ครั้งเดียว)

**Ollama** (จำเป็น)
- Credentials → Add → **Ollama**
- Base URL: `http://localhost:11434` (n8n รันบนเครื่อง) หรือ `http://host.docker.internal:11434` (n8n ใน Docker)
- Name: `Ollama (local)`
- ต้องมี model: `gemma3:4b` และ `bge-m3:latest`

**Qdrant** (สำหรับ RAG — ถ้ายังไม่มี Qdrant ให้รัน `docker run -d -p 6333:6333 qdrant/qdrant`)
- Credentials → Add → **Qdrant**
- URL: `http://localhost:6333` หรือ `http://qdrant:6333` (ใน Docker network)
- API Key: เว้นว่าง
- Name: `Qdrant (local)`

จากนั้นกด node สีแดงใน workflow → เลือก credential ที่สร้าง

### 3. Ingest train.json (ครั้งเดียว) + Activate

**Ingest ข้อมูล train.json → Qdrant:**
1. ใน workflow เดียวกัน มองลงด้านล่าง → node **"Ingest train.json (Run Once)"**
2. แก้ node **Read train.json** ให้ชี้ไปที่ไฟล์ของคุณ เช่น `C:/Users/konku/Downloads/train (1).json`
3. กด **Execute Workflow** (รอ 15–30 นาที)

**เปิดใช้ chat:**
- Toggle **Active** มุมขวาบน

### Webhook URL (ใช้กับ Vue)
```
http://localhost:5678/webhook/1f5ea30f-2ff0-4d32-b211-eccb342ee0df/chat
```

## โครงสร้างใน workflow เดียว

```
[Chat Trigger] → [Preprocess] → [AI Agent] ← Ollama gemma3:4b
                                      ↑ Memory (40)
                                      ↑ Tool: medical_kb (Qdrant + bge-m3)

[Ingest Run Once] → Read train.json → Parse → Split → Qdrant Insert
                                                      ↑ bge-m3 embed
```

## ฟีเจอร์ที่รวมไว้แล้ว

| ฟีเจอร์ | รายละเอียด |
|---|---|
| 32 อาการบัตรทอง | ซักประวัติ 3 ข้อใหญ่ + สรุป |
| RAG train.json | tool `medical_kb` ค้น 16,000+ Q&A |
| ไม่ถามซ้ำ | memory 40 ข้อความ + rule ใน prompt |
| เพศไม่ตรงโรค | ชายถามเรื่องผู้หญิง → ถามแทน แม่/ภรรยา/น้องสาว |
| คำถามแปลก | ค้น RAG ก่อน → ถ้าไม่มี แนะปรึกษาเภสัชกร |
| Red Flags | หยุดถาม แจ้งฉุกเฉินทันที |

## โน๊ตบุ๊คไม่แรง

- Ollama ใช้ GPU อัตโนมัติถ้ามี / CPU ถ้าไม่มี
- ถ้า RAM ไม่พอ เปลี่ยน model เป็น `gemma3:1b` ใน node Ollama Chat Model
- Qdrant ใช้ RAM ~100 MB
