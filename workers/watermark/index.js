import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const MAX_RETRIES = 3; // must match max_retries in wrangler.toml
const GILLES_EMAIL = 'contact@gridstab.com';

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
      const { sessionId } = message.body;

      // Idempotency: skip if this session was already delivered
      const alreadyProcessed = await env.PROCESSED_SESSIONS.get(sessionId);
      if (alreadyProcessed) {
        console.log(`Session ${sessionId} already processed — skipping duplicate`);
        message.ack();
        continue;
      }

      try {
        await processJob(message.body, env);
        // Mark as delivered (TTL: 30 days)
        await env.PROCESSED_SESSIONS.put(sessionId, '1', { expirationTtl: 2592000 });
        message.ack();
      } catch (err) {
        console.error(`Watermark job failed for session ${sessionId} (attempt ${message.attempts}):`, err);

        if (message.attempts > MAX_RETRIES) {
          // All retries exhausted — alert Gilles so he can deliver manually
          await notifyDeliveryFailure(message.body, err, env).catch(e =>
            console.error('Failed to send delivery failure alert:', e)
          );
          message.ack();
        } else {
          message.retry();
        }
      }
    }
  },
};

async function processJob({ sessionId, email, name, purchaseDate }, env) {
  // 1. Fetch Stripe session with expanded payment method (single API call)
  const sessionDetails = await fetchStripeSession(sessionId, env.STRIPE_SECRET_KEY);
  const amountTotal = sessionDetails.amount_total; // in cents
  const currency = sessionDetails.currency;
  const cardLast4 = sessionDetails.payment_intent?.payment_method?.card?.last4 || '';
  const purchaseTimestamp = sessionDetails.created * 1000; // Stripe uses Unix seconds

  // 2. Load original PDF from R2
  const original = await env.BOOK_BUCKET.get('book/original.pdf');
  if (!original) throw new Error('Original PDF not found at book/original.pdf in R2');
  const pdfBytes = await original.arrayBuffer();

  // 3. Watermark all pages with the buyer's email and purchase date
  const watermarked = await watermarkPDF(pdfBytes, email, name, purchaseDate);

  // 4. Send the watermarked PDF to the buyer
  await sendBookEmail({ email, name, pdfBytes: watermarked, amountTotal, cardLast4, currency, purchaseTimestamp, env });

  // 5. Notify Gilles of the sale
  await notifySale({ sessionId, email, name, purchaseDate, env });
}

async function watermarkPDF(pdfBytes, email, name, purchaseDate) {
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

async function fetchStripeSession(sessionId, secretKey) {
  const url = new URL(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`);
  url.searchParams.append('expand[]', 'payment_intent.payment_method');
  const res = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${secretKey}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch Stripe session: ${res.statusText}`);
  return await res.json();
}

// Chunked base64 encoding — avoids call stack overflow on large buffers
function toBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const chunkSize = 0x8000; // 32KB
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function sendEmail({ to, subject, html, env }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Resend API error ${res.status}: ${errText}`);
  }
}

async function sendBookEmail({ email, name, pdfBytes, amountTotal, cardLast4, currency, purchaseTimestamp, env }) {
  const firstName = name ? name.split(' ')[0] : 'there';
  const base64Pdf = toBase64(pdfBytes);
  const purchaseDateTime = new Date(purchaseTimestamp).toLocaleString('en-GB', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }) + ' UTC';
  const price = (amountTotal / 100).toLocaleString('en-US', { style: 'currency', currency: currency?.toUpperCase() || 'EUR' });

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a; background: #ffffff;">

  <div style="border-top: 4px solid #FF6719; padding-top: 32px; margin-bottom: 32px;"></div>

  <p style="font-size: 16px; margin-bottom: 24px;">Hi ${firstName},</p>

  <p style="font-size: 16px; line-height: 1.7; margin-bottom: 24px;">
    Thank you for purchasing <strong>Grid Stability in the Era of Inverter-Dominated Power Systems</strong>.
    Your personalised copy is attached to this email, please save it, this is a one-time delivery.
  </p>

  <div style="margin: 32px 0; padding: 24px; background: #f8f8f8; border-left: 4px solid #FF6719;">
    <h3 style="font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; color: #1a1a1a; margin: 0 0 16px 0;">Order Confirmation</h3>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px; font-family: Arial, sans-serif;">
      <tr style="border-bottom: 1px solid #e5e5e5;">
        <td style="padding: 8px 0; color: #666666;">Email:</td>
        <td style="padding: 8px 0; text-align: right; color: #1a1a1a;">${email}</td>
      </tr>
      <tr style="border-bottom: 1px solid #e5e5e5;">
        <td style="padding: 8px 0; color: #666666;">Product:</td>
        <td style="padding: 8px 0; text-align: right; color: #1a1a1a;">Grid Stability eBook</td>
      </tr>
      <tr style="border-bottom: 1px solid #e5e5e5;">
        <td style="padding: 8px 0; color: #666666;">Amount:</td>
        <td style="padding: 8px 0; text-align: right; color: #1a1a1a;">${price}</td>
      </tr>
      <tr style="border-bottom: 1px solid #e5e5e5;">
        <td style="padding: 8px 0; color: #666666;">Payment method:</td>
        <td style="padding: 8px 0; text-align: right; color: #1a1a1a;">Card ending in ${cardLast4 || '••••'}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #666666;">Date:</td>
        <td style="padding: 8px 0; text-align: right; color: #1a1a1a;">${purchaseDateTime}</td>
      </tr>
    </table>
  </div>

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

async function notifySale({ sessionId, email, name, purchaseDate, env }) {
  // Skip sale notification for manual test runs — only real Stripe live sessions
  // should surface as "New book sale" in Gilles' inbox.
  if (!sessionId.startsWith('cs_live_')) return;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 32px 20px; color: #1a1a1a;">
  <p style="font-size: 16px; margin-bottom: 16px;">📚 New book sale</p>
  <p style="font-size: 15px; color: #444;">
    <strong>Buyer:</strong> ${name || '(no name)'}<br>
    <strong>Email:</strong> ${email}<br>
    <strong>Date:</strong> ${purchaseDate}<br>
    <strong>Stripe session:</strong> ${sessionId}
  </p>
  <p style="font-size: 13px; color: #888;">The watermarked PDF has been delivered automatically.</p>
</body>
</html>`;

  await sendEmail({
    to: GILLES_EMAIL,
    subject: `New sale — ${name || email}`,
    html,
    env,
  });
}

async function notifyDeliveryFailure({ sessionId, email, name }, err, env) {
  if (!sessionId.startsWith('cs_live_')) return;
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 32px 20px; color: #1a1a1a;">
  <p style="font-size: 16px; color: #cc0000; margin-bottom: 16px;">⚠️ Book delivery failed</p>
  <p style="font-size: 15px; color: #444;">
    <strong>Buyer:</strong> ${name || '(no name)'}<br>
    <strong>Email:</strong> ${email}<br>
    <strong>Session:</strong> ${sessionId}
  </p>
  <p style="font-size: 14px; color: #444;">
    All ${MAX_RETRIES + 1} delivery attempts failed. The buyer has not received their book.
  </p>
  <p style="font-size: 14px; color: #444;">
    <strong>Action required:</strong> Contact the buyer at ${email} to let them know,
    then forward this email to your developer to manually re-trigger delivery.
  </p>
  <p style="font-size: 13px; color: #888; font-family: monospace;">${err?.message || 'Unknown error'}</p>
</body>
</html>`;

  await sendEmail({
    to: GILLES_EMAIL,
    subject: `⚠️ Failed book delivery — ${name || email}`,
    html,
    env,
  });
}
