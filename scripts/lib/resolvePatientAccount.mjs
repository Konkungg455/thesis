/** @typedef {import('postgres').Sql} Sql */

/**
 * หา id_account จากชื่อผู้ป่วย (firstname lastname)
 * ให้ความสำคัญ demo/dummy ก่อนบัญชีจริง
 * @param {Sql} sql
 * @param {string} patientName
 * @returns {Promise<number|null>}
 */
export async function resolveAccountIdByPatientName(sql, patientName) {
    const parts = String(patientName || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return null;
    const first = parts[0];
    const last = parts.slice(1).join(' ') || parts[0];

    const rows = await sql`
        SELECT a.id_account
        FROM account a
        WHERE COALESCE(a.is_deleted, 0) = 0
          AND TRIM(a.firstname) = ${first}
          AND TRIM(a.lastname) = ${last}
        ORDER BY
            CASE
                WHEN a.email_account LIKE '%@telebot-pharmacy.test' THEN 0
                WHEN a.email_account LIKE '%@example.test' THEN 1
                WHEN a.username_account LIKE 'demo_%' THEN 2
                WHEN a.username_account LIKE 'dummy_%' THEN 3
                ELSE 4
            END,
            a.id_account ASC
        LIMIT 1
    `;
    return rows[0] ? Number(rows[0].id_account) : null;
}
