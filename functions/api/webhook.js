/**
 * POST /api/webhook
 * Receives Stripe events. On successful payment, enqueues a watermark job.
 *
 * The queue send is awaited (not fire-and-forget) so that a failure returns
 * a 5xx to Stripe, which then retries with backoff. Without this, a silent
 * queue.send failure would drop the job and the buyer would never get their
 * book — Stripe would have already received 200 OK and would not retry.
 */
export async function onRequestPost({ request, env }) {
  const payload = await request.text();
  const signature = request.headers.get('stripe-signature');

  const valid = await verifyStripeSignature(payload, signature, env.STRIPE_WEBHOOK_SECRET);
  if (!valid) {
    return new Response('Invalid signature', { status: 401 });
  }

  const event = JSON.parse(payload);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    // Only process if payment was actually collected (not free / pending)
    if (session.payment_status === 'paid') {
      const job = {
        sessionId: session.id,
        email: session.customer_details?.email,
        name: session.customer_details?.name || '',
        purchaseDate: new Date().toISOString().split('T')[0],
      };

      try {
        await env.WATERMARK_QUEUE.send(job);
      } catch (err) {
        console.error(`Failed to enqueue watermark job for session ${session.id}:`, err);
        // Surface the failure so Stripe retries the webhook
        return new Response('Failed to enqueue delivery', { status: 500 });
      }
    }
  }

  return new Response('OK', { status: 200 });
}

/**
 * Verifies a Stripe webhook signature using the Web Crypto API.
 * Implements the standard Stripe signature scheme (HMAC-SHA256).
 */
async function verifyStripeSignature(payload, signature, secret) {
  if (!signature || !secret) return false;

  // Parse the signature header: "t=timestamp,v1=sig1,v1=sig2,..."
  const parts = {};
  const sigs = [];
  for (const part of signature.split(',')) {
    const [key, value] = part.split('=');
    if (key === 'v1') {
      sigs.push(value);
    } else {
      parts[key] = value;
    }
  }

  const timestamp = parts.t;
  if (!timestamp || sigs.length === 0) return false;

  // Reject events older than 5 minutes to prevent replay attacks
  const tolerance = 300; // seconds
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > tolerance) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
  const computedSig = Array.from(new Uint8Array(sigBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return sigs.some(s => s === computedSig);
}
