import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

/**
 * Queue consumer for watermarking purchased PDFs.
 * Triggered by a message from the Pages webhook function after a successful Stripe payment.
 *
 * Each job contains: { sessionId, email, name, purchaseDate }
 * On completion: watermarked PDF sent as email attachment, then discarded — not stored anywhere.
 */
export default {
  async queue(batch, env) {
    for (const message of batch.messages) {
      try {
        await processJob(message.body, env);
        message.ack();
      } catch (err) {
        console.error(`Watermark job failed for session ${message.body.sessionId}:`, err);
        message.retry();
      }
    }
  },
};

async function processJob({ email, name, purchaseDate }, env) {
  // 1. Load original PDF from R2
  const original = await env.BOOK_BUCKET.get('book/original.pdf');
  if (!original) throw new Error('Original PDF not found at book/original.pdf in R2');
  const pdfBytes = await original.arrayBuffer();

  // 2. Watermark all pages with the buyer's email and purchase date
  const watermarked = await watermarkPDF(pdfBytes, email, purchaseDate);

  // 3. Send the watermarked PDF as an email attachment — then discard it
  await sendBookEmail({ email, name, pdfBytes: watermarked, env });
}

async function watermarkPDF(pdfBytes, email, purchaseDate) {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  const watermarkText = name
    ? `Licensed to: ${name} (${email}) — ${purchaseDate}`
    : `Licensed to: ${email} — ${purchaseDate}`;

  for (const page of pages) {
    const { width } = page.getSize();
    const textWidth = font.widthOfTextAtSize(watermarkText, 7);
    page.drawText(watermarkText, {
      x: (width - textWidth) / 2,
      y: 10,
      size: 7,
      font,
      color: rgb(0.5, 0.5, 0.5),
      opacity: 0.6,
    });
  }

  return await pdfDoc.save();
}

function toBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function sendBookEmail({ email, name, pdfBytes, env }) {
  const firstName = name ? name.split(' ')[0] : 'there';
  const base64Pdf = toBase64(pdfBytes);

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a; background: #ffffff;">

  <div style="border-top: 4px solid #FF6719; padding-top: 32px; margin-bottom: 32px;"></div>

  <p style="font-size: 16px; margin-bottom: 24px;">Hi ${firstName},</p>

  <p style="font-size: 16px; line-height: 1.7; margin-bottom: 24px;">
    Thank you for purchasing <strong>Grid Stability in the Era of Inverter-Dominated Power Systems</strong>.
    Your personalised copy is attached to this email.
  </p>

  <p style="font-size: 16px; line-height: 1.7; margin-bottom: 24px;">
    Please save it to your device or cloud storage — this is a one-time delivery and the attachment
    will not be re-sent automatically. If you ever lose the file, reach out to Gilles directly.
  </p>

  <p style="font-size: 14px; color: #666666; line-height: 1.7;">
    Questions or feedback? Feel free to write to
    <a href="mailto:contact@gridstab.com" style="color: #FF6719; text-decoration: none;">contact@gridstab.com</a>.
  </p>

  <div style="margin-top: 48px; padding-top: 24px; border-top: 1px solid #e5e5e5;">
    <p style="font-size: 12px; color: #999999; margin: 0; line-height: 1.6;">
      Gilles Chaspierre &mdash;
      <a href="https://gridstab.com" style="color: #999999; text-decoration: none;">gridstab.com</a>
    </p>
  </div>

</body>
</html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: [email],
      subject: 'Your book — Grid Stability in the Era of Inverter-Dominated Power Systems',
      html,
      attachments: [
        {
          filename: 'Grid-Stability-Gilles-Chaspierre.pdf',
          content: base64Pdf,
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Resend API error ${res.status}: ${errText}`);
  }
}
