import { randomBytes } from 'node:crypto';
import type { H3Event } from 'h3';
import { getArrayField, readMultipartRequest } from './formData';
import { getAuthContext, parsePositiveInt } from './sessionContext';
import { uploadMediaFile, mimeFromExt } from '../../utils/storageUpload';

const VALID_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export async function handleUpdatePharmaProfile(event: H3Event) {
    const { fields, arrays, files } = await readMultipartRequest(event);
    const auth = getAuthContext(event, fields);
    const id = auth.id_pharma;

    if (!id) {
        return { status: 'error', message: 'กรุณาเข้าสู่ระบบในฐานะเภสัชกร' };
    }

    const phone = String(fields.phone_pharma || '').trim();
    const workDays = getArrayField(fields, arrays, 'work_day');
    const workStarts = getArrayField(fields, arrays, 'work_start');
    const workEnds = getArrayField(fields, arrays, 'work_end');
    const scheduleParts: string[] = [];
    for (let i = 0; i < workDays.length; i++) {
        const day = workDays[i]?.trim();
        const start = workStarts[i]?.trim();
        const end = workEnds[i]?.trim();
        if (day && start && end) scheduleParts.push(`${day} (${start}-${end})`);
    }
    const workTime = scheduleParts.join(', ');

    await dbQuery(async (sql) => {
        await sql`
            UPDATE pharmacist_account
            SET phone_pharma = ${phone}, work_time = ${workTime}
            WHERE id_pharma = ${id}
        `;

        if (fields.id_store !== undefined) {
            const raw = String(fields.id_store || '').trim();
            if (raw === '') {
                await sql`UPDATE pharmacist_account SET id_store = NULL, pending_store_id = NULL WHERE id_pharma = ${id}`;
            } else {
                const newStoreId = Number(raw);
                const current = await sql`
                    SELECT id_store FROM pharmacist_account WHERE id_pharma = ${id} LIMIT 1
                `;
                const currentStoreId = current[0]?.id_store != null ? Number(current[0].id_store) : null;
                if (newStoreId > 0 && newStoreId !== currentStoreId) {
                    await sql`
                        UPDATE pharmacist_account SET pending_store_id = ${newStoreId} WHERE id_pharma = ${id}
                    `;
                }
            }
        }

        const passwordNew = String(fields.password_new || '');
        const passwordConfirm = String(fields.password_confirm || '');
        if (passwordNew && passwordNew === passwordConfirm) {
            const salt = randomBytes(16).toString('hex');
            const hash = await hashPassword(passwordNew, salt);
            await sql`
                UPDATE pharmacist_account
                SET password_pharma = ${hash}, salt_pharma = ${salt}
                WHERE id_pharma = ${id}
            `;
        }
    });

    let newImage: string | null = null;
    const avatar = files.images_pharma;
    if (avatar?.data?.length) {
        const ext = (avatar.filename || '').split('.').pop()?.toLowerCase() || '';
        if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
            return { status: 'error', message: 'รองรับเฉพาะไฟล์ JPG, PNG หรือ WEBP เท่านั้น' };
        }
        newImage = `pharma_profile_${id}_${Date.now()}_${randomBytes(4).toString('hex')}.${ext}`;
        const old = await dbQuery(async (sql) => {
            const rows = await sql`SELECT images_pharma FROM pharmacist_account WHERE id_pharma = ${id} LIMIT 1`;
            return rows[0];
        });
        if (old?.images_pharma) await deleteMediaFile('images_pharma', String(old.images_pharma));
        await uploadMediaFile('images_pharma', newImage, avatar.data, mimeFromExt(ext));
        await dbQuery(async (sql) => sql`
            UPDATE pharmacist_account SET images_pharma = ${newImage} WHERE id_pharma = ${id}
        `);
    }

    const row = await dbQuery(async (sql) => {
        const rows = await sql`
            SELECT username_pharma, images_pharma, license_image FROM pharmacist_account WHERE id_pharma = ${id} LIMIT 1
        `;
        return rows[0];
    });

    const displayImage = row?.images_pharma || row?.license_image || 'default.png';
    return {
        status: 'success',
        message: 'อัปเดตข้อมูลสำเร็จ',
        new_image: newImage,
        user: {
            id,
            id_pharma: id,
            username: row?.username_pharma,
            role: 'pharmacist',
            image: displayImage,
        },
        redirect: '/pharmacy/profile',
    };
}

