type DbSql = ReturnType<typeof useDb>;

function mapServiceStatus(consultStatus: string): string {
    switch (String(consultStatus || '').trim()) {
        case 'waiting':
            return 'pending';
        case 'accepted':
            return 'in_progress';
        case 'completed':
            return 'completed';
        case 'cancelled':
        case 'rejected':
            return 'cancelled';
        default:
            return 'pending';
    }
}

function mapServiceFormat(method: string): string {
    const m = String(method || '').trim().toLowerCase();
    if (m === 'in_store' || m === 'store') return 'in_store';
    return 'online';
}

function mapServiceType(privilege: string): string {
    return privilege === 'gold_card' ? 'gold_card' : 'normal';
}

function buildServiceCode(consultId: number, existingCode?: string): string {
    const preset = String(existingCode || '').trim();
    if (preset) return preset.slice(0, 32);
    return `SRV-${String(consultId).padStart(3, '0')}`.slice(0, 32);
}

/** สร้าง/อัปเดต service_usage จาก consult_requests — ให้หน้า admin การให้บริการทำงานเมื่อมีการใช้บริการจริง */
export async function syncServiceUsageForConsult(sql: DbSql, consultId: number) {
    if (consultId <= 0) return;

    const rows = await sql`
        SELECT cr.id, cr.id_account, cr.id_pharma, cr.status, cr.privilege,
               cr.consult_method, cr.booking_type, cr.delivery_prepaid, cr.created_at,
               COALESCE(cr.is_deleted, 0) AS is_deleted,
               TRIM(CONCAT(COALESCE(a.firstname, ''), ' ', COALESCE(a.lastname, ''))) AS account_full_name,
               COALESCE(NULLIF(TRIM(a.username_account), ''), '') AS account_username,
               TRIM(CONCAT(COALESCE(p.firstname_pharma, ''), ' ', COALESCE(p.lastname_pharma, ''))) AS pharma_full_name,
               COALESCE(NULLIF(TRIM(p.username_pharma), ''), '') AS pharma_username,
               COALESCE(
                   NULLIF(TRIM(d.store_name), ''),
                   NULLIF(TRIM(p.store_name), ''),
                   NULLIF(TRIM(sa.firstname), '')
               ) AS store_name
        FROM consult_requests cr
        LEFT JOIN account a ON a.id_account = cr.id_account
        LEFT JOIN pharmacist_account p ON p.id_pharma = cr.id_pharma
        LEFT JOIN phamacy_store_details d ON d.id_store_accounts = p.id_store
        LEFT JOIN phamacy_store_accounts sa ON sa.id_store_accounts = p.id_store
        WHERE cr.id = ${consultId}
        LIMIT 1
    `;
    const row = rows[0];
    if (!row) return;

    const isDeleted = Number(row.is_deleted) === 1;
    const rawStatus = String(row.status || '');
    const serviceStatus = isDeleted ? 'cancelled' : mapServiceStatus(rawStatus);
    const userName = String(row.account_full_name || '').trim()
        || String(row.account_username || '').trim()
        || `ผู้ใช้ #${Number(row.id_account || 0)}`;
    const pharmaName = String(row.pharma_full_name || '').trim()
        || String(row.pharma_username || '').trim()
        || `เภสัช #${Number(row.id_pharma || 0)}`;
    const serviceType = mapServiceType(String(row.privilege || 'normal'));
    const serviceFormat = mapServiceFormat(String(row.consult_method || 'chat'));

    const existing = await sql`
        SELECT id_service_usage, service_code
        FROM service_usage
        WHERE id_consult_request = ${consultId}
        LIMIT 1
    `;
    const serviceCode = buildServiceCode(consultId, String(existing[0]?.service_code || ''));

    if (isDeleted && !existing[0]) return;

    if (existing[0]) {
        await sql`
            UPDATE service_usage SET
                id_account = ${row.id_account},
                id_pharma = ${row.id_pharma},
                user_name = ${userName},
                pharmacist_name = ${pharmaName},
                service_type = ${serviceType},
                service_format = ${serviceFormat},
                service_status = ${serviceStatus},
                consult_method = ${row.consult_method},
                booking_type = ${row.booking_type},
                delivery_prepaid = ${Number(row.delivery_prepaid) || 0},
                raw_status = ${rawStatus},
                service_date = COALESCE(service_date, ${row.created_at}),
                completed_at = CASE
                    WHEN ${serviceStatus} = 'completed' THEN COALESCE(completed_at, NOW())
                    ELSE NULL
                END,
                updated_at = NOW()
            WHERE id_consult_request = ${consultId}
        `;
        return;
    }

    const completedAt = serviceStatus === 'completed' ? row.created_at : null;
    await sql`
        INSERT INTO service_usage (
            service_code, id_consult_request, id_account, id_pharma,
            user_name, pharmacist_name, service_type, service_format,
            service_status, consult_method, booking_type, delivery_prepaid,
            raw_status, note, service_date, completed_at, created_at, updated_at
        ) VALUES (
            ${serviceCode},
            ${consultId},
            ${row.id_account},
            ${row.id_pharma},
            ${userName},
            ${pharmaName},
            ${serviceType},
            ${serviceFormat},
            ${serviceStatus},
            ${row.consult_method},
            ${row.booking_type},
            ${Number(row.delivery_prepaid) || 0},
            ${rawStatus},
            NULL,
            ${row.created_at},
            ${completedAt},
            ${row.created_at},
            NOW()
        )
    `;
}

export async function syncServiceUsageForConsultIds(sql: DbSql, consultIds: number[]) {
    for (const id of consultIds) {
        if (id > 0) await syncServiceUsageForConsult(sql, id);
    }
}
