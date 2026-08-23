import { generateQuotationPDF } from "@/lib/pdf/generator";
import { COMPANY } from "@/lib/constants";

interface EmailQuoteParams {
  to: string;
  customerName: string;
  quoteNumber: string;
  pdfBuffer: Buffer;
}

export async function emailQuotePDF({
  to,
  customerName,
  quoteNumber,
  pdfBuffer,
}: EmailQuoteParams): Promise<{ success: boolean; message: string }> {
  const apiKey = process.env.RESEND_API_KEY;

  if (apiKey) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${COMPANY.name} <noreply@trysachinelectricals.com>`,
          to: [to],
          subject: `Quotation ${quoteNumber} - ${COMPANY.name}`,
          html: `<p>Dear ${customerName},</p><p>Please find attached your quotation <strong>${quoteNumber}</strong>.</p><p>Regards,<br/>${COMPANY.name}</p>`,
          attachments: [
            {
              filename: `${quoteNumber}.pdf`,
              content: pdfBuffer.toString("base64"),
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error("Email API failed");
      }
      return { success: true, message: "Quote emailed successfully" };
    } catch {
      return { success: false, message: "Failed to send email via Resend" };
    }
  }

  console.log(`[EMAIL] Quote ${quoteNumber} → ${to} (${pdfBuffer.length} bytes)`);
  return {
    success: true,
    message: "Quote logged for delivery (configure RESEND_API_KEY for live email)",
  };
}

export async function notifyAdminNewQuote(
  quoteNumber: string,
  customerName: string
): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL ?? COMPANY.email;
  console.log(
    `[ADMIN NOTIFY] New quote ${quoteNumber} from ${customerName} → ${adminEmail}`
  );
}
