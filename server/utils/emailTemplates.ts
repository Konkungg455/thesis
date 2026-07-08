export type MailRole = 'user' | 'admin' | 'pharmacist' | 'store';

const LOGO_URL = 'https://ik.imagekit.io/pcqen5m7p/Telebotpharcy%20(1)%201%20(2).png';

interface RoleTheme {
    label: string;
    badge: string;
    accent: string;
    accentDark: string;
    accentLight: string;
    icon: string;
    loginHint: string;
}

const ROLE_THEMES: Record<MailRole, RoleTheme> = {
    user: {
        label: 'ผู้ใช้งาน',
        badge: 'บัญชีผู้ป่วย / ผู้ใช้บริการ',
        accent: '#0d9488',
        accentDark: '#0f766e',
        accentLight: '#ecfdf5',
        icon: '👤',
        loginHint: 'เข้าสู่ระบบผู้ใช้งาน',
    },
    pharmacist: {
        label: 'เภสัชกร',
        badge: 'บัญชีเภสัชกรออนไลน์',
        accent: '#00469c',
        accentDark: '#003575',
        accentLight: '#eff6ff',
        icon: '💊',
        loginHint: 'เข้าสู่ระบบเภสัชกร',
    },
    store: {
        label: 'เจ้าของร้าน',
        badge: 'บัญชีเจ้าของร้านยา',
        accent: '#7c3aed',
        accentDark: '#6d28d9',
        accentLight: '#f5f3ff',
        icon: '🏪',
        loginHint: 'เข้าสู่ระบบเจ้าของร้าน',
    },
    admin: {
        label: 'ผู้ดูแลระบบ',
        badge: 'บัญชีแอดมิน',
        accent: '#1e293b',
        accentDark: '#0f172a',
        accentLight: '#f8fafc',
        icon: '🛡️',
        loginHint: 'เข้าสู่ระบบผู้ดูแล',
    },
};

