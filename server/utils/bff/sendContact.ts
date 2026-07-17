import type { H3Event } from 'h3';

function escapeHtml(value: string): string {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function buildContactEmailHtml(payload: {
    name: string;
    phone: string;
    email: string;
    subject: string;
    message: string;
}) {
    const rows = [
        ['ชื่อ-นามสกุล', payload.name],
        ['เบอร์โทรศัพท์', payload.phone],
        ['อีเมล', payload.email],
        ['หัวข้อ', payload.subject],
        ['รายละเอียด', payload.message || '—'],
    ];

    const body = rows.map(([label, value]) => `
        <tr>
            <td style="padding:8px 12px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600;width:140px;">${escapeHtml(label)}</td>
            <td style="padding:8px 12px;border:1px solid #e2e8f0;">${escapeHtml(value).replace(/\n/g, '<br>')}</td>
        </tr>
    `).join('');

    return `
        <div style="font-family:Segoe UI,Tahoma,sans-serif;color:#0f172a;line-height:1.6;">
            <h2 style="margin:0 0 12px;color:#0369a1;">ข้อความติดต่อจากเว็บ TELEBOT-PHARMACY</h2>
            <table style="border-collapse:collapse;width:100%;max-width:640px;">${body}</table>
        </div>
    `;
}

export async function handleSendContact(event: H3Event) {
    if (!isDbConfigured()) {
        return { status: 'error', message: 'DATABASE_URL ยังไม่ได้ตั้งค่า — ใส่ใน .env แล้วรีสตาร์ท dev server' };
    }

    await ensureBffSchema();

    const body = await readBody(event).catch(() => ({}));
    const name = String(body?.name || '').trim().slice(0, 255);
    const phone = String(body?.phone || '').trim().slice(0, 64);
    const email = String(body?.email || '').trim().slice(0, 255);
    const subject = String(body?.subject || '').trim().slice(0, 128);
    const message = String(body?.message || '').trim().slice(0, 5000);

    if (!name || !phone || !email || !subject) {
        return { status: 'error', message: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' };
    }
    if (!isValidEmail(email)) {
        return { status: 'error', message: 'รูปแบบอีเมลไม่ถูกต้อง' };
    }

    const inserted = await dbQuery(async (sql) => {
        const rows = await sql`
            INSERT INTO contact_messages (full_name, phone, email, subject, message, created_at)
            VALUES (${name}, ${phone}, ${email}, ${subject}, ${message}, NOW())
            RETURNING id
        `;
        return rows[0] || null;
    });

    if (!inserted) {
        return { status: 'error', message: dbUnavailableMessage() };
    }

    const adminTo = String(process.env.SMTP_FROM || process.env.SMTP_USER || '').trim();
    const mailPayload = { name, phone, email, subject, message };
    let mailSent = false;

    if (adminTo) {
        mailSent = await sendRichEmail({
            to: adminTo,
            subject: `[ติดต่อ] ${subject} — ${name}`,
            html: buildContactEmailHtml(mailPayload),
            text: [
                `ชื่อ: ${name}`,
                `โทร: ${phone}`,
                `อีเมล: ${email}`,
                `หัวข้อ: ${subject}`,
                `รายละเอียด: ${message || '—'}`,
            ].join('\n'),
            replyTo: email,
        });
    }

    return {
        status: 'success',
        id: Number(inserted.id || 0),
        mail_sent: mailSent,
        backend: 'supabase',
    };
}
