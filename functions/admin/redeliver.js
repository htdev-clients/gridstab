const FORM_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Re-deliver Book — GridStab Admin</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; max-width: 520px; margin: 60px auto; padding: 0 24px; color: #1a1a1a; }
    h1 { font-size: 20px; margin: 0 0 8px; }
    .desc { font-size: 14px; color: #666; margin: 0 0 32px; line-height: 1.5; }
    label { display: block; font-size: 13px; font-weight: bold; margin-bottom: 4px; }
    input[type=text], input[type=email] {
      width: 100%; padding: 10px 12px; font-size: 14px;
      border: 1px solid #ccc; border-radius: 4px; margin-bottom: 8px;
    }
    .hint { font-size: 12px; color: #888; margin: 0 0 20px; line-height: 1.4; }
    button { background: #FF6719; color: #fff; border: none; padding: 12px 28px; font-size: 15px; font-weight: bold; border-radius: 4px; cursor: pointer; }
    button:hover { background: #e55c0f; }
    .msg { margin-top: 28px; padding: 16px 20px; border-radius: 4px; font-size: 14px; line-height: 1.6; }
    .msg.ok { background: #e8f5e9; border-left: 4px solid #4caf50; }
    .msg.err { background: #fdecea; border-left: 4px solid #e53935; }
  </style>
</head>
<body>
  <h1>Re-deliver Book</h1>
  <p class="desc">Re-send the personalised watermarked PDF to a buyer who didn't receive it.
  The buyer will receive a fresh 30-day download link by email within ~60 seconds.</p>
  <form method="POST">
    <label for="sessionId">Stripe Session ID</label>
    <input id="sessionId" name="sessionId" type="text" required
           placeholder="cs_live_…" autocomplete="off" spellcheck="false">
    <p class="hint">Find this in the Stripe dashboard or in the failure alert email.</p>
    <label for="overrideEmail">Delivery Email (optional)</label>
    <input id="overrideEmail" name="overrideEmail" type="email"
           placeholder="Leave blank to re-send to the buyer's original email">
    <p class="hint">Only needed if the buyer wants the book sent to a different address
    (e.g. personal inbox instead of a corporate one that blocked it).</p>
    <button type="submit">Re-deliver Book</button>
  </form>
  {{MESSAGE}}
</body>
</html>`;

function unauthorizedResponse() {
  return new Response('Unauthorized', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="GridStab Admin"',
      'Content-Type': 'text/plain',
    },
  });
}

function checkAuth(request, env) {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Basic ')) return false;
  const decoded = atob(auth.slice(6));
  const colonIdx = decoded.indexOf(':');
  if (colonIdx === -1) return false;
  const pass = decoded.slice(colonIdx + 1);
  return pass === env.ADMIN_PASSWORD;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function htmlResponse(message = '') {
  return new Response(FORM_HTML.replace('{{MESSAGE}}', message), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

async function fetchStripeSession(sessionId, secretKey) {
  const res = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
    { headers: { Authorization: `Bearer ${secretKey}` } }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message || `Stripe API error ${res.status}`);
  }
  return res.json();
}

export async function onRequest({ request, env }) {
  if (!checkAuth(request, env)) return unauthorizedResponse();

  if (request.method === 'GET') {
    return htmlResponse();
  }

  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let sessionId, overrideEmail;
  try {
    const form = await request.formData();
    sessionId = form.get('sessionId')?.trim() ?? '';
    overrideEmail = form.get('overrideEmail')?.trim() || null;
  } catch {
    return htmlResponse('<div class="msg err">Could not parse form data.</div>');
  }

  if (!sessionId) {
    return htmlResponse('<div class="msg err">Session ID is required.</div>');
  }

  try {
    // Select Stripe key by session type (test sessions use the test key if available)
    const stripeKey = sessionId.startsWith('cs_test_')
      ? (env.STRIPE_SECRET_KEY_TEST ?? env.STRIPE_SECRET_KEY)
      : env.STRIPE_SECRET_KEY;

    const session = await fetchStripeSession(sessionId, stripeKey);
    const email = session.customer_details?.email;
    const name = session.customer_details?.name || '';
    const purchaseDate = new Date(session.created * 1000).toISOString().split('T')[0];

    if (!email) {
      return htmlResponse('<div class="msg err">No buyer email found on this Stripe session.</div>');
    }

    // Clear the idempotency key so the Worker doesn't skip this as already delivered
    await env.PROCESSED_SESSIONS.delete(sessionId);

    const job = {
      sessionId,
      email,
      name,
      purchaseDate,
      siteUrl: new URL(request.url).origin,
      redeliver: true,
      ...(overrideEmail && { overrideEmail }),
    };
    await env.WATERMARK_QUEUE.send(job);

    const deliveryTarget = overrideEmail || email;
    return htmlResponse(`<div class="msg ok">
      <strong>Re-delivery queued.</strong><br>
      A watermarked PDF and 30-day download link will be sent to
      <strong>${escapeHtml(deliveryTarget)}</strong> within ~60 seconds.
    </div>`);
  } catch (err) {
    console.error('Re-delivery error:', err);
    return htmlResponse(`<div class="msg err"><strong>Error:</strong> ${escapeHtml(err.message)}</div>`);
  }
}
