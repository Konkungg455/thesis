type DbSql = ReturnType<typeof useDb>;

/** สร้าง/อัปเดต store_transactions จาก prescriptions — ให้ดูใน Supabase Table Editor ได้ตรงกับหน้า Statement */
export async function syncStoreTransactionFromPrescription(sql: DbSql, prescriptionId: number) {
    if (prescriptionId <= 0) return;

    const rows = await sql`
        SELECT p.id, p.doc_no, p.patient_name, p.total_amount, p.created_at,
               ph.id_pharma, ph.id_store,
               TRIM(CONCAT(COALESCE(ph.firstname_pharma, ''), ' ', COALESCE(ph.lastname_pharma, ''))) AS pharma_name
        FROM prescriptions p
        LEFT JOIN pharmacist_account ph ON ph.id_pharma = p.id_pharma
        WHERE p.id = ${prescriptionId}
        LIMIT 1
    `;
    const row = rows[0];
    if (!row || Number(row.id_store || 0) <= 0) return;

    const storeId = Number(row.id_store);
    const amount = Number(row.total_amount || 0);
    const customerName = String(row.patient_name || '').trim() || 'ลูกค้า';
    const pharmaName = String(row.pharma_name || '').trim() || `เภสัช #${Number(row.id_pharma || 0)}`;
    const txAt = row.created_at || new Date();

    const existing = await sql`
        SELECT id_store_transaction FROM store_transactions
        WHERE tx_type = 'prescription' AND source_id = ${prescriptionId}
        LIMIT 1
    `;

    if (existing[0]) {
        await sql`
            UPDATE store_transactions SET
                id_store = ${storeId},
                doc_no = ${row.doc_no},
                customer_name = ${customerName},
                id_pharma = ${row.id_pharma},
                pharmacist_name = ${pharmaName},
                amount = ${amount},
                tx_status = 'active',
                tx_at = ${txAt},
                updated_at = NOW()
            WHERE tx_type = 'prescription' AND source_id = ${prescriptionId}
        `;
        return;
    }

    await sql`
        INSERT INTO store_transactions (
            id_store, tx_type, source_id, doc_no, customer_name,
            id_pharma, pharmacist_name, amount, slip_image, tx_status, tx_at
        ) VALUES (
            ${storeId}, 'prescription', ${prescriptionId}, ${row.doc_no}, ${customerName},
            ${row.id_pharma}, ${pharmaName}, ${amount}, NULL, 'active', ${txAt}
        )
    `;
}

/** สร้าง/อัปเดต store_transactions จาก pharmacy_billing_slips ที่อนุมัติแล้ว */
export async function syncStoreTransactionFromSlip(sql: DbSql, slipId: number) {
    if (slipId <= 0) return;

    const rows = await sql`
        SELECT b.id, b.id_store, b.id_pharma, b.amount, b.slip_image, b.status,
               b.created_at, b.reviewed_at,
               TRIM(CONCAT(COALESCE(ph.firstname_pharma, ''), ' ', COALESCE(ph.lastname_pharma, ''))) AS pharma_name
        FROM pharmacy_billing_slips b
        LEFT JOIN pharmacist_account ph ON ph.id_pharma = b.id_pharma
        WHERE b.id = ${slipId}
        LIMIT 1
    `;
    const row = rows[0];
    if (!row || Number(row.id_store || 0) <= 0) return;

    const status = String(row.status || '');
    if (status === 'rejected') {
        await sql`
            UPDATE store_transactions SET tx_status = 'cancelled', updated_at = NOW()
            WHERE tx_type = 'slip' AND source_id = ${slipId}
        `;
        return;
    }
    if (status !== 'approved') return;

    const storeId = Number(row.id_store);
    const amount = Number(row.amount || 0);
    const pharmaName = String(row.pharma_name || '').trim() || `เภสัช #${Number(row.id_pharma || 0)}`;
    const txAt = row.reviewed_at || row.created_at || new Date();

    const existing = await sql`
        SELECT id_store_transaction FROM store_transactions
        WHERE tx_type = 'slip' AND source_id = ${slipId}
        LIMIT 1
    `;

    if (existing[0]) {
        await sql`
            UPDATE store_transactions SET
                id_store = ${storeId},
                customer_name = 'โอนเข้าบัญชี',
                id_pharma = ${row.id_pharma},
                pharmacist_name = ${pharmaName},
                amount = ${amount},
                slip_image = ${row.slip_image},
                tx_status = 'active',
                tx_at = ${txAt},
                updated_at = NOW()
            WHERE tx_type = 'slip' AND source_id = ${slipId}
        `;
        return;
    }

    await sql`
        INSERT INTO store_transactions (
            id_store, tx_type, source_id, doc_no, customer_name,
            id_pharma, pharmacist_name, amount, slip_image, tx_status, tx_at
        ) VALUES (
            ${storeId}, 'slip', ${slipId}, NULL, 'โอนเข้าบัญชี',
            ${row.id_pharma}, ${pharmaName}, ${amount}, ${row.slip_image}, 'active', ${txAt}
        )
    `;
}

export async function backfillStoreTransactions(sql: DbSql) {
    const rxIds = await sql`
        SELECT p.id FROM prescriptions p
        JOIN pharmacist_account ph ON ph.id_pharma = p.id_pharma
        WHERE ph.id_store IS NOT NULL AND ph.id_store > 0
        ORDER BY p.id
    `;
    for (const r of rxIds) {
        await syncStoreTransactionFromPrescription(sql, Number(r.id || 0));
    }

    const slipIds = await sql`
        SELECT id FROM pharmacy_billing_slips WHERE status = 'approved' ORDER BY id
    `;
    for (const r of slipIds) {
        await syncStoreTransactionFromSlip(sql, Number(r.id || 0));
    }
}
