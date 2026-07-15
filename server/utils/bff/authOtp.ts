import { randomBytes } from 'node:crypto';
import type { H3Event } from 'h3';
import { parseValidAge, validateAgeMessage } from '#shared/utils/age';
import { getRoleFromOtpType } from '../../utils/emailTemplates';
import { readRequestFields } from './formData';
import {
    completeAdminRegistration,
    completePharmacistRegistration,
    completeStoreRegistration,
    formatRegistrationDbError,
    isPgUniqueViolation,
    RegistrationSubmitError,
} from './authRegister';
import {
    notifyAdminsNewPharmacistFromTemp,
    notifyAdminsNewStoreFromTemp,
} from '../../utils/registrationNotifications';

type OtpType = 'user' | 'admin' | 'pharmacist' | 'store';

const OTP_TABLES: Record<OtpType, string> = {
    user: 'otp_verify',
    admin: 'otp_verify_admin',
    pharmacist: 'otp_verify_phamacy',
    store: 'otp_verify_store',
};

function parseOtpType(raw: unknown): OtpType | null {
    const t = String(raw || 'user');
    return t in OTP_TABLES ? t as OtpType : null;
}

function genderForAccount(g: string): string {
    const v = String(g || '').trim();
    if (v === 'M' || v === 'ชาย') return 'M';
    if (v === 'F' || v === 'หญิง') return 'F';
    return v;
}

function normalizeOtpCode(code: unknown): string {
    return String(code ?? '').replace(/\s+/g, '').trim();
}

/** ใช้เวลาฐานข้อมูล (NOW) แทน JS Date — กัน timezone ทำให้ OTP หมดอายุทันที */
async function verifyOtpRow(table: string, email: string, otpInput: string) {
    const otp = normalizeOtpCode(otpInput);
    const validRow = await dbQuery(async (sql) => sql.unsafe(
        `SELECT * FROM ${table}
         WHERE email = $1 AND expires_at > NOW()
         ORDER BY expires_at DESC
         LIMIT 1`,
        [email],
    ));
    const data = validRow?.[0];
    if (data) {
        if (normalizeOtpCode(data.otp_code) !== otp) {
            return { error: 'รหัส OTP ไม่ถูกต้อง กรุณาตรวจสอบและกรอกใหม่อีกครั้ง' };
        }
        return { row: data };
    }

    const anyRow = await dbQuery(async (sql) => sql.unsafe(
        `SELECT 1 FROM ${table} WHERE email = $1 LIMIT 1`,
        [email],
    ));
    if (anyRow?.[0]) {
        return { error: 'รหัส OTP หมดอายุแล้ว กรุณากดส่ง OTP ใหม่' };
    }
    return { error: 'ยังไม่ได้ขอรหัส OTP กรุณากดส่ง OTP ใหม่อีกครั้ง' };
}

