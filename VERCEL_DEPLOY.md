# Deploy บน Vercel

## 404 DEPLOYMENT_NOT_FOUND

ถ้าเปิดเว็บแล้วขึ้น **404 DEPLOYMENT_NOT_FOUND** = โปรเจกต์ Vercel ถูกลบ / ยังไม่ได้ deploy

**แก้ (ครั้งเดียว):**
1. เปิด https://vercel.com/dashboard
2. **Add New → Project** → เลือก GitHub repo
3. Framework: **Nuxt.js** (auto)
4. **Environment Variables → Import .env** → เลือกไฟล์ **`import.env`** ในโปรเจกต (Production + Preview + Development)
5. กด **Deploy**
6. ตรวจ: `https://YOUR-PROJECT.vercel.app/api/ai-chat/health` → `"mode": "cloud"`

> ไม่ต้อง pin domain — ลิงก์ reset password ใช้ domain จาก request อัตโนมัติ

---

## สาเหตุที่ DB / AI ไม่ทำงาน

| ปัญหา | สาเหตุ |
|-------|--------|
| Login / ข้อมูลว่าง | **DATABASE_URL ยังไม่ได้ใส่ใน Vercel** |
| AI ไม่ตอบ | ยังไม่ได้ใส่ `NUXT_N8N_INTERNAL_URL` (ngrok ของ n8n) |
| ช้า / ข้อมูลกระพริบ | DB cold start — ใช้ pooler port **6543** |

---

## Import .env แล้วขึ้น "No environment variables were created"

| สาเหตุ | วิธีแก้ |
|--------|---------|
| **Import แล้วขึ้นข้อความนี้ทั้งก้อน** | **ไม่ใช่ error** — ตัวแปรใน `import.env` **มีอยู่แล้ว** บน Vercel (import ไม่ overwrite) |
| อยากอัปเดตค่าจาก `import.env` | รัน **`npm run vercel:sync-env`** (ต้อง `npx vercel link` ก่อน) แล้ว **Redeploy** |
| **ไม่ได้ติ๊ก Environment** | ติ๊ก **Production + Preview + Development** ก่อน Import |
| ไฟล์มีแต่ comment / รูปแบบผิด | ตรวจ **`import.env`** ว่ามีบรรทัด `KEY=VALUE` (ไม่ขึ้นต้นด้วย `#`) · สำรอง: `npm run vercel:prepare-import` |
| ใช้ `NUXT_AI_MODE=n8n` บน Vercel | เปลี่ยเป็น **`NUXT_AI_MODE=cloud`** (ไม่มี n8n บน serverless) |
| **`NUXT_PUBLIC_SITE_ORIGIN`** | **ไม่จำเป็น** — ระบบใช้ domain จาก request อัตโนมัติ. ข้อความนี้ที่ตัวนี้ = **มีค่าเดิมอยู่แล้ว** หรือ **ข้ามได้** (ไม่ใช่ error) |

หลัง import สำเร็จ → **Redeploy** แล้วเช็ค `/api/deploy/health`

---

## Environment Variables (Vercel → Settings → Environment Variables)

**ไฟล์หลัก:** `import.env` (ในโฟลเดอร์โปรเจกต — ไม่ commit ขึ้น Git เพราะมี secret)

1. เปิด `import.env` ใส่ค่าจริง (หรือ copy จาก `vercel.env.template`)
2. Vercel → **Import .env** → เลือก **`import.env`**
3. ติ๊ก **Production + Preview + Development**
4. **Redeploy**

### Database (จำเป็น — login, เภสัช, ใบสรุปรายการยา)

**อย่าใช้** `db.xxx.supabase.co` บน Vercel — เป็น IPv6 อย่างเดียว → `ENOTFOUND`

ใช้ **Connection Pooler** จาก Supabase Dashboard → Database → **Connection pooling** → Transaction mode:

```
DATABASE_URL=postgresql://postgres.PROJECT_REF:PASSWORD@aws-1-REGION.pooler.supabase.com:6543/postgres
```

- User = `postgres.PROJECT_REF` (ไม่ใช่แค่ `postgres`)
- Port = **6543** (Transaction pooler)

### Supabase

```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=sb_publishable_xxx
NUXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NUXT_PUBLIC_SUPABASE_KEY=sb_publishable_xxx
NUXT_PUBLIC_USE_SUPABASE_BACKEND=true
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

**Storage buckets (Public):** `images-pharma`, `images-account`, `uploads`

### SMTP (OTP / ลืมรหัสผ่าน)

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your@gmail.com
SMTP_PASS=xxxx
SMTP_FROM=your@gmail.com
SMTP_FROM_NAME=Telebot Pharmacy
```

### AI บน Vercel (แนะนำ — Groq)

ไม่ต้องเปิด n8n บน PC — ใส่ใน Vercel:

```
NUXT_AI_MODE=cloud
NUXT_AI_API_KEY=gsk_xxx
NUXT_AI_PROVIDER=groq
NUXT_AI_MODEL=llama-3.3-70b-versatile
```

> สมัคร key ฟรี: https://console.groq.com

**ทางเลือก (n8n + Ollama แบบ 26 มิ.ย.):**

1. เปิด n8n + Ollama บน PC (`npm run ai:start`)
2. เปิด ngrok ชี้ n8n: `ngrok http 5678`
3. ใส่ใน Vercel:

```
NUXT_AI_MODE=n8n
NUXT_N8N_INTERNAL_URL=https://xxxx.ngrok-free.dev
NUXT_PUBLIC_N8N_CHAT_WEBHOOK_ID=1f5ea30f-2ff0-4d32-b211-eccb342ee0df
NUXT_AI_API_KEY=gsk_xxx
```

> `NUXT_AI_API_KEY` ใช้เป็น fallback อัตโนมัติเมื่อ n8n ล้ม (แม้ `NUXT_AI_MODE=n8n`)

### รูปภาพไม่ขึ้น

1. ตั้ง `SUPABASE_SERVICE_ROLE_KEY` บน Vercel
2. Buckets Public ใน Supabase
3. รันครั้งเดียว: `npm run media:seed`

---

## ตรวจหลัง deploy

```
/api/supabase/health
/api/deploy/health
/api/ai-chat/health
```

---

## สรุป

- **Local (`npm run dev`)** — DB + AI ครบ (Ollama + n8n ในเครื่อง)
- **Vercel** — DB ต้องมี `DATABASE_URL` + Supabase env
- **Vercel AI** — `NUXT_N8N_INTERNAL_URL` (ngrok n8n) หรือ `NUXT_AI_MODE=cloud`
