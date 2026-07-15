export function otpDeliveryExtras(mailed: boolean, otp: string) {
    if (mailed) {
        return { email_sent: true as const };
    }
    return {
        email_sent: false as const,
        fallback_otp: otp,
    };
}

export function otpDeliveryMessage(mailed: boolean): string {
    return mailed
        ? 'ส่งรหัส OTP ไปยังอีเมลแล้ว'
        : 'ไม่สามารถส่งอีเมลได้ — ดูรหัส OTP ในหน้ายืนยันด้านล่าง';
}

export function otpResendMessage(mailed: boolean): string {
    return mailed
        ? 'ส่งรหัส OTP ใหม่ไปยังอีเมลของคุณเรียบร้อยแล้ว (หมดอายุใน 5 นาที)'
        : 'ไม่สามารถส่งอีเมลได้ — ดูรหัส OTP ใหม่ในหน้านี้ (หมดอายุใน 5 นาที)';
}