export async function handleUpdateStoreProfile(event: H3Event) {
    const { fields, arrays, files } = await readMultipartRequest(event);
    const auth = getAuthContext(event, fields);
    const id = auth.id_store_accounts;

    if (!id) {
        return { status: 'error', message: 'กรุณาเข้าสู่ระบบในฐานะเจ้าของร้านยา' };
    }

    const str = (k: string) => String(fields[k] || '').trim();
    const googleMapsUrl = str('google_maps_url');

    await dbQuery(async (sql) => {
        await sql`
            UPDATE phamacy_store_accounts
            SET firstname = ${str('firstname')},
                lastname = ${str('lastname')},
                personal_phone = ${str('personal_phone')}
            WHERE id_store_accounts = ${id}
        `;

        const detExists = await sql`
            SELECT id_store_details FROM phamacy_store_details WHERE id_store_accounts = ${id} LIMIT 1
        `;
        if (detExists[0]) {
            await sql`
                UPDATE phamacy_store_details
                SET store_name = ${str('store_name')},
                    house_no = ${str('house_no')},
                    road = ${str('road') || str('moo')},
                    sub_district = ${str('sub_district')},
                    district = ${str('district')},
                    province = ${str('province')},
                    zipcode = ${str('zipcode')},
                    store_phone = ${str('store_phone')},
                    store_email = ${str('store_email')},
                    google_maps_url = ${googleMapsUrl || null},
                    bank_name = ${str('bank_name') || null},
                    bank_account_name = ${str('bank_account_name') || null},
                    bank_account_number = ${str('bank_account_number') || null}
                WHERE id_store_accounts = ${id}
            `;
        } else {
            await sql`
                INSERT INTO phamacy_store_details
                    (id_store_accounts, store_name, house_no, road, sub_district, district, province, zipcode, store_phone, store_email, google_maps_url, bank_name, bank_account_name, bank_account_number)
                VALUES
                    (${id}, ${str('store_name')}, ${str('house_no')}, ${str('road') || str('moo')},
                     ${str('sub_district')}, ${str('district')}, ${str('province')}, ${str('zipcode')},
                     ${str('store_phone')}, ${str('store_email')}, ${googleMapsUrl || null},
                     ${str('bank_name') || null}, ${str('bank_account_name') || null}, ${str('bank_account_number') || null})
            `;
        }

        const latMatch = googleMapsUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
            || googleMapsUrl.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (latMatch) {
            await sql`
                UPDATE phamacy_store_details
                SET latitude = ${Number(latMatch[1])}, longitude = ${Number(latMatch[2])}
                WHERE id_store_accounts = ${id}
            `;
        }

        const workDays = getArrayField(fields, arrays, 'work_day');
        const openTimes = getArrayField(fields, arrays, 'open_time');
        const closeTimes = getArrayField(fields, arrays, 'close_time');
        const submitted: Record<string, { open: string; close: string }> = {};
        for (let i = 0; i < workDays.length; i++) {
            const day = workDays[i];
            if (!VALID_DAYS.includes(day)) continue;
            let open = openTimes[i] || '08:00';
            let close = closeTimes[i] || '20:00';
            if (open.length === 5) open += ':00';
            if (close.length === 5) close += ':00';
            submitted[day] = { open, close };
        }
        for (const day of VALID_DAYS) {
            if (submitted[day]) {
                const { open, close } = submitted[day];
                const exists = await sql`
                    SELECT id FROM store_schedule WHERE id_store = ${id} AND day_of_week = ${day} LIMIT 1
                `;
                if (exists[0]) {
                    await sql`
                        UPDATE store_schedule SET open_time = ${open}, close_time = ${close}, is_open = 1
                        WHERE id_store = ${id} AND day_of_week = ${day}
                    `;
                } else {
                    await sql`
                        INSERT INTO store_schedule (id_store, day_of_week, open_time, close_time, is_open)
                        VALUES (${id}, ${day}, ${open}, ${close}, 1)
                    `;
                }
            } else {
                await sql`
                    UPDATE store_schedule SET is_open = 0 WHERE id_store = ${id} AND day_of_week = ${day}
                `;
            }
        }

        const passwordNew = String(fields.password_new || '');
        const passwordConfirm = String(fields.password_confirm || '');
        if (passwordNew && passwordNew === passwordConfirm) {
            const salt = randomBytes(16).toString('hex');
            const hash = await hashPassword(passwordNew, salt);
            await sql`
                UPDATE phamacy_store_accounts
                SET password = ${hash}, salt_store = ${salt}, login_count_account = 0, lock_account = 0
                WHERE id_store_accounts = ${id}
            `;
        }
    });

    let newQr = '';
    const qrFile = files.qr_payment_file;
    if (qrFile?.data?.length) {
        const ext = (qrFile.filename || '').split('.').pop()?.toLowerCase() || '';
        if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
            newQr = `qr_payment_${Date.now()}_${randomBytes(4).toString('hex')}.${ext}`;
            const old = await dbQuery(async (sql) => {
                const rows = await sql`SELECT qr_payment_file FROM phamacy_store_details WHERE id_store_accounts = ${id} LIMIT 1`;
                return rows[0];
            });
            if (old?.qr_payment_file) await deleteMediaFile('uploads/qr_payment', String(old.qr_payment_file));
            await uploadMediaFile('uploads/qr_payment', newQr, qrFile.data, mimeFromExt(ext));
            await dbQuery(async (sql) => sql`
                UPDATE phamacy_store_details SET qr_payment_file = ${newQr} WHERE id_store_accounts = ${id}
            `);
        }
    }

    let newLicense = '';
    const licenseFile = files.license_file;
    if (licenseFile?.data?.length) {
        const ext = (licenseFile.filename || '').split('.').pop()?.toLowerCase() || '';
        if (['jpg', 'jpeg', 'png', 'webp', 'pdf'].includes(ext)) {
            newLicense = `license_${Date.now()}_${randomBytes(4).toString('hex')}.${ext}`;
            const old = await dbQuery(async (sql) => {
                const rows = await sql`SELECT license_file FROM phamacy_store_accounts WHERE id_store_accounts = ${id} LIMIT 1`;
                return rows[0];
            });
            if (old?.license_file) await deleteMediaFile('uploads/licenses', String(old.license_file));
            await uploadMediaFile('uploads/licenses', newLicense, licenseFile.data, mimeFromExt(ext));
            await dbQuery(async (sql) => sql`
                UPDATE phamacy_store_accounts SET license_file = ${newLicense} WHERE id_store_accounts = ${id}
            `);
        }
    }

    let newProfile = '';
    const profileFile = files.profile_store_account;
    if (profileFile?.data?.length) {
        const ext = (profileFile.filename || '').split('.').pop()?.toLowerCase() || '';
        if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
            newProfile = `store_${Date.now()}_${randomBytes(4).toString('hex')}.${ext}`;
            const old = await dbQuery(async (sql) => {
                const rows = await sql`SELECT profile_store_account FROM phamacy_store_accounts WHERE id_store_accounts = ${id} LIMIT 1`;
                return rows[0];
            });
            if (old?.profile_store_account) await deleteMediaFile('uploads/store_profiles', String(old.profile_store_account));
            await uploadMediaFile('uploads/store_profiles', newProfile, profileFile.data, mimeFromExt(ext));
            await dbQuery(async (sql) => sql`
                UPDATE phamacy_store_accounts SET profile_store_account = ${newProfile} WHERE id_store_accounts = ${id}
            `);
        }
    }

    const row = await dbQuery(async (sql) => {
        const rows = await sql`
            SELECT username, firstname, license_file, profile_store_account
            FROM phamacy_store_accounts WHERE id_store_accounts = ${id} LIMIT 1
        `;
        return rows[0];
    });

    return {
        status: 'success',
        message: 'บันทึกข้อมูลร้านยาสำเร็จ',
        user: {
            id,
            store_id: id,
            id_store_accounts: id,
            username: row?.username || row?.firstname || '',
            firstname: row?.firstname || '',
            role: 'store',
            image: newProfile || row?.profile_store_account || '',
        },
    };
}

