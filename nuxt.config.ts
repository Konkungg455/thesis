// https://nuxt.com/docs/api/configuration/nuxt-config

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',

  devtools: { enabled: true },

  imports: {
    imports: [
      { name: 'useApiBase', from: '~/composables/useApiBase' },
      { name: 'useAuthUser', from: '~/composables/useAuthUser' },
      { name: 'useAuthLogin', from: '~/composables/useAuthLogin' },
      { name: 'useAuthConfig', from: '~/composables/useAuthConfig' },
      { name: 'useApiBaseRef', from: '~/composables/useAuthConfig' },
      { name: 'AUTH_ROLES', from: '~/composables/useAuthConfig' },
      { name: 'buildLoginConfigs', from: '~/composables/useAuthConfig' },
      { name: 'useAiChatRules', from: '~/composables/useAiChatRules' },
      { name: 'useWebRTCCall', from: '~/composables/useWebRTCCall' },
      { name: 'useTablePagination', from: '~/composables/useTablePagination' },
      { name: 'useAppLocale', from: '~/composables/useAppLocale' },
      { name: 'useChatApi', from: '~/composables/useChatApi' },
    ],
  },

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
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Sarabun:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800&display=swap'
        },
        {
          rel: 'stylesheet',
          href: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css'
        }
      ],
      script: [
        {
          src: 'https://maps.googleapis.com/maps/api/js?key=AIzaSyCxhub76nika5eL95vmihYBl8mczVclBrA&libraries=places,geometry',
          async: true,
          defer: true
        }
      ]
    }
  },

  modules: [
    '@nuxt/image'
  ],

  // ngrok / Cloudflare Tunnel — อนุญาต host ภายนอก + proxy PHP API ผ่าน path /4 + n8n ผ่าน /n8n
  vite: {
    server: {
      allowedHosts: true,
      proxy: {
        '/4': {
          target: process.env.NUXT_PROXY_API_TARGET || 'http://127.0.0.1',
          changeOrigin: true,
          secure: false
        },
        // 🆕 proxy n8n webhook → ใช้งานผ่าน ngrok ได้
        //    /n8n/webhook/xxx  →  http://127.0.0.1:5678/webhook/xxx
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

  // Nitro — API route /api/ai-chat + proxy สำรอง
  nitro: {
    routeRules: {
      '/api/**': { cors: true },
    },
  },

  runtimeConfig: {
    /** service role — ใช้ฝั่ง server เท่านั้น (optional) */
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    /** n8n URL สำหรับ Vercel/production (ngrok หรือ VPS) — ไม่ใช่ localhost */
    n8nInternalUrl: process.env.NUXT_N8N_INTERNAL_URL || process.env.NUXT_PUBLIC_N8N_BASE || '',
    public: {
      /** ถ้าไม่ตั้ง จะใช้ http://{hostname ปัจจุบัน}/4 อัตโนมัติ */
      apiBase: process.env.NUXT_PUBLIC_API_BASE || '',
      /** n8n base — ถ้าไม่ตั้ง จะใช้ http://{hostname ปัจจุบัน}:5678 อัตโนมัติ */
      n8nBase: process.env.NUXT_PUBLIC_N8N_BASE || '',
      /** webhook ID ของ chatbot ใน n8n */
      n8nChatWebhookId: process.env.NUXT_PUBLIC_N8N_CHAT_WEBHOOK_ID || '1f5ea30f-2ff0-4d32-b211-eccb342ee0df',
      supabaseStorageBucket: process.env.SUPABASE_STORAGE_BUCKET || 'media',
      supabaseUrl: process.env.NUXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
      supabaseKey: process.env.NUXT_PUBLIC_SUPABASE_KEY || process.env.SUPABASE_KEY || '',
      /** true = ใช้ /api/bff + Supabase แทน XAMPP (default เมื่อมี SUPABASE_URL) */
      useSupabaseBackend: process.env.NUXT_PUBLIC_USE_SUPABASE_BACKEND !== 'false',
    }
  }
})