export async function handleRegisterUser(event: H3Event) {
    const fields = await readRequestFields(event);
    const required = [
        'username_account', 'email_account', 'password_account1', 'password_account2',
        'firstname', 'lastname', 'gender', 'old', 'height', 'weight', 'phone_number', 'personal_disease',
    ];
    for (const key of required) {
        if (!String(fields[key] || '').trim()) {
            return { status: 'error', message: 'กรุณากรอกข้อมูลให้ครบถ้วน' };
        }
    }

    const email = String(fields.email_account).trim();
    const password1 = fields.password_account1;
    const password2 = fields.password_account2;
    if (password1.length < 8) return { status: 'error', message: 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร' };
    if (password1 !== password2) return { status: 'error', message: 'รหัสผ่านไม่ตรงกัน' };

    const gender = genderForAccount(fields.gender);
    if (!gender) return { status: 'error', message: 'กรุณาเลือกเพศ' };

    const ageErr = validateAgeMessage(fields.old);
    if (ageErr) return { status: 'error', message: ageErr };
    const age = parseValidAge(fields.old)!;

    const exists = await dbQuery(async (sql) => sql`
        SELECT id_account FROM account WHERE email_account = ${email} LIMIT 1
    `);
    if (exists?.[0]) {
        return { status: 'error', message: 'อีเมลนี้ถูกใช้งานแล้ว' };
    }

    const salt = randomBytes(16).toString('hex');
    const hash = await hashPassword(password1, salt);
    const otp = String(Math.floor(100000 + Math.random() * 900000));

    const tempData = JSON.stringify({
        username: String(fields.username_account).trim(),
        email,
        password: hash,
        salt,
        firstname: String(fields.firstname).trim(),
        lastname: String(fields.lastname).trim(),
        gender,
        old: age,
        height: fields.height,
        weight: fields.weight,
        phone_number: String(fields.phone_number).trim(),
        personal_disease: String(fields.personal_disease).trim(),
        address: {
            house_no: String(fields.house_no || '').trim(),
            road: String(fields.road || fields.moo || '').trim(),
            sub_district: String(fields.sub_district || '').trim(),
            district: String(fields.district || '').trim(),
            province: String(fields.province || '').trim(),
            zipcode: String(fields.zipcode || '').trim(),
        },
    });

    await dbQuery(async (sql) => {
        await sql`DELETE FROM otp_verify WHERE email = ${email}`;
        await sql`
            INSERT INTO otp_verify (email, otp_code, temp_data, expires_at)
            VALUES (${email}, ${otp}, ${tempData}, NOW() + INTERVAL '5 minutes')
        `;
    });

    const mailed = await sendOtpEmail(email, otp, {
        purpose: 'สมัครสมาชิก',
        role: 'user',
        recipientName: String(fields.firstname || '').trim() || undefined,
    });
    if (!mailed) console.log('[otp] user register OTP:', otp, email);

    return {
        status: 'success',
        message: mailed ? 'ส่งรหัส OTP ไปยังอีเมลแล้ว' : 'สร้าง OTP แล้ว (ตั้งค่า SMTP เพื่อส่งอีเมลจริง)',
        email,
        redirect: `/auth/verify-otp?type=user&email=${encodeURIComponent(email)}`,
        ...(process.dev && !mailed ? { dev_otp: otp } : {}),
    };
}

export async function handleVerifyOtp(event: H3Event) {
    const fields = await readRequestFields(event);
    const type = parseOtpType(fields.type);
    const email = String(fields.email || '').trim();
    const otpInput = String(fields.otp_code || fields.otp_input || '').trim();

    if (!type) return { status: 'error', message: 'ประเภทการยืนยันไม่ถูกต้อง' };
    if (!email || !otpInput) return { status: 'error', message: 'กรุณากรอกอีเมลและรหัส OTP' };

    const table = OTP_TABLES[type];
    const check = await verifyOtpRow(table, email, otpInput);
    if ('error' in check) return { status: 'error', message: check.error };

    const u = JSON.parse(String(check.row.temp_data || '{}'));

    try {
        if (type === 'user') {
            const gender = genderForAccount(u.gender);
            const userEmail = String(u.email || email).trim();
            const username = String(u.username || '').trim();
            const newId = await dbQuery(async (sql) => {
                const existingByEmail = await sql`
                    SELECT id_account FROM account
                    WHERE email_account = ${userEmail}
                    LIMIT 1
                `;
                if (existingByEmail[0]) {
                    await sql`DELETE FROM otp_verify WHERE email = ${email}`;
                    return Number(existingByEmail[0].id_account);
                }

                const existingByUsername = await sql`
                    SELECT id_account FROM account
                    WHERE username_account = ${username}
                    LIMIT 1
                `;
                if (existingByUsername[0]) {
                    await sql`DELETE FROM otp_verify WHERE email = ${email}`;
                    throw new RegistrationSubmitError(
                        'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว กรุณาเริ่มสมัครใหม่ด้วยชื่อผู้ใช้อื่น หรือเข้าสู่ระบบหากสมัครไว้แล้ว',
                    );
                }

                const rows = await sql`
                    INSERT INTO account
                        (username_account, email_account, password_account, salt_account, firstname, lastname, gender, old, height, weight, phone_number, personal_disease)
                    VALUES
                        (${username}, ${userEmail}, ${u.password}, ${u.salt}, ${u.firstname}, ${u.lastname}, ${gender}, ${u.old}, ${u.height}, ${u.weight}, ${u.phone_number}, ${u.personal_disease})
                    RETURNING id_account
                `;
                const id = Number(rows[0]?.id_account);
                const addr = u.address;
                if (addr?.house_no && addr?.zipcode) {
                    await sql`
                        INSERT INTO account_address (id_account, house_no, road, sub_district, district, province, zipcode)
                        VALUES (${id}, ${addr.house_no}, ${addr.road || ''}, ${addr.sub_district}, ${addr.district}, ${addr.province}, ${addr.zipcode})
                        ON CONFLICT (id_account) DO UPDATE SET
                            house_no = EXCLUDED.house_no,
                            road = EXCLUDED.road,
                            sub_district = EXCLUDED.sub_district,
                            district = EXCLUDED.district,
                            province = EXCLUDED.province,
                            zipcode = EXCLUDED.zipcode,
                            updated_at = NOW()
                    `;
                }
                await sql`DELETE FROM otp_verify WHERE email = ${email}`;
                return id;
            });
            if (!newId) return { status: 'error', message: 'บันทึกข้อมูลไม่สำเร็จ' };
            return { status: 'success', message: 'สมัครสมาชิกสำเร็จ!', redirect: '/auth/login-user' };
        }

        if (type === 'pharmacist') {
            const newId = await completePharmacistRegistration(u, email);
            if (!newId) return { status: 'error', message: 'บันทึกข้อมูลไม่สำเร็จ' };
            void notifyAdminsNewPharmacistFromTemp(newId, u, email, event);
            return {
                status: 'success',
                message: 'สมัครสมาชิกสำเร็จ! รอการอนุมัติจากผู้ดูแลระบบ',
                redirect: '/auth/login-pharmacist',
            };
        }

        if (type === 'admin') {
            const newId = await completeAdminRegistration(u, email);
            if (!newId) return { status: 'error', message: 'บันทึกข้อมูลไม่สำเร็จ' };
            return {
                status: 'success',
                message: 'สมัครสมาชิกสำเร็จ! รอการอนุมัติจากผู้ดูแลระบบ',
                redirect: '/auth/login-admin',
            };
        }

        if (type === 'store') {
            const newId = await completeStoreRegistration(u, email);
            if (!newId) return { status: 'error', message: 'บันทึกข้อมูลไม่สำเร็จ' };
            void notifyAdminsNewStoreFromTemp(newId, u, email, event);
            return {
                status: 'success',
                message: 'สมัครสมาชิกสำเร็จ! รอการอนุมัติจากผู้ดูแลระบบ',
                redirect: '/auth/login-store',
            };
        }
    } catch (err) {
        if (type === 'user' && isPgUniqueViolation(err)) {
            const userEmail = String(u.email || email).trim();
            const recovered = await dbQuery(async (sql) => {
                const rows = await sql`
                    SELECT id_account FROM account
                    WHERE email_account = ${userEmail}
                    LIMIT 1
                `;
                if (!rows?.[0]) return null;
                await sql`DELETE FROM otp_verify WHERE email = ${email}`;
                return Number(rows[0].id_account);
            });
            if (recovered) {
                return { status: 'success', message: 'สมัครสมาชิกสำเร็จ!', redirect: '/auth/login-user' };
            }
        }
        const friendly = formatRegistrationDbError(err);
        if (friendly) {
            return { status: 'error', message: friendly };
        }
        throw err;
    }

    return { status: 'error', message: `ยืนยัน OTP สำหรับ ${type} ยังไม่พร้อม — ติดต่อผู้ดูแลระบบ` };
}

export async function handleResendOtp(event: H3Event) {
    const fields = await readRequestFields(event);
    const type = parseOtpType(fields.type);
    const email = String(fields.email || '').trim();

    if (!type) return { status: 'error', message: 'ประเภทผู้ใช้งานไม่ถูกต้อง' };
    if (!email) return { status: 'error', message: 'ไม่พบอีเมลผู้ใช้งาน' };

    const table = OTP_TABLES[type];
    const row = await dbQuery(async (sql) => sql.unsafe(
        `SELECT * FROM ${table} WHERE email = $1 ORDER BY expires_at DESC LIMIT 1`,
        [email],
    ));
    if (!row?.[0]) {
        return { status: 'error', message: 'ไม่พบข้อมูลการสมัคร กรุณาเริ่มสมัครใหม่อีกครั้ง' };
    }

    const newOtp = String(Math.floor(100000 + Math.random() * 900000));
    await dbQuery(async (sql) => sql.unsafe(
        `UPDATE ${table}
         SET otp_code = $1, expires_at = NOW() + INTERVAL '5 minutes'
         WHERE email = $2`,
        [newOtp, email],
    ));

    const mailed = await sendOtpEmail(email, newOtp, {
        purpose: 'ยืนยันตัวตน',
        role: getRoleFromOtpType(type),
    });
    if (!mailed) console.log('[otp] resend OTP:', newOtp, email);

    return {
        status: 'success',
        message: mailed ? 'ส่งรหัส OTP ใหม่ไปยังอีเมลของคุณเรียบร้อยแล้ว (หมดอายุใน 5 นาที)' : 'สร้าง OTP ใหม่แล้ว (ตั้งค่า SMTP เพื่อส่งอีเมลจริง)',
        email,
        ...(process.dev && !mailed ? { dev_otp: newOtp } : {}),
    };
}