function rxEsc(v: unknown): string {
    return String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function emailShell(options: {
    role: MailRole;
    title: string;
    subtitle?: string;
    bodyHtml: string;
}): string {
    const theme = ROLE_THEMES[options.role];
    const subtitle = options.subtitle || theme.badge;

    return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#e2e8f0;font-family:Tahoma,'Sarabun',Arial,sans-serif;color:#0f172a;">
  <div style="max-width:580px;margin:0 auto;padding:28px 14px;">
    <div style="background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 12px 40px rgba(15,23,42,0.12);">
      <div style="background:linear-gradient(135deg,${theme.accentDark} 0%,${theme.accent} 100%);padding:28px 24px 22px;text-align:center;">
        <img src="${rxEsc(LOGO_URL)}" alt="Telebot Pharmacy" width="120" style="display:block;margin:0 auto 14px;height:auto;max-width:140px;" />
        <div style="color:#fff;font-size:21px;font-weight:bold;line-height:1.35;">${rxEsc(options.title)}</div>
        <div style="display:inline-block;margin-top:12px;padding:6px 14px;border-radius:999px;background:rgba(255,255,255,0.18);color:#fff;font-size:12px;">
          ${theme.icon} ${rxEsc(subtitle)}
        </div>
      </div>
      <div style="padding:28px 24px;">
        ${options.bodyHtml}
      </div>
      <div style="background:#f8fafc;padding:16px 24px;font-size:11px;color:#94a3b8;text-align:center;line-height:1.7;border-top:1px solid #e2e8f0;">
        อีเมลฉบับนี้ส่งโดยอัตโนมัติจาก <strong style="color:#64748b;">Telebot Pharmacy</strong> — กรุณาอย่าตอบกลับ<br>
        หากคุณไม่ได้ดำเนินการนี้ สามารถเพิกเฉยต่ออีเมลนี้ได้อย่างปลอดภัย
      </div>
    </div>
    <div style="text-align:center;margin-top:16px;font-size:11px;color:#94a3b8;">
      © Telebot Pharmacy — ระบบปรึกษาเภสัชกรออนไลน์
    </div>
  </div>
</body></html>`;
}

export function buildOtpEmailHtml(options: {
    otp: string;
    role?: MailRole;
    purpose?: string;
    recipientName?: string;
    expiresMinutes?: number;
}): { subject: string; html: string; text: string } {
    const role = options.role || 'user';
    const theme = ROLE_THEMES[role];
    const purpose = options.purpose || 'สมัครสมาชิก';
    const expires = options.expiresMinutes ?? 5;
    const greeting = options.recipientName
        ? `สวัสดีค่ะ/ครับ คุณ${rxEsc(options.recipientName)}`
        : 'สวัสดีค่ะ/ครับ';

    const purposeLine = purpose === 'สมัครสมาชิก'
        ? `ขอบคุณที่สมัครใช้งาน <strong style="color:${theme.accent};">Telebot Pharmacy</strong> ในฐานะ<strong style="color:${theme.accent};">${theme.label}</strong>`
        : `คุณได้ขอรหัสยืนยันตัวตนสำหรับ<strong style="color:${theme.accent};">${theme.label}</strong>`;

    const subject = purpose === 'สมัครสมาชิก'
        ? `รหัส OTP สมัครสมาชิก ${theme.label} — Telebot Pharmacy`
        : `รหัส OTP ยืนยันตัวตน ${theme.label} — Telebot Pharmacy`;

    const bodyHtml = `
        <p style="margin:0 0 8px;font-size:16px;color:#0f172a;">${greeting}</p>
        <p style="margin:0 0 22px;color:#475569;line-height:1.75;font-size:14px;">${purposeLine} กรุณาใช้รหัส OTP ด้านล่างเพื่อยืนยันตัวตน</p>
        <div style="background:${theme.accentLight};border:2px dashed ${theme.accent};border-radius:16px;padding:26px 18px;text-align:center;margin:0 0 22px;">
          <div style="font-size:11px;color:#64748b;margin-bottom:10px;letter-spacing:1px;text-transform:uppercase;">รหัส OTP ของคุณ</div>
          <div style="font-size:40px;font-weight:bold;letter-spacing:12px;color:${theme.accent};font-family:Consolas,'Courier New',monospace;line-height:1;">${rxEsc(options.otp)}</div>
        </div>
        <table role="presentation" style="width:100%;border:1px solid #e2e8f0;border-radius:12px;border-collapse:separate;border-spacing:0;margin-bottom:18px;">
          <tr>
            <td style="padding:12px 16px;color:#64748b;font-size:13px;">ประเภทบัญชี</td>
            <td style="padding:12px 16px;font-weight:bold;text-align:right;color:${theme.accent};">${rxEsc(theme.label)}</td>
          </tr>
          <tr>
            <td style="padding:12px 16px;color:#64748b;font-size:13px;border-top:1px solid #e2e8f0;">หมดอายุภายใน</td>
            <td style="padding:12px 16px;font-weight:bold;text-align:right;border-top:1px solid #e2e8f0;">${expires} นาที</td>
          </tr>
        </table>
        <div style="background:#fff7ed;border-left:4px solid #f97316;padding:14px 16px;border-radius:0 10px 10px 0;font-size:12px;color:#9a3412;line-height:1.65;">
          <strong>🔒 ความปลอดภัย:</strong> อย่าแชร์รหัส OTP ให้ผู้อื่น ทีมงาน Telebot Pharmacy จะไม่ขอรหัสนี้จากคุณ
        </div>`;

    const html = emailShell({
        role,
        title: 'รหัสยืนยันตัวตน (OTP)',
        subtitle: `${theme.badge} · ${purpose}`,
        bodyHtml,
    });

    const text = [
        `Telebot Pharmacy — รหัส OTP สำหรับ${theme.label}`,
        `รหัส OTP: ${options.otp}`,
        `หมดอายุใน ${expires} นาที`,
        'อย่าแชร์รหัสนี้ให้ผู้อื่น',
    ].join('\n');

    return { subject, html, text };
}

export function buildResetPasswordEmailHtml(options: {
    link: string;
    role?: MailRole;
    recipientName?: string;
    expiresMinutes?: number;
}): { subject: string; html: string; text: string } {
    const role = options.role || 'user';
    const theme = ROLE_THEMES[role];
    const expires = options.expiresMinutes ?? 30;
    const greeting = options.recipientName
        ? `สวัสดีค่ะ/ครับ คุณ${rxEsc(options.recipientName)}`
        : 'สวัสดีค่ะ/ครับ';

    const subject = `รีเซ็ตรหัสผ่าน ${theme.label} — Telebot Pharmacy`;

    const bodyHtml = `
        <p style="margin:0 0 8px;font-size:16px;color:#0f172a;">${greeting}</p>
        <p style="margin:0 0 22px;color:#475569;line-height:1.75;font-size:14px;">
          เราได้รับคำขอรีเซ็ตรหัสผ่านสำหรับบัญชี<strong style="color:${theme.accent};">${theme.label}</strong> ของคุณ
          กดปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่
        </p>
        <div style="text-align:center;margin:26px 0;">
          <a href="${rxEsc(options.link)}" style="display:inline-block;background:linear-gradient(135deg,${theme.accentDark},${theme.accent});color:#fff;text-decoration:none;padding:15px 32px;border-radius:12px;font-weight:bold;font-size:15px;box-shadow:0 6px 18px rgba(15,23,42,0.18);">
            🔐 ตั้งรหัสผ่านใหม่
          </a>
        </div>
        <table role="presentation" style="width:100%;border:1px solid #e2e8f0;border-radius:12px;border-collapse:separate;border-spacing:0;margin-bottom:18px;">
          <tr>
            <td style="padding:12px 16px;color:#64748b;font-size:13px;">ประเภทบัญชี</td>
            <td style="padding:12px 16px;font-weight:bold;text-align:right;color:${theme.accent};">${rxEsc(theme.label)}</td>
          </tr>
          <tr>
            <td style="padding:12px 16px;color:#64748b;font-size:13px;border-top:1px solid #e2e8f0;">ลิงก์หมดอายุภายใน</td>
            <td style="padding:12px 16px;font-weight:bold;text-align:right;border-top:1px solid #e2e8f0;">${expires} นาที</td>
          </tr>
          <tr>
            <td style="padding:12px 16px;color:#64748b;font-size:13px;border-top:1px solid #e2e8f0;">หลังเปลี่ยนรหัสแล้ว</td>
            <td style="padding:12px 16px;text-align:right;border-top:1px solid #e2e8f0;">${rxEsc(theme.loginHint)}</td>
          </tr>
        </table>
        <p style="margin:0 0 8px;font-size:12px;color:#64748b;">หากปุ่มกดไม่ได้ ให้คัดลอกลิงก์นี้ไปวางในเบราว์เซอร์:</p>
        <p style="margin:0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;font-size:11px;word-break:break-all;color:#334155;line-height:1.6;">
          <a href="${rxEsc(options.link)}" style="color:${theme.accent};">${rxEsc(options.link)}</a>
        </p>`;

    const html = emailShell({
        role,
        title: 'รีเซ็ตรหัสผ่าน',
        subtitle: theme.badge,
        bodyHtml,
    });

    const text = [
        `Telebot Pharmacy — รีเซ็ตรหัสผ่าน${theme.label}`,
        `ลิงก์ตั้งรหัสผ่านใหม่ (หมดอายุ ${expires} นาที):`,
        options.link,
        'หากคุณไม่ได้ขอรีเซ็ตรหัสผ่าน กรุณาเพิกเฉยต่ออีเมลนี้',
    ].join('\n');

    return { subject, html, text };
}

export function getRoleFromOtpType(type: string | undefined): MailRole {
    if (type === 'admin' || type === 'pharmacist' || type === 'store') return type;
    return 'user';
}

export function getRoleFromAuthType(type: string | undefined): MailRole {
    if (type === 'admin' || type === 'pharmacist' || type === 'store') return type;
    return 'user';
}