export async function handleInvitePharmacistToStore(event: H3Event) {
    const body = await readBody(event).catch(() => ({}));
    const auth = getAuthContext(event, body as Record<string, unknown>);
    const idPharma = Number((body as Record<string, unknown>).id_pharma || 0);
    const storeId = Number((body as Record<string, unknown>).store_id || auth.id_store_accounts || 0);

    if (idPharma <= 0 || storeId <= 0) {
        return { status: 'error', message: 'ข้อมูลไม่ครบ' };
    }

    if (auth.id_store_accounts && auth.id_store_accounts !== storeId && !auth.isAdmin) {
        return { status: 'error', message: 'ไม่มีสิทธิ์จัดการร้านนี้' };
    }
    if (!auth.id_store_accounts && !auth.isAdmin) {
        return { status: 'error', message: 'กรุณาเข้าสู่ระบบในฐานะเจ้าของร้าน' };
    }

    const storeOk = await dbQuery(async (sql) => {
        const rows = await sql`
            SELECT id_store_accounts FROM phamacy_store_accounts
            WHERE id_store_accounts = ${storeId}
              AND status = 1
              AND (admin_status IS NULL OR admin_status = 'approved')
            LIMIT 1
        `;
        return rows[0];
    });
    if (!storeOk) {
        return { status: 'error', message: 'ไม่พบร้านยาหรือร้านยังไม่ได้รับการอนุมัติ' };
    }

    const pharma = await dbQuery(async (sql) => {
        const rows = await sql`
            SELECT id_pharma, status_verify, id_store, pending_store_id
            FROM pharmacist_account WHERE id_pharma = ${idPharma} LIMIT 1
        `;
        return rows[0];
    });
    if (!pharma) {
        return { status: 'error', message: 'ไม่พบข้อมูลเภสัชกร' };
    }
    if (Number(pharma.status_verify || 0) !== 1) {
        return { status: 'error', message: 'เภสัชกรยังไม่ได้รับการอนุมัติจากแอดมิน' };
    }

    const currentStore = pharma.id_store != null ? Number(pharma.id_store) : 0;
    if (currentStore > 0 && currentStore !== storeId) {
        return { status: 'error', message: 'เภสัชกรสังกัดร้านอื่นอยู่แล้ว' };
    }
    if (currentStore === storeId) {
        return { status: 'success', message: 'เภสัชกรอยู่ในร้านนี้แล้ว' };
    }

    const storeNameRow = await dbQuery(async (sql) => {
        const rows = await sql`
            SELECT store_name FROM phamacy_store_details WHERE id_store_accounts = ${storeId} LIMIT 1
        `;
        return rows[0];
    });
    const storeName = String(storeNameRow?.store_name || '');

    const ok = await dbQuery(async (sql) => {
        await sql`
            UPDATE pharmacist_account
            SET id_store = ${storeId},
                pending_store_id = NULL,
                store_name = ${storeName || null}
            WHERE id_pharma = ${idPharma}
        `;
        try {
            await sql.unsafe(
                `UPDATE pharmacist_account
                 SET store_join_notice_at = NOW(), store_join_ack_at = NULL
                 WHERE id_pharma = $1`,
                [idPharma],
            );
        } catch {
            // optional notice columns
        }
        return true;
    });

    if (!ok) {
        return { status: 'error', message: 'อัปเดตข้อมูลไม่สำเร็จ' };
    }

    return {
        status: 'success',
        message: 'เพิ่มเภสัชกรเข้าร้านเรียบร้อย ระบบจะแจ้งเตือนเภสัชกรให้ทราบ',
        store_name: storeName,
    };
}

