import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

/**
 * Queue consumer for watermarking purchased PDFs.
 * Triggered by a message from the Pages webhook function after a successful Stripe payment.
 *
 * Each job contains: { sessionId, email, name, purchaseDate }
 * On completion: watermarked PDF stored in R2, token written to KV, download email sent.
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

async function processJob({ sessionId, email, name, purchaseDate }, env) {
  // 1. Load original PDF from R2
  const original = await env.BOOK_BUCKET.get('book/original.pdf');
  if (!original) throw new Error('Original PDF not found at book/original.pdf in R2');
  const pdfBytes = await original.arrayBuffer();

  // 2. Watermark all pages with the buyer's email and purchase date
  const watermarked = await watermarkPDF(pdfBytes, email, purchaseDate);

  // 3. Store the personalised copy in R2
  const r2Key = `book/purchases/${sessionId}.pdf`;
  await env.BOOK_BUCKET.put(r2Key, watermarked, {
    httpMetadata: { contentType: 'application/pdf' },
  });

  // 4. Generate a unique, permanent download token
  const token = crypto.randomUUID();

  // 5. Write token record and email → token reverse lookup to KV
  const record = {
    email,
    name,
    sessionId,
    r2Key,
    createdAt: new Date().toISOString(),
    downloadCount: 0,
  };
  await env.PURCHASES_KV.put(`token:${token}`, JSON.stringify(record));
  await env.PURCHASES_KV.put(`email:${email}`, JSON.stringify({ latestToken: token }));

  // 6. Send the download link by email
  await sendDownloadEmail({ email, name, token, env });
}

async function watermarkPDF(pdfBytes, email, purchaseDate) {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  const watermarkText = `Licensed to: ${email} — ${purchaseDate}`;

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

async function sendDownloadEmail({ email, name, token, env }) {
  const downloadUrl = `https://gridstab.com/api/download?token=${token}`;
  const firstName = name ? name.split(' ')[0] : 'there';

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a; background: #ffffff;">

  <div style="border-top: 4px solid #FF6719; padding-top: 32px; margin-bottom: 32px;"></div>

  <p style="font-size: 16px; margin-bottom: 24px;">Hi ${firstName},</p>

  <p style="font-size: 16px; line-height: 1.7; margin-bottom: 24px;">
    Thank you for purchasing <strong>Grid Stability in the Era of Inverter-Dominated Power Systems</strong>.
    Your personalised copy is ready to download.
  </p>

  <div style="text-align: center; margin: 40px 0;">
    <a href="${downloadUrl}"
       style="background-color: #FF6719; color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-family: Arial, sans-serif; font-size: 16px; font-weight: bold; display: inline-block;">
      Download your book
    </a>
  </div>

  <p style="font-size: 14px; color: #666666; line-height: 1.7; margin-bottom: 16px;">
    This link is personal to you — please keep this email safe.
    You can use it to download the book again at any time.
  </p>

  <p style="font-size: 14px; color: #666666; line-height: 1.7;">
    If you have any questions, feel free to reach out at
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
      subject: 'Your book is ready — Grid Stability in the Era of Inverter-Dominated Power Systems',
      html,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Resend API error ${res.status}: ${errText}`);
  }
}
