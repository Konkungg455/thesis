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
            CREATE TABLE IF NOT EXISTS login_lockout (
                role VARCHAR(20) NOT NULL,
                email VARCHAR(255) NOT NULL,
                failed_attempts INT NOT NULL DEFAULT 0,
                locked_until TIMESTAMPTZ NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (role, email)
            )
        `;

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

        await sql`
            CREATE TABLE IF NOT EXISTS store_transactions (
                id_store_transaction SERIAL PRIMARY KEY,
                id_store INT NOT NULL,
                tx_type VARCHAR(20) NOT NULL,
                source_id INT NOT NULL,
                doc_no VARCHAR(64),
                customer_name VARCHAR(255),
                id_pharma INT,
                pharmacist_name VARCHAR(255),
                amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
                slip_image VARCHAR(255),
                tx_status VARCHAR(20) NOT NULL DEFAULT 'active',
                tx_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (tx_type, source_id)
            )
        `;
        await sql.unsafe(`
            CREATE INDEX IF NOT EXISTS idx_store_transactions_store_tx_at
            ON store_transactions (id_store, tx_at DESC)
        `);

        await sql`
            CREATE TABLE IF NOT EXISTS contact_messages (
                id SERIAL PRIMARY KEY,
                full_name VARCHAR(255) NOT NULL,
                phone VARCHAR(64) NOT NULL,
                email VARCHAR(255) NOT NULL,
                subject VARCHAR(128) NOT NULL,
                message TEXT NOT NULL DEFAULT '',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `;
        await sql.unsafe(`
            CREATE INDEX IF NOT EXISTS idx_contact_messages_created_at
            ON contact_messages (created_at DESC)
        `);

        await sql`
            CREATE TABLE IF NOT EXISTS user_presence (
                role VARCHAR(20) NOT NULL,
                entity_id INT NOT NULL,
                last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (role, entity_id)
            )
        `;
        await sql.unsafe(`
            CREATE INDEX IF NOT EXISTS idx_user_presence_last_seen
            ON user_presence (last_seen_at DESC)
        `);
    }).catch(() => {
        schemaReady = false;
    });
}
