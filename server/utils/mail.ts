import {
    buildOtpEmailHtml,
    buildResetPasswordEmailHtml,
    type MailRole,
} from './emailTemplates';

export interface EmailAttachment {
    filename: string;
    content?: Buffer | string;
    path?: string;
    cid?: string;
    contentType?: string;
}

export interface RichEmailOptions {
    to: string;
    toName?: string;
    subject: string;
    html: string;
    text?: string;
    fromName?: string;
    replyTo?: string;
    attachments?: EmailAttachment[];
}

function getTransporterConfig() {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
        return null;
    }

    return {
        host,
        user,
        pass,
        fromEmail: process.env.SMTP_FROM || user,
        fromName: process.env.SMTP_FROM_NAME || 'Telebot Pharmacy',
        port: Number(process.env.SMTP_PORT || 465),
        secure: process.env.SMTP_SECURE !== 'false',
    };
}

export async function sendRichEmail(options: RichEmailOptions): Promise<boolean> {
    const cfg = getTransporterConfig();
    if (!cfg) {
        console.warn('[mail] SMTP not configured (SMTP_HOST, SMTP_USER, SMTP_PASS)');
        return false;
    }

    const fromName = options.fromName || cfg.fromName;

    try {
        const nodemailer = await import('nodemailer');
        const transporter = nodemailer.createTransport({
            host: cfg.host,
            port: cfg.port,
            secure: cfg.secure,
            auth: { user: cfg.user, pass: cfg.pass },
        });

        await transporter.sendMail({
            from: `"${fromName}" <${cfg.fromEmail}>`,
            to: options.toName ? `"${options.toName}" <${options.to}>` : options.to,
            replyTo: options.replyTo || cfg.fromEmail,
            subject: options.subject,
            html: options.html,
            text: options.text || options.html.replace(/<[^>]+>/g, ''),
            encoding: 'utf-8',
            attachments: (options.attachments || []).map((a) => ({
                filename: a.filename,
                content: a.content,
                path: a.path,
                cid: a.cid,
                contentType: a.contentType,
            })),
        });
        return true;
    } catch (err) {
        console.error('[mail] send failed:', err);
        return false;
    }
}

export async function sendEmail(to: string, subject: string, html: string, text?: string): Promise<boolean> {
    return sendRichEmail({ to, subject, html, text });
}

export interface SendOtpEmailOptions {
    purpose?: string;
    role?: MailRole;
    recipientName?: string;
    expiresMinutes?: number;
}

export async function sendOtpEmail(
    to: string,
    otp: string,
    options: SendOtpEmailOptions | string = {},
): Promise<boolean> {
    const opts = typeof options === 'string'
        ? { purpose: options }
        : options;

    const built = buildOtpEmailHtml({
        otp,
        role: opts.role,
        purpose: opts.purpose,
        recipientName: opts.recipientName,
        expiresMinutes: opts.expiresMinutes,
    });

    return sendRichEmail({
        to,
        toName: opts.recipientName,
        subject: built.subject,
        html: built.html,
        text: built.text,
        fromName: 'Telebot Pharmacy',
    });
}

export interface SendResetPasswordEmailOptions {
    role?: MailRole;
    recipientName?: string;
    expiresMinutes?: number;
}

export async function sendResetPasswordEmail(
    to: string,
    link: string,
    options: SendResetPasswordEmailOptions | MailRole = {},
): Promise<boolean> {
    const opts = typeof options === 'string'
        ? { role: options }
        : options;

    const built = buildResetPasswordEmailHtml({
        link,
        role: opts.role,
        recipientName: opts.recipientName,
        expiresMinutes: opts.expiresMinutes,
    });

    return sendRichEmail({
        to,
        toName: opts.recipientName,
        subject: built.subject,
        html: built.html,
        text: built.text,
        fromName: 'Telebot Pharmacy',
    });
}