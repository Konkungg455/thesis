import type { H3Event } from 'h3';
import { getAuthContext } from './sessionContext';
import { sendPrescriptionEmailInternal, buildPrescriptionEmailPreviewInternal } from '../../utils/prescription/email';
import { resolveAccountPatientName } from './patientInfo';

type RxPayload = Record<string, unknown>;

async function resolveConsultRequestIdForRx(
    sql: ReturnType<typeof useDb>,
    idPharma: number,
    idAccount: number,
): Promise<number> {
    if (idPharma <= 0 || idAccount <= 0) return 0;

    const accepted = await sql`
        SELECT id FROM consult_requests
        WHERE id_pharma = ${idPharma}
          AND id_account = ${idAccount}
          AND status = 'accepted'
        ORDER BY id DESC
        LIMIT 1
    `;
    if (accepted[0]) return Number(accepted[0].id);

    const completed = await sql`
        SELECT id FROM consult_requests
        WHERE id_pharma = ${idPharma}
          AND id_account = ${idAccount}
          AND status = 'completed'
        ORDER BY id DESC
        LIMIT 1
    `;
    return Number(completed[0]?.id || 0);
}

async function fetchDoctorName(sql: ReturnType<typeof useDb>, idPharma: number): Promise<string> {
    const rows = await sql`
        SELECT firstname_pharma, lastname_pharma
        FROM pharmacist_account
        WHERE id_pharma = ${idPharma}
        LIMIT 1
    `;
    const row = rows[0];
    if (!row) return '';
    const name = `${row.firstname_pharma || ''} ${row.lastname_pharma || ''}`.trim();
    return name ? `ภก. ${name}` : '';
}

