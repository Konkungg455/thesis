import type { H3Event } from 'h3';

async function fetchSymptomForConsult(
    sql: ReturnType<typeof useDb>,
    consultId: number,
    idAccount: number,
): Promise<string> {
    if (consultId <= 0 || idAccount <= 0) return '';
    const req = await sql`
        SELECT bot_session_id FROM consult_requests
        WHERE id = ${consultId} AND id_account = ${idAccount}
        LIMIT 1
    `;
    const sess = String(req[0]?.bot_session_id || '').trim();
    if (!sess) return '';
    const hist = await sql`
        SELECT symptom_name FROM chat_history
        WHERE id_account = ${idAccount}
          AND session_id = ${sess}
          AND COALESCE(is_deleted, 0) = 0
          AND symptom_name IS NOT NULL
          AND symptom_name <> ''
        ORDER BY created_at ASC, id ASC
        LIMIT 1
    `;
    return String(hist[0]?.symptom_name || '').trim();
}

async function fetchLatestSymptom(sql: ReturnType<typeof useDb>, idAccount: number): Promise<string> {
    const rows = await sql`
        SELECT symptom_name FROM chat_history
        WHERE id_account = ${idAccount}
          AND symptom_name IS NOT NULL
          AND symptom_name <> ''
          AND COALESCE(is_deleted, 0) = 0
        ORDER BY created_at DESC, id DESC
        LIMIT 1
    `;
    return String(rows[0]?.symptom_name || '').trim();
}

async function findInAccount(
    sql: ReturnType<typeof useDb>,
    id: number,
    consultId = 0,
) {
    const rows = await sql`
        SELECT firstname, lastname, username_account, images_account
        FROM account WHERE id_account = ${id} LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;

    const first = String(row.firstname || '').trim();
    const last = String(row.lastname || '').trim();
    let fullName = `${first} ${last}`.trim();
    if (!fullName) {
        fullName = String(row.username_account || '').trim() || `ผู้ป่วยคนที่ ${id}`;
    }
    const imgFile = String(row.images_account || '').trim();
    const imageUrl = imgFile ? `images_account/${imgFile}` : 'images_account/default.png';
    const symptom = consultId > 0
        ? (await fetchSymptomForConsult(sql, consultId, id)) || (await fetchLatestSymptom(sql, id))
        : await fetchLatestSymptom(sql, id);

    return {
        role: 'user',
        patient_name: fullName,
        firstname: first,
        lastname: last,
        image_url: imageUrl,
        symptom_name: symptom,
    };
}

async function findInPharma(sql: ReturnType<typeof useDb>, id: number) {
    const rows = await sql`
        SELECT firstname_pharma, lastname_pharma, images_pharma, username_pharma
        FROM pharmacist_account WHERE id_pharma = ${id} LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;

    const first = String(row.firstname_pharma || '').trim();
    const last = String(row.lastname_pharma || '').trim();
    let fullName = `${first} ${last}`.trim();
    if (!fullName) fullName = String(row.username_pharma || '').trim() || 'เภสัชกร';
    const imgFile = String(row.images_pharma || '').trim();
    const imageUrl = imgFile ? `images_pharma/${imgFile}` : 'images_pharma/default.png';

    return {
        role: 'pharma',
        patient_name: `ภก. ${fullName}`,
        firstname: first,
        lastname: last,
        image_url: imageUrl,
    };
}

export async function handleGetPatientInfo(event: H3Event) {
    const query = getQuery(event);
    const idInput = String(query.id || '').replace(/\D/g, '');
    const id = Number(idInput);
    const consultId = Number(query.consult_id || 0);
    const roleHint = String(query.lookup || query.role || '').trim().toLowerCase();

    if (id <= 0) {
        return { status: 'error', message: 'ไม่พบรหัสผู้ป่วย' };
    }

    const data = await dbQuery(async (sql) => {
        if (roleHint === 'pharma' || roleHint === 'pharmacist') {
            return (await findInPharma(sql, id)) || (await findInAccount(sql, id, consultId));
        }
        return (await findInAccount(sql, id, consultId)) || (await findInPharma(sql, id));
    });

    if (!data) {
        return { status: 'error', message: 'ไม่พบข้อมูล' };
    }

    return { status: 'success', data };
}
