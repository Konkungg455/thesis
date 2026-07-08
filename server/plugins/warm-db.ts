/** อุ่น connection DB + Supabase client ตอน server เริ่ม */
export default defineNitroPlugin(() => {
    if (isDbConfigured()) {
        ensureBffSchema().catch(() => {});
        dbQuery(async (sql) => {
            await sql`SELECT 1 AS ok`;
        }).catch(() => {});
    }
    if (isSupabaseConfigured()) {
        try {
            useSupabaseServer();
        } catch {
            /* ignore */
        }
    }
});
