import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const MAX_RETRIES = 3; // must match max_retries in wrangler.toml
const GILLES_EMAIL = 'contact@gridstab.com';
const LINK_VALIDITY_DAYS = 30;
// Cleanup deletes objects strictly older than this; one extra day gives a buffer
// past link expiry so a buyer clicking the link on day 30 still resolves.
const CLEANUP_AGE_DAYS = LINK_VALIDITY_DAYS + 1;

/**
 * Queue consumer for watermarking purchased PDFs.
 * Triggered by a message from the Pages webhook function after a successful Stripe payment.
 *
 * Each job contains: { sessionId, email, name, purchaseDate }
 * On completion: watermarked PDF uploaded to R2 at delivered/{sessionId}.pdf,
 * a signed 30-day download link is emailed to the buyer, and the file is
 * removed by the scheduled cleanup once expired.
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

  // Cron-triggered cleanup of expired delivery PDFs (see wrangler.toml triggers).
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(cleanupExpiredDeliveries(env));
  },
};

async function processJob({ sessionId, email, name, purchaseDate, siteUrl, overrideEmail, redeliver }, env) {
  // 1. Fetch Stripe session with expanded payment method (single API call).
  // The Worker is a single deployment that serves both live and test sessions
  // (test sessions originate from Pages preview builds), so it needs both keys.
  const stripeKey = sessionId.startsWith('cs_test_')
    ? env.STRIPE_SECRET_KEY_TEST
    : env.STRIPE_SECRET_KEY;
  const sessionDetails = await fetchStripeSession(sessionId, stripeKey);
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

  // 4. Upload watermarked PDF to R2 (overwrites on retry — safe)
  await env.BOOK_BUCKET.put(`delivered/${sessionId}.pdf`, watermarked, {
    httpMetadata: { contentType: 'application/pdf' },
  });

  // 5. Build a signed, time-limited download URL (30 days)
  const expirySec = Math.floor(Date.now() / 1000) + LINK_VALIDITY_DAYS * 86400;
  const sig = await signDownloadToken(sessionId, expirySec, env.DOWNLOAD_LINK_SECRET);
  const downloadUrl = `${siteUrl}/api/book/download?s=${encodeURIComponent(sessionId)}&exp=${expirySec}&sig=${sig}`;

  // 6. Send the download link to the buyer (use overrideEmail if this is a re-delivery)
  const deliveryEmail = overrideEmail || email;
  await sendBookEmail({ email: deliveryEmail, name, downloadUrl, expirySec, amountTotal, cardLast4, currency, purchaseTimestamp, env });

  // 7. Notify Gilles of the sale (skip for re-deliveries to avoid duplicate alerts)
  if (!redeliver) {
    await notifySale({ sessionId, email, name, purchaseDate, env });
  }
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

async function sendBookEmail({ email, name, downloadUrl, expirySec, amountTotal, cardLast4, currency, purchaseTimestamp, env }) {
  const firstName = name ? name.split(' ')[0] : 'there';
  const purchaseDateTime = new Date(purchaseTimestamp).toLocaleString('en-GB', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }) + ' UTC';
  const expiryDate = new Date(expirySec * 1000).toLocaleString('en-GB', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const price = (amountTotal / 100).toLocaleString('en-US', { style: 'currency', currency: currency?.toUpperCase() || 'EUR' });

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a; background: #ffffff;">

  <div style="border-top: 4px solid #FF6719; padding-top: 32px; margin-bottom: 32px;"></div>

  <p style="font-size: 16px; margin-bottom: 24px;">Hi ${firstName},</p>

  <p style="font-size: 16px; line-height: 1.7; margin-bottom: 24px;">
    Thank you for purchasing <strong>Grid Stability in the Era of Inverter-Dominated Power Systems</strong>.
    Your personalised copy is ready to download using the button below.
  </p>

  <div style="text-align: center; margin: 32px 0;">
    <a href="${downloadUrl}"
       style="display: inline-block; background: #FF6719; color: #ffffff !important; padding: 16px 36px; font-family: Arial, sans-serif; font-size: 16px; font-weight: bold; text-decoration: none; border-radius: 4px;">
      Download your book
    </a>
    <p style="font-family: Arial, sans-serif; font-size: 13px; color: #666666; margin: 16px 0 0 0;">
      This link is valid for 30 days, until ${expiryDate}. Please save the PDF locally once downloaded.
    </p>
  </div>

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

  await sendEmail({
    to: email,
    subject: 'Your book — Grid Stability in the Era of Inverter-Dominated Power Systems',
    html,
    env,
  });
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

async function signDownloadToken(sessionId, expirySec, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(`${sessionId}|${expirySec}`));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function cleanupExpiredDeliveries(env) {
  const cutoffMs = Date.now() - CLEANUP_AGE_DAYS * 86400000;
  let cursor;
  let deleted = 0;
  let scanned = 0;
  do {
    const list = await env.BOOK_BUCKET.list({ prefix: 'delivered/', cursor });
    scanned += list.objects.length;
    for (const obj of list.objects) {
      const uploadedMs = new Date(obj.uploaded).getTime();
      if (uploadedMs < cutoffMs) {
        await env.BOOK_BUCKET.delete(obj.key);
        deleted++;
      }
    }
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
  console.log(`Cleanup: scanned ${scanned}, deleted ${deleted} expired delivery PDFs`);
}
