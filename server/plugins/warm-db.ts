import { isDbConfigured } from '../utils/db';
import { ensureBffSchema } from '../utils/bff/ensureSchema';
import { isSupabaseConfigured, useSupabaseServer } from '../utils/supabase';

/** อุ่น schema + Supabase client ตอน server เริ่ม (DB ping อยู่ใน 00-warm-db.ts) */
export default defineNitroPlugin(() => {
    if (isDbConfigured()) {
        ensureBffSchema().catch(() => {});
    }
    if (isSupabaseConfigured()) {
        try {
            useSupabaseServer();
        } catch {
            /* ignore */
        }
    }
});