export async function handleApprovePharmacist(event: H3Event) {
    const body = await readBody(event).catch(() => ({}));
    const auth = getAuthContext(event, body as Record<string, unknown>);
    const idPharma = Number((body as Record<string, unknown>).id_pharma || 0);
    const storeId = Number((body as Record<string, unknown>).store_id || auth.id_store_accounts || 0);

    if (idPharma <= 0 || storeId <= 0) {
        return { status: 'error', message: 'ข้อมูลไม่ครบ' };
    }

    const ok = await dbQuery(async (sql) => {
        const pending = await sql`
            SELECT id_pharma FROM pharmacist_account
            WHERE id_pharma = ${idPharma} AND pending_store_id = ${storeId}
            LIMIT 1
        `;
        if (!pending[0]) return false;

        const nameRow = await sql`
            SELECT store_name FROM phamacy_store_details WHERE id_store_accounts = ${storeId} LIMIT 1
        `;
        const storeName = String(nameRow[0]?.store_name || '');

        await sql`
            UPDATE pharmacist_account
            SET id_store = ${storeId},
                pending_store_id = NULL,
                store_name = ${storeName || null}
            WHERE id_pharma = ${idPharma}
        `;
        try {
            await sql.unsafe(
                `UPDATE pharmacist_account
                 SET store_join_notice_at = NOW(), store_join_ack_at = NULL
                 WHERE id_pharma = $1`,
                [idPharma],
            );
        } catch {
            // optional notice columns
        }
        return true;
    });

    if (!ok) {
        return { status: 'error', message: 'ไม่พบคำขอเข้าร่วมร้านนี้' };
    }
    return { status: 'success', message: 'อนุมัติเภสัชกรเข้าร่วมร้านแล้ว' };
}

