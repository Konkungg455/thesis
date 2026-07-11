import { randomBytes } from 'node:crypto';
import type { H3Event } from 'h3';
import { parseValidAge, validateAgeMessage } from '#shared/utils/age';
import { getArrayField, readMultipartRequest, readRequestFields } from './formData';
import { uploadMediaFile, mimeFromExt } from '../../utils/storageUpload';

const VALID_STORE_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const DAY_CODE_MAP: Record<string, string> = {
    Mon: 'Mon', Tue: 'Tue', Wed: 'Wed', Thu: 'Thu', Fri: 'Fri', Sat: 'Sat', Sun: 'Sun',
    Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun',
    'จันทร์': 'Mon', 'อังคาร': 'Tue', 'พุธ': 'Wed', 'พฤหัสบดี': 'Thu',
    'ศุกร์': 'Fri', 'เสาร์': 'Sat', 'อาทิตย์': 'Sun',
};

function genderForAccount(g: string): string {
    const v = String(g || '').trim();
    if (v === 'M' || v === 'ชาย') return 'M';
    if (v === 'F' || v === 'หญิง') return 'F';
    return v;
}

function normalizeDayCode(day: string): string {
    const key = String(day || '').trim();
    return DAY_CODE_MAP[key] || key;
}

function buildWorkTime(days: string[], starts: string[], ends: string[]): string {
    const parts: string[] = [];
    for (let i = 0; i < days.length; i++) {
        const day = String(days[i] || '').trim();
        const start = String(starts[i] || '').trim();
        const end = String(ends[i] || '').trim();
        if (day && start && end) parts.push(`${day} (${start}-${end})`);
    }
    return parts.join(', ');
}

async function uploadLicenseImage(
    file: { data: Buffer; filename?: string } | undefined,
    prefix: string,
): Promise<string | null> {
    if (!file?.data?.length) return null;
    const ext = (file.filename || '').split('.').pop()?.toLowerCase() || '';
    if (!['jpg', 'jpeg', 'png', 'webp', 'pdf'].includes(ext)) {
        throw new Error('รองรับเฉพาะไฟล์ JPG, PNG, WEBP หรือ PDF');
    }
    const filename = `${prefix}_${Date.now()}_${randomBytes(4).toString('hex')}.${ext}`;
    await uploadMediaFile('uploads/licenses', filename, file.data, mimeFromExt(ext));
    return filename;
}

async function stashOtp(table: string, email: string, tempData: Record<string, unknown>) {
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const json = JSON.stringify(tempData);
    await dbQuery(async (sql) => {
        await sql.unsafe(`DELETE FROM ${table} WHERE email = $1`, [email]);
        await sql.unsafe(
            `INSERT INTO ${table} (email, otp_code, temp_data, expires_at)
             VALUES ($1, $2, $3, NOW() + INTERVAL '5 minutes')`,
            [email, otp, json],
        );
    });
    return otp;
}

async function sendRegisterOtp(
    email: string,
    otp: string,
    role: 'user' | 'admin' | 'pharmacist' | 'store',
    recipientName?: string,
) {
    const mailed = await sendOtpEmail(email, otp, {
        purpose: 'สมัครสมาชิก',
        role,
        recipientName,
    });
    if (!mailed) console.log(`[otp] ${role} register OTP:`, otp, email);
    return mailed;
}

function otpSuccessResponse(
    email: string,
    type: string,
    mailed: boolean,
    otp: string,
    message?: string,
) {
    return {
        status: 'success',
        message: message || (mailed ? 'ส่งรหัส OTP ไปยังอีเมลแล้ว' : 'สร้าง OTP แล้ว (ตั้งค่า SMTP เพื่อส่งอีเมลจริง)'),
        email,
        redirect: `/auth/verify-otp?type=${type}&email=${encodeURIComponent(email)}`,
        ...(process.dev && !mailed ? { dev_otp: otp } : {}),
    };
}

