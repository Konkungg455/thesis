/** ปรับ schema Supabase/Postgres ให้รองรับค่าที่ BFF ใช้ (idempotent) */
let schemaReady = false;

async function tryAlter(sql: ReturnType<typeof useDb>, statement: string) {
    try {
        await sql.unsafe(statement);
    } catch {
        /* คอลัมน์อาจกว้างพอแล้ว */
    }
}

export async function ensureBffSchema() {
    if (schemaReady || !isDbConfigured()) return;
    schemaReady = true;

    await dbQuery(async (sql) => {
        await sql`
            CREATE TABLE IF NOT EXISTS consult_chat_timer (
                id SERIAL PRIMARY KEY,
                id_account INT NOT NULL,
                id_pharma INT NOT NULL,
                request_id INT NOT NULL DEFAULT 0,
                total_seconds INT NOT NULL DEFAULT 900,
                remaining_seconds INT NOT NULL DEFAULT 900,
                status VARCHAR(20) NOT NULL DEFAULT 'running',
                user_last_seen TIMESTAMPTZ NULL,
                pharma_last_seen TIMESTAMPTZ NULL,
                last_tick_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (id_account, id_pharma)
            )
        `;

        // กัน error "value too long for type character varying(10)"
        await tryAlter(sql, `ALTER TABLE consult_requests ALTER COLUMN status TYPE VARCHAR(32)`);
        await tryAlter(sql, `ALTER TABLE service_usage ALTER COLUMN service_status TYPE VARCHAR(32)`);
        await tryAlter(sql, `ALTER TABLE service_usage ALTER COLUMN service_code TYPE VARCHAR(32)`);
        await tryAlter(sql, `ALTER TABLE chat_messages_archive ALTER COLUMN service_code TYPE VARCHAR(32)`);
        await tryAlter(sql, `ALTER TABLE chat_messages ALTER COLUMN deleted_by_role TYPE VARCHAR(32)`);
        await tryAlter(sql, `ALTER TABLE chat_messages_archive ALTER COLUMN deleted_by_role TYPE VARCHAR(32)`);
    }).catch(() => {
        schemaReady = false;
    });
}
