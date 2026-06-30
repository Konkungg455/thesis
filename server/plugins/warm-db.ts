/** อุ่น connection DB ตอน server เริ่ม — ลด latency ครั้งแรกหลัง login */
export default defineNitroPlugin(() => {
    if (!isDbConfigured()) return;
    dbQuery(async (sql) => {
        await sql`SELECT 1 AS ok`;
    }).catch(() => {});
});
