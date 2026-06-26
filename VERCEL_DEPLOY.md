# Deploy บน Vercel (https://thesis-rust-beta.vercel.app)

## สาเหตุที่ DB / AI ไม่ทำงาน

| ปัญหา | สาเหตุ |
|-------|--------|
| Login / ข้อมูลว่าง | **DATABASE_URL ยังไม่ได้ใส่ใน Vercel** |
| AI ไม่ตอบ | Vercel เรียก `127.0.0.1:5678` ไม่ได้ — n8n อยู่ในเครื่องคุณ |

---

## Environment Variables (Vercel → Settings → Environment Variables)

ใส่ครบทุกตัว แล้ว **Redeploy**

### Database (จำเป็น — login, เภสัช, ใบสั่งยา)

```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.xxxxx.supabase.co:5432/postgres
```

(รหัสผ่านมี `@` → เขียน `%40`)

### Supabase

```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=sb_publishable_xxx
NUXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NUXT_PUBLIC_SUPABASE_KEY=sb_publishable_xxx
SUPABASE_ENABLED=true
NUXT_PUBLIC_USE_SUPABASE_BACKEND=true
```

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

### AI บน Vercel (ต้องมี n8n สาธารณะ)

Vercel **เข้าถึง n8n ในเครื่องโดยตรงไม่ได้** — ต้องเปิด tunnel:

**เครื่องคุณ (รันคู่กับ npm run dev):**
```powershell
ngrok http 5678
```

**Vercel env:**
```
NUXT_N8N_INTERNAL_URL=https://xxxx.ngrok-free.app
NUXT_PUBLIC_N8N_CHAT_WEBHOOK_ID=1f5ea30f-2ff0-4d32-b211-eccb342ee0df
```

> PC ปิด = AI บน Vercel ใช้ไม่ได้ (n8n อยู่ local)
> ทางเลือกถาวร: deploy n8n บน VPS/Railway แล้วใส่ URL นั้น

---

## ตรวจหลัง deploy

```
https://thesis-rust-beta.vercel.app/api/supabase/health
→ {"status":"success",...}

https://thesis-rust-beta.vercel.app/api/deploy/health
→ ดู database_url และ n8n ว่าพร้อมไหม
```

---

## สรุป

- **Local (`npm run dev`)** — DB + AI ทำงานครบ (Ollama + n8n ในเครื่อง)
- **Vercel** — DB ต้องมี `DATABASE_URL` + Supabase env
- **Vercel AI** — ต้อง `NUXT_N8N_INTERNAL_URL` ชี้ไป ngrok/VPS ที่รัน n8n
