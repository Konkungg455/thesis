# Deploy บน Vercel (https://thesis-sandy.vercel.app)

## 404 DEPLOYMENT_NOT_FOUND

ถ้าเปิดเว็บแล้วขึ้น **404 DEPLOYMENT_NOT_FOUND** = โปรเจกต์ Vercel ถูกลบ / ยังไม่ได้ deploy

**แก้ (ครั้งเดียว):**
1. เปิด https://vercel.com/dashboard
2. **Add New → Project** → เลือก GitHub repo **Konkungg455/thesis**
3. Framework: **Nuxt.js** (auto)
4. **Environment Variables → Import .env** (ใช้ `import.env` จาก Downloads)
5. กด **Deploy**
6. **Settings → Domains** → ตรวจว่ามี `thesis-sandy.vercel.app`
7. ตรวจ: `https://thesis-sandy.vercel.app/api/ai-chat/health` → `"configured": true`

> `NUXT_PUBLIC_SITE_ORIGIN` ใน import.env ต้องตรงกับ domain นี้ — ใช้ในลิงก์ reset password

---

## สาเหตุที่ DB / AI ไม่ทำงาน

| ปัญหา | สาเหตุ |
|-------|--------|
| Login / ข้อมูลว่าง | **DATABASE_URL ยังไม่ได้ใส่ใน Vercel** |
| AI ไม่ตอบ | ยังไม่ได้ใส่ `NUXT_AI_API_KEY` บน Vercel |

---

## Environment Variables (Vercel → Settings → Environment Variables)

ใส่ครบทุกตัว แล้ว **Redeploy**

### Database (จำเป็น — login, เภสัช, ใบสั่งยา)

**อย่าใช้** `db.xxx.supabase.co` บน Vercel — เป็น IPv6 อย่างเดียว → `ENOTFOUND`

ใช้ **Connection Pooler** จาก Supabase Dashboard → Database → **Connection pooling** → Transaction mode:

```
DATABASE_URL=postgresql://postgres.czzkubnrzhcxlcnughxf:Konkungg%400819387416@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres
```

- User = `postgres.PROJECT_REF` (ไม่ใช่แค่ `postgres`)
- Host = `aws-1-ap-southeast-1.pooler.supabase.com` (ดู region ใน Dashboard)
- Port = **6543** (Transaction pooler)

### Supabase

```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=sb_publishable_xxx
NUXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NUXT_PUBLIC_SUPABASE_KEY=sb_publishable_xxx
SUPABASE_ENABLED=true
NUXT_PUBLIC_USE_SUPABASE_BACKEND=true
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # Project Settings → API → service_role (server only)
```

**Storage buckets (มีอยู่แล้วใน Supabase — ต้อง Public):**
- `images-pharma` — รูปเภสัช
- `images-account` — รูปผู้ใช้/แอดมิน
- `uploads` — chat, licenses, store_profiles, slips, qr_payment

> อัปโหลดรูป (avatar, chat) บน Vercel ต้องมี `SUPABASE_SERVICE_ROLE_KEY` — ไม่ใช้ `MEDIA_ROOT`

### SMTP (OTP / ลืมรหัสผ่าน)

```
NUXT_PUBLIC_SITE_ORIGIN=https://thesis-sandy.vercel.app
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your@gmail.com
SMTP_PASS=xxxx
SMTP_FROM=your@gmail.com
SMTP_FROM_NAME=Telebot Pharmacy
```

### AI บน Vercel (Cloud — **ไม่ต้อง ngrok**)

1. สมัครฟรี: https://console.groq.com → สร้าง API Key
2. ใส่ใน Vercel:

```
NUXT_AI_API_KEY=gsk_xxxxxxxx
NUXT_AI_PROVIDER=groq
NUXT_AI_MODEL=llama-3.3-70b-versatile
```

> บน Vercel ใช้ Cloud LLM โดยตรง — **ไม่ต้องเปิด n8n / ngrok / PC ค้างไว้**
> Local (`npm run dev`) ยังใช้ n8n + Ollama ในเครื่องเหมือนเดิม

**ทางเลือก:** `NUXT_AI_PROVIDER=gemini` + Google AI API key

**Local only (ไม่บังคับบน Vercel):** n8n ที่ `http://127.0.0.1:5678`

### รูปภาพไม่ขึ้น

1. ตั้ง `SUPABASE_SERVICE_ROLE_KEY` บน Vercel
2. Buckets ใน Supabase: `images-pharma`, `images-account`, `uploads` (Public)
3. **รันครั้งเดียวบนเครื่อง:** `npm run media:seed` (อัปโหลดรูป default ไป Supabase Storage)

### โดนดีด logout "เซิร์ฟเวอร์รีสตาร์ท"

แก้แล้ว — ปิด heartbeat บน production (Vercel serverless เปลี่ยน bootId ทุก instance)

---

## ตรวจหลัง deploy

```
https://thesis-sandy.vercel.app/api/supabase/health
→ {"status":"success",...}

https://thesis-sandy.vercel.app/api/deploy/health
→ ดู database_url, site_origin และ AI ว่าพร้อมไหม
```

---

## สรุป

- **Local (`npm run dev`)** — DB + AI ทำงานครบ (Ollama + n8n ในเครื่อง)
- **Vercel** — DB ต้องมี `DATABASE_URL` + Supabase env
- **Vercel AI** — ต้อง `NUXT_AI_API_KEY` (Groq ฟรี) — **ไม่ต้อง ngrok**
