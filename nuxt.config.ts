// https://nuxt.com/docs/api/configuration/nuxt-config

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',

  devtools: { enabled: true },

  css: [
    '@/assets/dark-mode.css',
    '@/assets/review.css',
    '@/assets/responsive.css'
  ],

  app: {
    head: {
      title: 'Telebot Pharmacy',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1.0, viewport-fit=cover' }
      ],
      link: [
        { rel: 'icon', type: 'image/png', href: '/favicon.png' },
        { rel: 'shortcut icon', type: 'image/png', href: '/favicon.png' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        ...(process.env.NUXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
            ? [{ rel: 'preconnect', href: String(process.env.NUXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) }]
            : []),
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Sarabun:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800&display=swap'
        },
        {
          rel: 'stylesheet',
          href: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css'
        }
      ]
    }
  },

  modules: [
    '@nuxt/image'
  ],

  // ngrok / Cloudflare Tunnel — proxy n8n ผ่าน /n8n (API ใช้ /api/bff + Supabase)
  vite: {
    server: {
      allowedHosts: true,
      proxy: {
        '/n8n': {
          target: process.env.NUXT_PROXY_N8N_TARGET || 'http://127.0.0.1:5678',
          changeOrigin: true,
          secure: false,
          ws: true,
          rewrite: (path: string) => path.replace(/^\/n8n/, '')
        }
      }
    }
  },

  // เปิดรับการเชื่อมต่อจากเครื่องอื่นใน LAN (เช่น 192.168.1.117:3001)
  devServer: {
    host: '0.0.0.0',
    port: Number(process.env.NUXT_PORT || 3000)
  },

  // Nitro — API route /api/ai-chat + proxy /n8n บน production
  nitro: {
    // ใกล้ Supabase ap-southeast-1 — ลด latency DB บน Vercel
    vercel: {
      regions: ['sin1'],
      functions: {
        maxDuration: 60,
        memory: 1024,
      },
    },
    externals: {
      external: ['puppeteer-core', '@sparticuz/chromium-min', 'puppeteer'],
    },
    // ให้ Nitro/Vercel อ่าน env สำหรับ Supabase Postgres ได้แน่นอน
    env: [
      'DATABASE_URL',
      'DATABASE_POOLER_URL',
      'POSTGRES_URL',
      'POSTGRES_PRISMA_URL',
      'SUPABASE_URL',
      'SUPABASE_POOLER_HOST',
      'SUPABASE_DB_POOLER_HOST',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_KEY',
      'NUXT_PUBLIC_SUPABASE_URL',
      'NUXT_PUBLIC_SUPABASE_KEY',
      'PUPPETEER_EXECUTABLE_PATH',
      'CHROMIUM_REMOTE_EXEC_PATH',
    ],
    routeRules: {
      '/': { isr: 180 },
      '/api/**': { cors: true },
      '/api/home/summary': { headers: { 'cache-control': 'public, s-maxage=180, stale-while-revalidate=600' } },
      '/api/bff/get_pharmacists.php': { headers: { 'cache-control': 'public, s-maxage=180, stale-while-revalidate=600' } },
      '/api/bff/get-stores.php': { headers: { 'cache-control': 'public, s-maxage=180, stale-while-revalidate=600' } },
      '/api/bff/get-nearby-pharmacies.php': { headers: { 'cache-control': 'public, s-maxage=60, stale-while-revalidate=180' } },
      '/api/bff/review-get.php': { headers: { 'cache-control': 'public, s-maxage=180, stale-while-revalidate=600' } },
      '/api/ai-chat': { headers: { 'cache-control': 'no-store' } },
      '/api/ai-chat/**': { headers: { 'cache-control': 'no-store' } },
      '/n8n/**': { headers: { 'cache-control': 'no-store' } },
      '/api/deploy/health': { headers: { 'cache-control': 'no-store' } },
      '/api/supabase/health': { headers: { 'cache-control': 'no-store' } },
    },
  },

  runtimeConfig: {
    /** URL หลัก — ว่างได้ ระบบใช้ domain จาก request อัตโนมัติ */
    siteOrigin: process.env.NUXT_PUBLIC_SITE_ORIGIN || '',
    /** service role — ใช้ฝั่ง server เท่านั้น (optional) */
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    /** n8n URL — local: http://127.0.0.1:5678 | Vercel: ngrok URL ของ n8n */
    n8nInternalUrl: process.env.NUXT_N8N_INTERNAL_URL || process.env.NUXT_PUBLIC_N8N_BASE || '',
    /** Cloud LLM — ใช้เมื่อ NUXT_AI_MODE=cloud เท่านั้น */
    aiApiKey: process.env.NUXT_AI_API_KEY || '',
    aiProvider: process.env.NUXT_AI_PROVIDER || 'groq',
    aiModel: process.env.NUXT_AI_MODEL || '',
    aiBaseUrl: process.env.NUXT_AI_BASE_URL || '',
    aiMode: process.env.NUXT_AI_MODE || 'n8n',
    /** Metered.ca TURN — server only (วิดีโอคอลมือถือ↔iPad) — ใช้เมื่อไม่เปิด Agora */
    meteredApiKey: process.env.NUXT_METERED_API_KEY || '',
    meteredAppName: process.env.NUXT_METERED_APP_NAME || 'telebotpharmacy',
    /** Agora.io — server only (สร้าง RTC token) */
    agoraAppCertificate: process.env.NUXT_AGORA_APP_CERTIFICATE || '',
    public: {
      /** legacy PHP เท่านั้น — ค่าเริ่มต้นใช้ /api/bff */
      apiBase: process.env.NUXT_PUBLIC_API_BASE || '',
      /** n8n base — tunnel/Vercel ใช้ /n8n proxy อัตโนมัติ */
      n8nBase: process.env.NUXT_PUBLIC_N8N_BASE || '',
      /** webhook ID ของ chatbot ใน n8n */
      n8nChatWebhookId: process.env.NUXT_PUBLIC_N8N_CHAT_WEBHOOK_ID || '1f5ea30f-2ff0-4d32-b211-eccb342ee0df',
      supabaseStorageBucket: process.env.SUPABASE_STORAGE_BUCKET || 'media',
      supabaseUrl: process.env.NUXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
      supabaseKey: process.env.NUXT_PUBLIC_SUPABASE_KEY || process.env.SUPABASE_KEY || '',
      /** ค่าเริ่มต้น true = /api/bff + Supabase (ตั้ง false เพื่อ legacy PHP) */
      useSupabaseBackend: process.env.NUXT_PUBLIC_USE_SUPABASE_BACKEND !== 'false',
      /** ว่างได้ — ลิงก์ reset password ใช้ domain จาก request */
      siteOrigin: process.env.NUXT_PUBLIC_SITE_ORIGIN || '',
      /** TURN แบบ static (ทางเลือกถ้าไม่ใช้ NUXT_METERED_API_KEY) — จาก Metered dashboard */
      turnUrls: process.env.NUXT_PUBLIC_TURN_URLS || '',
      turnUsername: process.env.NUXT_PUBLIC_TURN_USERNAME || '',
      turnCredential: process.env.NUXT_PUBLIC_TURN_CREDENTIAL || '',
      /** Agora.io RTC — 10,000 นาทีฟรี/เดือน (แนะนำแทน TURN เอง) */
      useAgoraRtc: process.env.NUXT_PUBLIC_USE_AGORA_RTC === 'true',
      agoraAppId: process.env.NUXT_PUBLIC_AGORA_APP_ID || '',
    }
  }
})