export async function handleRejectPharmacist(event: H3Event) {
    const body = await readBody(event).catch(() => ({}));
    const auth = getAuthContext(event, body as Record<string, unknown>);
    const idPharma = Number((body as Record<string, unknown>).id_pharma || 0);
    const storeId = Number((body as Record<string, unknown>).store_id || auth.id_store_accounts || 0);

    if (idPharma <= 0 || storeId <= 0) {
        return { status: 'error', message: 'ข้อมูลไม่ครบ' };
    }

    const row = await dbQuery(async (sql) => {
        const rows = await sql`
            SELECT id_store, pending_store_id FROM pharmacist_account WHERE id_pharma = ${idPharma} LIMIT 1
        `;
        return rows[0];
    });
    if (!row) {
        return { status: 'error', message: 'ไม่พบเภสัชกร' };
    }

    const currentStore = row.id_store != null ? Number(row.id_store) : 0;
    const pendingStore = row.pending_store_id != null ? Number(row.pending_store_id) : 0;

    if (currentStore !== storeId && pendingStore !== storeId) {
        return { status: 'error', message: 'เภสัชกรไม่ได้สังกัด/รอเข้าร้านนี้' };
    }

    const ok = await dbQuery(async (sql) => {
        if (currentStore === storeId && pendingStore === storeId) {
            await sql`
                UPDATE pharmacist_account
                SET id_store = NULL, pending_store_id = NULL, store_name = NULL
                WHERE id_pharma = ${idPharma}
            `;
        } else if (currentStore === storeId) {
            await sql`
                UPDATE pharmacist_account SET id_store = NULL, store_name = NULL WHERE id_pharma = ${idPharma}
            `;
        } else {
            await sql`
                UPDATE pharmacist_account SET pending_store_id = NULL WHERE id_pharma = ${idPharma}
            `;
        }
        return true;
    });

    if (!ok) {
        return { status: 'error', message: 'อัปเดตข้อมูลไม่สำเร็จ' };
    }
    return { status: 'success', message: 'อัปเดตสำเร็จ' };
}

