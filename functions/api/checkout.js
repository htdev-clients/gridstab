/**
 * GET /api/checkout
 * Creates a Stripe Checkout session and redirects the user to the Stripe-hosted payment page.
 */
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const origin = url.origin;

  const body = new URLSearchParams({
    mode: 'payment',
    'line_items[0][price]': env.STRIPE_PRICE_ID,
    'line_items[0][quantity]': '1',
    'billing_address_collection': 'required',
    'automatic_tax[enabled]': 'true',
    success_url: `${origin}/book/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/#book`,
  });

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Stripe session creation failed:', err);
    return new Response('Unable to start checkout. Please try again.', { status: 502 });
  }

  const session = await res.json();
  return Response.redirect(session.url, 303);
}
