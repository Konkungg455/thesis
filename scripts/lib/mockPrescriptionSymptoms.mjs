/**
 * ผูกใบสรุปรายการยา mock กับ consult_requests + chat_history.symptom_name
 * เพื่อให้ /admin/prescriptions_admin แสดงอาการจาก 32 อาการ
 */
export function mockRxSessionId(marker) {
    return `mock-rx-${String(marker || '').trim().toLowerCase()}`;
}

export async function ensureMockPrescriptionSymptom(sql, {
    prescriptionId,
    userId,
    pharmaId,
    symptomName,
    createdAt,
    marker,
}) {
    if (!prescriptionId || !userId || !pharmaId || !symptomName) {
        throw new Error('ensureMockPrescriptionSymptom: missing required fields');
    }

    const sessionId = mockRxSessionId(marker);
    const createdIso = createdAt instanceof Date ? createdAt.toISOString() : String(createdAt || new Date().toISOString());
    const userMessage = `มีอาการ${symptomName}`;

    const [rxRow] = await sql`
        SELECT id_consult_request FROM prescriptions WHERE id = ${prescriptionId} LIMIT 1
    `;
    let consultId = Number(rxRow?.id_consult_request || 0);

    if (consultId > 0) {
        await sql`
            UPDATE consult_requests SET
                id_account = ${userId},
                id_pharma = ${pharmaId},
                status = 'completed',
                bot_session_id = COALESCE(NULLIF(TRIM(bot_session_id), ''), ${sessionId}),
                created_at = COALESCE(created_at, ${createdIso}::timestamptz)
            WHERE id = ${consultId}
        `;
    } else {
        const [consultRow] = await sql`
            INSERT INTO consult_requests (
                id_account, id_pharma, status, created_at,
                privilege, consult_method, booking_type, delivery_prepaid, bot_session_id
            ) VALUES (
                ${userId}, ${pharmaId}, 'completed', ${createdIso}::timestamptz,
                'normal', 'chat', 'now', 0, ${sessionId}
            )
            RETURNING id
        `;
        consultId = Number(consultRow?.id || 0);
        if (!consultId) {
            throw new Error(`create consult failed for prescription ${prescriptionId}`);
        }
        await sql`
            UPDATE prescriptions SET id_consult_request = ${consultId}
            WHERE id = ${prescriptionId}
        `;
    }

    const [consultSession] = await sql`
        SELECT bot_session_id FROM consult_requests WHERE id = ${consultId} LIMIT 1
    `;
    const linkedSessionId = String(consultSession?.bot_session_id || sessionId).trim() || sessionId;

    const existingChat = await sql`
        SELECT id FROM chat_history
        WHERE id_account = ${userId}
          AND session_id = ${linkedSessionId}
          AND COALESCE(is_deleted, 0) = 0
        ORDER BY id ASC
        LIMIT 1
    `;

    if (existingChat[0]) {
        await sql`
            UPDATE chat_history SET
                symptom_name = ${symptomName},
                message = ${userMessage},
                role = 'user'
            WHERE id = ${existingChat[0].id}
        `;
    } else {
        await sql`
            INSERT INTO chat_history (
                id_account, role, message, session_id, symptom_name, is_deleted, created_at
            ) VALUES (
                ${userId}, 'user', ${userMessage}, ${linkedSessionId}, ${symptomName}, 0, ${createdIso}::timestamptz
            )
        `;
    }

    return { consultId, sessionId: linkedSessionId, symptomName };
}