export async function handleReviewBillingSlip(event: H3Event) {
    const body = await readBody(event).catch(() => ({}));
    const auth = getAuthContext(event, body as Record<string, unknown>);
    const id = parsePositiveInt((body as Record<string, unknown>).id);
    const storeId = parsePositiveInt((body as Record<string, unknown>).store_id ?? auth.id_store_accounts);
    const action = String((body as Record<string, unknown>).action || '').trim();

    if (id <= 0 || storeId <= 0 || !['approve', 'reject'].includes(action)) {
        return { status: 'error', message: 'ข้อมูลไม่ครบ' };
    }

    const status = action === 'approve' ? 'approved' : 'rejected';
    const reviewed = await dbQuery(async (sql) => {
        const rows = await sql`
            UPDATE pharmacy_billing_slips
            SET status = ${status}, reviewed_at = NOW()
            WHERE id = ${id} AND id_store = ${storeId}
            RETURNING id, id_pharma, note
        `;
        return rows[0] as { id: number; id_pharma: number; note: string | null } | undefined;
    });

    if (!reviewed?.id) {
        return { status: 'error', message: 'ไม่พบสลิปหรืออัปเดตไม่สำเร็จ' };
    }

    if (action === 'approve') {
        const marker = String(reviewed.note || '').match(/\[BILLING_CTX:patient=(\d+);rx=(\d+)\]/);
        const patientId = Number(marker?.[1] || 0);
        const rxId = Number(marker?.[2] || 0);
        const pharmaId = Number(reviewed.id_pharma || 0);
        if (patientId > 0 && pharmaId > 0) {
            const paymentDoneMessage = rxId > 0
                ? `การชำระเงินของคุณสำเร็จแล้วนะ\nอ้างอิงใบสรุปรายการยา #${rxId}`
                : 'การชำระเงินของคุณสำเร็จแล้วนะ';
            await dbQuery(async (sql) => {
                await sql`
                    INSERT INTO chat_messages (sender_id, receiver_id, sender_role, message_text, file_path)
                    VALUES (${pharmaId}, ${patientId}, 'pharma', ${paymentDoneMessage}, NULL)
                `;
                return true;
            });
        }
    }
    return { status: 'success', message: 'อัปเดตสลิปแล้ว' };
}

export async function handleUploadBillingSlip(event: H3Event) {
    const { fields, files } = await readMultipartRequest(event);
    const auth = getAuthContext(event, fields);
    const idPharma = parsePositiveInt(fields.id_pharma ?? auth.id_pharma);

    if (idPharma <= 0) {
        return { status: 'error', message: 'ไม่พบรหัสเภสัชกร' };
    }

    const amount = Number(fields.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
        return { status: 'error', message: 'กรุณากรอกจำนวนเงิน' };
    }

    const slipFile = files.slip_image;
    if (!slipFile?.data?.length) {
        return { status: 'error', message: 'กรุณาแนบรูปสลิปการโอน' };
    }

    const pharmaRow = await dbQuery(async (sql) => {
        const rows = await sql`
            SELECT id_store FROM pharmacist_account WHERE id_pharma = ${idPharma} LIMIT 1
        `;
        return rows[0];
    });

    const idStore = parsePositiveInt(pharmaRow?.id_store);
    if (idStore <= 0) {
        return { status: 'error', message: 'กรุณาสังกัดร้านยาก่อนส่งสลิป' };
    }

    const origName = String(slipFile.filename || 'slip.jpg');
    const ext = origName.includes('.') ? origName.slice(origName.lastIndexOf('.') + 1).toLowerCase() : 'jpg';
    const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'pdf'].includes(ext) ? ext : 'jpg';
    const filename = `slip_${idPharma}_${randomBytes(6).toString('hex')}.${safeExt === 'jpeg' ? 'jpg' : safeExt}`;

    await uploadMediaFile('uploads/slips', filename, slipFile.data, mimeFromExt(safeExt));

    const transferRaw = String(fields.transfer_date || '').trim();
    const transferDate = transferRaw ? new Date(transferRaw) : null;
    const transferTs = transferDate && !Number.isNaN(transferDate.getTime())
        ? transferDate.toISOString()
        : null;
    const note = String(fields.note || '').trim() || null;

    const inserted = await dbQuery(async (sql) => {
        const rows = await sql`
            INSERT INTO pharmacy_billing_slips (
                id_pharma, id_store, amount, slip_image, transfer_date, note, status, created_at
            ) VALUES (
                ${idPharma}, ${idStore}, ${amount}, ${filename},
                ${transferTs}, ${note}, 'pending', NOW()
            )
            RETURNING id
        `;
        return rows[0];
    });

    if (!inserted?.id) {
        return { status: 'error', message: 'บันทึกสลิปไม่สำเร็จ' };
    }

    return { status: 'success', message: 'ส่งสลิปเรียบร้อย รอร้านอนุมัติ', id: Number(inserted.id) };
}
