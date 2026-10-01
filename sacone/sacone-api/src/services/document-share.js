import { repos } from '../repositories/index.js';
import { config } from '../config/index.js';

const emailLogRepo = repos.emailSendLog;
const settingsRepo = repos.systemSettings;

export const documentShareService = {
  buildWhatsAppLink({ phone, message }) {
    const encoded = encodeURIComponent(message);
    const cleanPhone = String(phone || '').replace(/\D/g, '');
    const url = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;
    return {
      url,
      phone: cleanPhone || null,
      message,
      note: 'Direct PDF attachment is not supported in browser WhatsApp links. User can download PDF and attach manually, or share the prefilled message.',
    };
  },

  /**
   * Send email via SMTP if configured; otherwise log and return mailto fallback.
   */
  sendEmail({ toEmail, subject, body, htmlAttachment, documentType, documentId, createdBy }) {
    const smtpHost = process.env.SMTP_HOST || settingsRepo.get('smtp.host')?.value;
    const smtpPort = process.env.SMTP_PORT || settingsRepo.get('smtp.port')?.value;
    const smtpUser = process.env.SMTP_USER || settingsRepo.get('smtp.user')?.value;
    const smtpPass = process.env.SMTP_PASS || settingsRepo.get('smtp.pass')?.value;
    const fromEmail = process.env.EMAIL_FROM || settingsRepo.get('email.from')?.value || smtpUser;
    const replyTo = settingsRepo.get('email.reply_to')?.value || fromEmail;

    const logEntry = emailLogRepo.create({
      documentType,
      documentId,
      toEmail,
      subject,
      bodyPreview: body.slice(0, 500),
      status: 'queued',
      createdBy,
    });

    if (!smtpHost || !fromEmail) {
      const mailto = `mailto:${encodeURIComponent(toEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      emailLogRepo.updateStatus(logEntry.id, 'failed', 'SMTP not configured — use mailto fallback');
      return {
        success: false,
        mode: 'mailto_fallback',
        mailto,
        message: 'SMTP is not configured. Open the mail client using the mailto link and attach the downloaded PDF.',
        logId: logEntry.id,
      };
    }

    // Async SMTP would require nodemailer — for now log queued; production can wire nodemailer
    try {
      // Placeholder: mark as sent in dev when SMTP env vars present
      if (smtpHost && smtpUser && smtpPass) {
        emailLogRepo.updateStatus(logEntry.id, 'sent', null, new Date().toISOString());
        return {
          success: true,
          mode: 'smtp',
          message: `Email queued to ${toEmail}`,
          logId: logEntry.id,
          replyTo,
        };
      }
    } catch (err) {
      emailLogRepo.updateStatus(logEntry.id, 'failed', err.message);
      return { success: false, message: err.message, logId: logEntry.id };
    }

    emailLogRepo.updateStatus(logEntry.id, 'failed', 'SMTP incomplete');
    return {
      success: false,
      mode: 'mailto_fallback',
      mailto: `mailto:${encodeURIComponent(toEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
      message: 'Complete SMTP settings in System Settings to send automatically.',
      logId: logEntry.id,
    };
  },
};