export async function handleRegisterPharmacist(event: H3Event) {
    const { fields, arrays, files } = await readMultipartRequest(event);
    const username = String(fields.username_pharma || '').trim();
    const email = String(fields.email || '').trim();
    const pass1 = String(fields.pass1 || '');
    const pass2 = String(fields.pass2 || '');
    const firstname = String(fields.firstname_pharma || '').trim();
    const lastname = String(fields.lastname_pharma || '').trim();
    const gender = genderForAccount(fields.gender_pharma);
    const ageErr = validateAgeMessage(fields.age_pharma);
    if (ageErr) return { status: 'error', message: ageErr };
    const age = parseValidAge(fields.age_pharma)!;
    const phone = String(fields.phone || '').trim();
    const idStoreRaw = String(fields.id_store || '').trim();

    if (!username || !email || !firstname || !lastname || !gender || !phone) {
        return { status: 'error', message: 'กรุณากรอกข้อมูลให้ครบถ้วน' };
    }
    if (!files.license_image?.data?.length) {
        return { status: 'error', message: 'กรุณาแนบใบประกอบวิชาชีพ' };
    }
    if (pass1.length < 8) return { status: 'error', message: 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร' };
    if (pass1 !== pass2) return { status: 'error', message: 'รหัสผ่านไม่ตรงกัน' };

    const dup = await dbQuery(async (sql) => sql`
        SELECT id_pharma FROM pharmacist_account
        WHERE email_pharma = ${email} OR username_pharma = ${username}
        LIMIT 1
    `);
    if (dup?.[0]) return { status: 'error', message: 'ชื่อผู้ใช้หรืออีเมลนี้ถูกใช้งานแล้ว' };

    let licenseImage: string;
    try {
        const uploaded = await uploadLicenseImage(files.license_image, 'license');
        if (!uploaded) return { status: 'error', message: 'อัปโหลดใบประกอบวิชาชีพไม่สำเร็จ' };
        licenseImage = uploaded;
    } catch (err: unknown) {
        return { status: 'error', message: err instanceof Error ? err.message : 'อัปโหลดไฟล์ไม่สำเร็จ' };
    }

    const workDays = getArrayField(fields, arrays, 'work_day');
    const workStarts = getArrayField(fields, arrays, 'work_start');
    const workEnds = getArrayField(fields, arrays, 'work_end');
    const workTime = buildWorkTime(workDays, workStarts, workEnds);
    if (!workTime) return { status: 'error', message: 'กรุณาระบุเวลาทำงานอย่างน้อย 1 วัน' };

    let storeName: string | null = null;
    let idStore: number | null = null;
    if (idStoreRaw) {
        idStore = Number(idStoreRaw);
        if (idStore > 0) {
            const storeRow = await dbQuery(async (sql) => sql`
                SELECT store_name FROM phamacy_store_details
                WHERE id_store_accounts = ${idStore} LIMIT 1
            `);
            storeName = String(storeRow?.[0]?.store_name || '').trim() || null;
        }
    }

    const salt = randomBytes(16).toString('hex');
    const hash = await hashPassword(pass1, salt);
    const otp = await stashOtp('otp_verify_phamacy', email, {
        username_pharma: username,
        email_pharma: email,
        password_pharma: hash,
        salt_pharma: salt,
        firstname_pharma: firstname,
        lastname_pharma: lastname,
        gender_pharma: gender,
        age_pharma: age,
        phone_pharma: phone,
        work_time: workTime,
        license_image: licenseImage,
        id_store: idStore,
        store_name: storeName,
    });

    const mailed = await sendRegisterOtp(email, otp, 'pharmacist', firstname);
    return otpSuccessResponse(email, 'pharmacist', mailed, otp);
}

export async function handleRegisterAdmin(event: H3Event) {
    const fields = await readRequestFields(event);
    const username = String(fields.username_account || '').trim();
    const email = String(fields.email_account || '').trim();
    const pass1 = String(fields.password_account1 || '');
    const pass2 = String(fields.password_account2 || '');
    const firstname = String(fields.firstname || '').trim();
    const lastname = String(fields.lastname || '').trim();
    const gender = genderForAccount(fields.gender);
    const ageErr = validateAgeMessage(fields.old);
    if (ageErr) return { status: 'error', message: ageErr };
    const age = parseValidAge(fields.old)!;
    const phone = String(fields.phone_number || '').trim();

    if (!username || !email || !firstname || !lastname || !gender || !phone) {
        return { status: 'error', message: 'กรุณากรอกข้อมูลให้ครบถ้วน' };
    }
    if (pass1.length < 8) return { status: 'error', message: 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร' };
    if (pass1 !== pass2) return { status: 'error', message: 'รหัสผ่านไม่ตรงกัน' };

    const dup = await dbQuery(async (sql) => sql`
        SELECT id_account_admin FROM account_admin
        WHERE email_account = ${email} OR username_account = ${username}
        LIMIT 1
    `);
    if (dup?.[0]) return { status: 'error', message: 'ชื่อผู้ใช้หรืออีเมลนี้ถูกใช้งานแล้ว' };

    const salt = randomBytes(16).toString('hex');
    const hash = await hashPassword(pass1, salt);
    const otp = await stashOtp('otp_verify_admin', email, {
        username_account: username,
        email_account: email,
        password_account: hash,
        salt_account: salt,
        firstname,
        lastname,
        gender,
        old: age,
        phone_number: phone,
    });

    const mailed = await sendRegisterOtp(email, otp, 'admin', firstname);
    return otpSuccessResponse(email, 'admin', mailed, otp);
}

export async function handleRegisterStoreStep1(event: H3Event) {
    const { fields, files } = await readMultipartRequest(event);
    const username = String(fields.username || '').trim();
    const email = String(fields.personal_email || '').trim();
    const pass1 = String(fields.password || '');
    const pass2 = String(fields.confirm_password || '');

    if (!username || !email) {
        return { status: 'error', message: 'กรุณากรอกข้อมูลให้ครบถ้วน' };
    }
    if (pass1.length < 8) return { status: 'error', message: 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร' };
    if (pass1 !== pass2) return { status: 'error', message: 'รหัสผ่านไม่ตรงกัน' };
    if (!files.license_file?.data?.length) {
        return { status: 'error', message: 'กรุณาอัปโหลดไฟล์ใบอนุญาตร้านยา' };
    }

    const dup = await dbQuery(async (sql) => sql`
        SELECT id_store_accounts FROM phamacy_store_accounts
        WHERE personal_email = ${email} OR username = ${username}
        LIMIT 1
    `);
    if (dup?.[0]) return { status: 'error', message: 'ชื่อผู้ใช้หรืออีเมลนี้ถูกใช้งานแล้ว' };

    try {
        const licenseFile = await uploadLicenseImage(files.license_file, 'license');
        if (!licenseFile) return { status: 'error', message: 'อัปโหลดใบอนุญาตไม่สำเร็จ' };
        return { status: 'success', message: 'บันทึกข้อมูลส่วนตัวแล้ว', license_file: licenseFile };
    } catch (err: unknown) {
        return { status: 'error', message: err instanceof Error ? err.message : 'อัปโหลดไฟล์ไม่สำเร็จ' };
    }
}

export async function handleRegisterStoreStep2(event: H3Event) {
    const { fields, arrays, files } = await readMultipartRequest(event);
    const username = String(fields.reg_username || fields.username || '').trim();
    const password = String(fields.reg_password_plain || fields.password || '');
    const firstname = String(fields.reg_firstname || fields.firstname || '').trim();
    const lastname = String(fields.reg_lastname || fields.lastname || '').trim();
    const personalPhone = String(fields.reg_personal_phone || fields.personal_phone || '').trim();
    const personalEmail = String(fields.reg_personal_email || fields.personal_email || '').trim();
    const licenseFile = String(fields.reg_license_file || fields.license_file || '').trim();
    const storeName = String(fields.store_name || '').trim();

    if (!username || !personalEmail || !password || !firstname || !lastname || !licenseFile || !storeName) {
        return { status: 'error', message: 'ข้อมูลไม่ครบ — กรุณาเริ่มสมัครใหม่จากขั้นตอนที่ 1' };
    }
    if (password.length < 8) return { status: 'error', message: 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร' };

    const dup = await dbQuery(async (sql) => sql`
        SELECT id_store_accounts FROM phamacy_store_accounts
        WHERE personal_email = ${personalEmail} OR username = ${username}
        LIMIT 1
    `);
    if (dup?.[0]) return { status: 'error', message: 'ชื่อผู้ใช้หรืออีเมลนี้ถูกใช้งานแล้ว' };

    let qrPaymentFile = '';
    const qrFile = files.qr_payment_file;
    if (qrFile?.data?.length) {
        const ext = (qrFile.filename || '').split('.').pop()?.toLowerCase() || '';
        if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
            qrPaymentFile = `qr_payment_${Date.now()}_${randomBytes(4).toString('hex')}.${ext}`;
            await uploadMediaFile('uploads/qr_payment', qrPaymentFile, qrFile.data, mimeFromExt(ext));
        }
    }

    const workDays = getArrayField(fields, arrays, 'work_day');
    const openTimes = getArrayField(fields, arrays, 'open_time');
    const closeTimes = getArrayField(fields, arrays, 'close_time');
    const schedule: Array<{ day: string; open: string; close: string }> = [];
    for (let i = 0; i < workDays.length; i++) {
        const day = normalizeDayCode(workDays[i]);
        const open = String(openTimes[i] || '08:00').trim();
        const close = String(closeTimes[i] || '20:00').trim();
        if (day && VALID_STORE_DAYS.includes(day as typeof VALID_STORE_DAYS[number])) {
            schedule.push({ day, open, close });
        }
    }
    if (!schedule.length) {
        return { status: 'error', message: 'กรุณาระบุเวลาเปิด-ปิดร้านอย่างน้อย 1 วัน' };
    }

    const googleMapsUrl = String(fields.google_maps_url || '').trim();
    const salt = randomBytes(16).toString('hex');
    const hash = await hashPassword(password, salt);
    const otp = await stashOtp('otp_verify_store', personalEmail, {
        account: {
            username,
            password: hash,
            salt_store: salt,
            firstname,
            lastname,
            personal_phone: personalPhone,
            personal_email: personalEmail,
            license_file: licenseFile,
        },
        details: {
            store_name: storeName,
            house_no: String(fields.house_no || '').trim(),
            road: String(fields.road || '').trim(),
            sub_district: String(fields.sub_district || '').trim(),
            district: String(fields.district || '').trim(),
            province: String(fields.province || '').trim(),
            zipcode: String(fields.zipcode || '').trim(),
            store_phone: String(fields.store_phone || '').trim(),
            store_email: String(fields.store_email || '').trim(),
            google_maps_url: googleMapsUrl,
            bank_name: String(fields.bank_name || '').trim(),
            bank_account_name: String(fields.bank_account_name || '').trim(),
            bank_account_number: String(fields.bank_account_number || '').trim(),
            qr_payment_file: qrPaymentFile,
        },
        schedule,
    });

    const mailed = await sendRegisterOtp(personalEmail, otp, 'store', firstname);
    return otpSuccessResponse(personalEmail, 'store', mailed, otp);
}

export async function completePharmacistRegistration(u: Record<string, unknown>, email: string) {
    const idStore = u.id_store != null && Number(u.id_store) > 0 ? Number(u.id_store) : null;
    const newId = await dbQuery(async (sql) => {
        const rows = await sql`
            INSERT INTO pharmacist_account (
                username_pharma, email_pharma, password_pharma, salt_pharma,
                firstname_pharma, lastname_pharma, gender_pharma, age_pharma,
                height_pharma, weight_pharma, phone_pharma, work_time, license_image,
                id_store, store_name, images_pharma, status_verify
            ) VALUES (
                ${String(u.username_pharma || '')},
                ${String(u.email_pharma || email)},
                ${String(u.password_pharma || '')},
                ${String(u.salt_pharma || '')},
                ${String(u.firstname_pharma || '')},
                ${String(u.lastname_pharma || '')},
                ${genderForAccount(String(u.gender_pharma || ''))},
                ${Number(u.age_pharma || 0)},
                170, 65,
                ${String(u.phone_pharma || '')},
                ${String(u.work_time || '')},
                ${String(u.license_image || '')},
                ${idStore},
                ${u.store_name ? String(u.store_name) : null},
                'default.png',
                0
            )
            RETURNING id_pharma
        `;
        await sql.unsafe(`DELETE FROM otp_verify_phamacy WHERE email = $1`, [email]);
        return Number(rows[0]?.id_pharma || 0);
    });
    return newId;
}

export async function completeAdminRegistration(u: Record<string, unknown>, email: string) {
    const newId = await dbQuery(async (sql) => {
        const rows = await sql`
            INSERT INTO account_admin (
                username_account, email_account, password_account, salt_account,
                firstname, lastname, gender, old, phone_number,
                images_account, admin_status, is_super_admin, is_deleted
            ) VALUES (
                ${String(u.username_account || '')},
                ${String(u.email_account || email)},
                ${String(u.password_account || '')},
                ${String(u.salt_account || '')},
                ${String(u.firstname || '')},
                ${String(u.lastname || '')},
                ${genderForAccount(String(u.gender || ''))},
                ${Number(u.old || 0)},
                ${String(u.phone_number || '')},
                'default.png',
                'pending',
                0,
                0
            )
            RETURNING id_account_admin
        `;
        await sql.unsafe(`DELETE FROM otp_verify_admin WHERE email = $1`, [email]);
        return Number(rows[0]?.id_account_admin || 0);
    });
    return newId;
}

export async function completeStoreRegistration(u: Record<string, unknown>, email: string) {
    const account = (u.account || {}) as Record<string, unknown>;
    const details = (u.details || {}) as Record<string, unknown>;
    const schedule = Array.isArray(u.schedule) ? u.schedule as Array<{ day: string; open: string; close: string }> : [];
    const googleMapsUrl = String(details.google_maps_url || '').trim();

    const newId = await dbQuery(async (sql) => {
        const rows = await sql`
            INSERT INTO phamacy_store_accounts (
                username, password, salt_store, firstname, lastname,
                personal_phone, personal_email, license_file, status, admin_status
            ) VALUES (
                ${String(account.username || '')},
                ${String(account.password || '')},
                ${String(account.salt_store || '')},
                ${String(account.firstname || '')},
                ${String(account.lastname || '')},
                ${String(account.personal_phone || '')},
                ${String(account.personal_email || email)},
                ${String(account.license_file || '')},
                1,
                'pending'
            )
            RETURNING id_store_accounts
        `;
        const storeId = Number(rows[0]?.id_store_accounts || 0);
        if (!storeId) return 0;

        await sql`
            INSERT INTO phamacy_store_details (
                id_store_accounts, store_name, house_no, road, sub_district, district,
                province, zipcode, store_phone, store_email, google_maps_url,
                bank_name, bank_account_name, bank_account_number, qr_payment_file
            ) VALUES (
                ${storeId},
                ${String(details.store_name || '')},
                ${String(details.house_no || '')},
                ${String(details.road || '')},
                ${String(details.sub_district || '')},
                ${String(details.district || '')},
                ${String(details.province || '')},
                ${String(details.zipcode || '')},
                ${String(details.store_phone || '')},
                ${String(details.store_email || '')},
                ${googleMapsUrl || null},
                ${String(details.bank_name || '') || null},
                ${String(details.bank_account_name || '') || null},
                ${String(details.bank_account_number || '') || null},
                ${String(details.qr_payment_file || '') || null}
            )
        `;

        const latMatch = googleMapsUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
            || googleMapsUrl.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (latMatch) {
            await sql`
                UPDATE phamacy_store_details
                SET latitude = ${Number(latMatch[1])}, longitude = ${Number(latMatch[2])}
                WHERE id_store_accounts = ${storeId}
            `;
        }

        for (const row of schedule) {
            const day = normalizeDayCode(row.day);
            if (!VALID_STORE_DAYS.includes(day as typeof VALID_STORE_DAYS[number])) continue;
            let open = String(row.open || '08:00');
            let close = String(row.close || '20:00');
            if (open.length === 5) open += ':00';
            if (close.length === 5) close += ':00';
            await sql`
                INSERT INTO store_schedule (id_store, day_of_week, open_time, close_time, is_open)
                VALUES (${storeId}, ${day}, ${open}, ${close}, 1)
            `;
        }

        await sql.unsafe(`DELETE FROM otp_verify_store WHERE email = $1`, [email]);
        return storeId;
    });
    return newId;
}