export async function handleSavePrescription(event: H3Event) {
    const auth = getAuthContext(event);
    const idPharma = auth.id_pharma || 0;

    if (idPharma <= 0) {
        return { status: 'error', message: 'กรุณาเข้าสู่ระบบในฐานะเภสัชกรก่อนบันทึก' };
    }

    const data = await readBody(event).catch(() => null) as RxPayload | null;
    if (!data || typeof data !== 'object') {
        return { status: 'error', message: 'ไม่ได้รับข้อมูล JSON หรือรูปแบบข้อมูลไม่ถูกต้อง' };
    }

    let customerCode = String(data.customer_code || '').trim();
    const clinicName = String(data.clinic_name || '').trim();
    const clinicWebsite = String(data.clinic_website || '').trim();
    const docNo = String(data.doc_no || '').trim();
    const patient = String(data.patient_name || '').trim();
    const pDate = String(data.prescription_date || '').trim();
    const hn = String(data.hn_no || '').trim();
    const df = String(data.df_value || '').trim();
    const details = String(data.med_details || '').trim();
    const qty = String(data.med_qty || '').trim();
    const price = String(data.med_price || '').trim();
    const total = String(data.total_amount || '').trim();
    let doctor = String(data.doctor_name || '').trim();
    const idAccount = Number(data.id_account || 0);
    const skipTracking = Boolean(data.skip_tracking);

    if (!customerCode && idAccount > 0) {
        customerCode = `CT-${String(idAccount).padStart(7, '0')}`;
    }

    const result = await dbQuery(async (sql) => {
        const doctorFromDb = await fetchDoctorName(sql, idPharma);
        if (doctorFromDb) doctor = doctorFromDb;

        let resolvedPatient = patient;
        if (idAccount > 0) {
            resolvedPatient = await resolveAccountPatientName(sql, idAccount, patient);
        }

        const placeholderRows = idAccount > 0
            ? await sql`
                SELECT id FROM prescriptions
                WHERE id_account = ${idAccount}
                  AND id_pharma = ${idPharma}
                  AND auto_created = 1
                  AND (med_details IS NULL OR med_details = '')
                ORDER BY created_at DESC
                LIMIT 1
            `
            : [];
        const placeholderId = Number(placeholderRows[0]?.id || 0);

        let insertedId = 0;

        if (placeholderId > 0) {
            await sql`
                UPDATE prescriptions SET
                    customer_code = ${customerCode || null},
                    clinic_name = ${clinicName || null},
                    clinic_website = ${clinicWebsite || null},
                    doc_no = ${docNo || null},
                    patient_name = ${resolvedPatient || null},
                    prescription_date = ${pDate || null},
                    hn_no = ${hn || null},
                    df_value = ${df || null},
                    med_details = ${details || null},
                    med_qty = ${qty || null},
                    med_price = ${price || null},
                    total_amount = ${total || null},
                    doctor_name = ${doctor || null},
                    auto_created = 0
                WHERE id = ${placeholderId}
            `;
            insertedId = placeholderId;
        } else {
            const inserted = await sql`
                INSERT INTO prescriptions (
                    customer_code, id_account, id_pharma, clinic_name, clinic_website,
                    doc_no, patient_name, prescription_date,
                    hn_no, df_value, med_details, med_qty, med_price, total_amount,
                    doctor_name, created_at
                ) VALUES (
                    ${customerCode || null}, ${idAccount || null}, ${idPharma},
                    ${clinicName || null}, ${clinicWebsite || null},
                    ${docNo || null}, ${resolvedPatient || null}, ${pDate || null},
                    ${hn || null}, ${df || null}, ${details || null},
                    ${qty || null}, ${price || null}, ${total || null},
                    ${doctor || null}, NOW()
                )
                RETURNING id
            `;
            insertedId = Number(inserted[0]?.id || 0);
        }

        if (insertedId <= 0) {
            return { error: 'บันทึกไม่สำเร็จ' };
        }

        const billNo = docNo || `B-${String(insertedId).padStart(6, '0')}`;

        if (idAccount > 0 && details !== '') {
            if (skipTracking) {
                await sql`
                    UPDATE prescriptions
                    SET tracking_status = 'pending', auto_created = 0
                    WHERE id = ${insertedId}
                `;
            } else {
                const consultId = await resolveConsultRequestIdForRx(sql, idPharma, idAccount);
                if (consultId > 0) {
                    await sql`
                        UPDATE prescriptions SET
                            tracking_status = 'active',
                            auto_created = 0,
                            id_consult_request = COALESCE(NULLIF(id_consult_request, 0), ${consultId}),
                            last_followup_at = COALESCE(last_followup_at, NOW())
                        WHERE id = ${insertedId}
                    `;
                } else {
                    await sql`
                        UPDATE prescriptions
                        SET tracking_status = 'active', auto_created = 0
                        WHERE id = ${insertedId}
                    `;
                }
            }
        }

        let notifySent = false;
        if (idAccount > 0) {
            const totalLine = total ? `\nยอดรวม: ${total} บาท` : '';
            const systemMessage = `ใบสรุปรายการยาออกเรียบร้อยแล้ว\n`
                + `เลขที่บิล: ${billNo}\n`
                + `วันที่: ${pDate || new Date().toISOString().slice(0, 10)}${totalLine}\n`
                + `[PRESCRIPTION_PDF:${insertedId}]`;

            try {
                await sql`
                    INSERT INTO chat_messages (sender_id, receiver_id, sender_role, message_text, file_path)
                    VALUES (${idPharma}, ${idAccount}, 'pharma', ${systemMessage}, NULL)
                `;
                notifySent = true;
            } catch {
                notifySent = false;
            }
        }

        const emailRes = idAccount > 0
            ? await sendPrescriptionEmailInternal(sql, insertedId)
            : {
                ok: false,
                message: '',
                sent_to: '',
                payment_qr_attached: false,
                payment_bank_included: false,
            };

        return {
            insertedId,
            billNo,
            notifySent,
            emailRes,
        };
    });

    if (!result) {
        return { status: 'error', message: 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้' };
    }
    if ('error' in result) {
        return { status: 'error', message: result.error };
    }

    return {
        status: 'success',
        message: 'บันทึกข้อมูลเรียบร้อยแล้ว',
        inserted_id: result.insertedId,
        bill_no: result.billNo,
        notified_patient: result.notifySent,
        email_sent: result.emailRes.ok,
        email_to: result.emailRes.sent_to,
        email_error: result.emailRes.ok ? '' : result.emailRes.message,
        payment_qr_attached: result.emailRes.payment_qr_attached,
        payment_bank_included: result.emailRes.payment_bank_included,
    };
}

export async function handleGetPrescriptionDetail(event: H3Event) {
    const query = getQuery(event);
    const auth = getAuthContext(event);
    const id = Number(query.id || 0);

    if (id <= 0) {
        return { status: 'error', message: 'Missing ID' };
    }

    if (!auth.isAdmin && !auth.id_account && !auth.id_pharma && !auth.id_account_admin) {
        return { status: 'error', message: 'กรุณาเข้าสู่ระบบก่อน' };
    }

    const row = await dbQuery(async (sql) => {
        const rows = await sql`SELECT * FROM prescriptions WHERE id = ${id} LIMIT 1`;
        return rows[0] as Record<string, unknown> | undefined;
    });

    if (!row) {
        return { status: 'error', message: 'Not found' };
    }

    const isAdmin = auth.isAdmin;
    const isOwner = auth.id_account != null && Number(row.id_account) === auth.id_account;
    const isAuthor = auth.id_pharma != null && Number(row.id_pharma) === auth.id_pharma;

    if (!isAdmin && !isOwner && !isAuthor) {
        return { status: 'error', message: 'คุณไม่มีสิทธิ์ดูใบสรุปรายการยานี้' };
    }

    return { status: 'success', data: row };
}

export async function handleSendPrescriptionEmail(event: H3Event) {
    const query = getQuery(event);
    const body = await readBody(event).catch(() => ({})) as Record<string, unknown>;
    const auth = getAuthContext(event, body);

    if (!auth.isAdmin && !auth.id_account && !auth.id_pharma && !auth.id_account_admin) {
        return { status: 'error', message: 'กรุณาเข้าสู่ระบบก่อน' };
    }

    const id = Number(body.id ?? query.id ?? 0);
    const to = body.to != null ? String(body.to).trim() : null;

    if (id <= 0) {
        return { status: 'error', message: 'ระบุ prescription id ไม่ถูกต้อง' };
    }

    const row = await dbQuery(async (sql) => {
        const rows = await sql`SELECT * FROM prescriptions WHERE id = ${id} LIMIT 1`;
        return rows[0] as Record<string, unknown> | undefined;
    });

    if (!row) {
        return { status: 'error', message: 'ไม่พบใบสรุปรายการยา' };
    }

    const isAdmin = auth.isAdmin;
    const isOwner = auth.id_account != null && Number(row.id_account) === auth.id_account;
    const isAuthor = auth.id_pharma != null && Number(row.id_pharma) === auth.id_pharma;

    if (!isAdmin && !isOwner && !isAuthor) {
        return { status: 'error', message: 'ไม่มีสิทธิ์ส่งใบสรุปรายการยานี้' };
    }

    const res = await dbQuery(async (sql) => sendPrescriptionEmailInternal(sql, id, to));

    if (!res) {
        return { status: 'error', message: 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้' };
    }

    return {
        status: res.ok ? 'success' : 'error',
        message: res.message,
        sent_to: res.sent_to,
        payment_qr_attached: res.payment_qr_attached,
        payment_bank_included: res.payment_bank_included,
    };
}

function canAccessPrescription(
    auth: ReturnType<typeof getAuthContext>,
    row: Record<string, unknown>,
): boolean {
    if (auth.isAdmin) return true;
    if (auth.id_account != null && Number(row.id_account) === auth.id_account) return true;
    if (auth.id_pharma != null && Number(row.id_pharma) === auth.id_pharma) return true;
    return false;
}

export async function handlePreviewPrescriptionEmail(event: H3Event) {
    const query = getQuery(event);
    const auth = getAuthContext(event);

    if (!auth.isAdmin && !auth.id_account && !auth.id_pharma && !auth.id_account_admin) {
        return { status: 'error', message: 'กรุณาเข้าสู่ระบบก่อน' };
    }

    const id = Number(query.id ?? 0);
    if (id <= 0) {
        return { status: 'error', message: 'ระบุ prescription id ไม่ถูกต้อง' };
    }

    const row = await dbQuery(async (sql) => {
        const rows = await sql`SELECT * FROM prescriptions WHERE id = ${id} LIMIT 1`;
        return rows[0] as Record<string, unknown> | undefined;
    });

    if (!row) {
        return { status: 'error', message: 'ไม่พบใบสรุปรายการยา' };
    }

    if (!canAccessPrescription(auth, row)) {
        return { status: 'error', message: 'ไม่มีสิทธิ์ดูตัวอย่างอีเมลใบสรุปรายการยานี้' };
    }

    const preview = await dbQuery(async (sql) => buildPrescriptionEmailPreviewInternal(sql, id));
    if (!preview) {
        return { status: 'error', message: 'ไม่พบใบสรุปรายการยา' };
    }

    return {
        status: 'success',
        data: preview,
    };
}
