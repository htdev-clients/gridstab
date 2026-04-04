# Book Purchase Feature — Implementation Plan

## Overview

Sell Gilles' PDF book via the GridStab website. Users pay via Stripe, receive a personalized watermarked PDF by email. The PDF is protected — not accessible without a valid purchase token.

**PDF:** 6.7MB, 94 pages  
**Payment:** Stripe Checkout  
**Email:** Resend (Gilles' own account for production)  
**Storage:** Cloudflare R2  
**Serverless:** Cloudflare Pages Functions + Cloudflare Queue

---

## Infrastructure

| Component | Purpose |
|---|---|
| Cloudflare Pages Functions | Serverless endpoints, co-located in this repo under `functions/` |
| Cloudflare R2 | Stores original PDF + one watermarked copy per purchase |
| Cloudflare KV | Stores purchase records and download tokens |
| Cloudflare Queue | Async PDF watermarking job (avoids CPU time limits) |
| Stripe Checkout | Hosted payment page — we never handle card data |
| Resend | Sends the download link email after payment |

---

## User Flow

```
1. User clicks "Buy" on the site
         ↓
2. GET /api/checkout
   → Creates Stripe Checkout session
   → Redirects user to Stripe-hosted payment page
         ↓
3. User pays on Stripe
         ↓
4a. Stripe redirects user to /book/success
    → Static page: "Payment successful! Your download link will arrive by email shortly."
4b. Stripe fires webhook to POST /api/webhook  [runs in parallel]
         ↓
5. Webhook handler:
   - Verifies Stripe signature
   - Responds 200 immediately
   - Enqueues watermark job { email, name, sessionId } to Cloudflare Queue
         ↓
6. Queue consumer (Workers Unbound — no CPU limit concern):
   - Loads original PDF from R2 (book/original.pdf)
   - Watermarks ALL pages with buyer email + purchase date using pdf-lib
   - Stores watermarked PDF in R2 as book/purchases/{sessionId}.pdf
   - Generates UUID download token
   - Stores token in KV: { email, name, sessionId, r2Key, createdAt, downloadCount: 0 }
   - Stores reverse lookup in KV: email → { latestToken }
   - Sends email via Resend with download link
         ↓
7. User clicks link in email → GET /api/download?token={uuid}
   → Validates token exists in KV
   → Increments downloadCount
   → Streams watermarked PDF from R2
```

**Re-access:** Token never expires. User simply clicks the link in their original email again.  
**Lost email:** User contacts Gilles at contact@gridstab.com. Gilles retrieves the watermarked PDF from R2 via the Cloudflare dashboard.

---

## Endpoints (Pages Functions)

| File | Endpoint | Method | Role |
|---|---|---|---|
| `functions/api/checkout.js` | `/api/checkout` | GET | Creates Stripe session, redirects |
| `functions/api/webhook.js` | `/api/webhook` | POST | Verifies Stripe event, enqueues job |
| `functions/api/download.js` | `/api/download` | GET | Validates token, streams PDF |

---

## Queue Consumer

| File | Purpose |
|---|---|
| `workers/watermark/index.js` | Watermarks PDF, stores in R2, writes KV, sends email |

Configured as **Workers Unbound** in Cloudflare dashboard for higher CPU limits.

---

## Jekyll Pages to Create

| Page | URL | Purpose |
|---|---|---|
| `book/success.html` | `/book/success` | Post-payment confirmation page |

---

## R2 Bucket Structure

```
book/original.pdf                        ← master copy (uploaded manually)
book/purchases/{stripeSessionId}.pdf     ← watermarked, one per buyer
```

## KV Namespace Structure

```
token:{uuid}   → { email, name, sessionId, r2Key, createdAt, downloadCount }
email:{email}  → { latestToken: uuid }
```

---

## Environment Variables

```
# Stripe
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_ID

# Resend
RESEND_API_KEY
RESEND_FROM_EMAIL    # e.g. books@gridstab.com

# CF Bindings (set in Cloudflare Pages dashboard, not as env vars)
BOOK_BUCKET          # R2 bucket binding
PURCHASES_KV         # KV namespace binding
WATERMARK_QUEUE      # Queue binding
```

**Preview deployments:** use Stripe test keys  
**Production:** use Stripe live keys  
Set separately in the Cloudflare Pages dashboard under Settings → Environment variables.

---

## PDF Watermarking

- Library: **pdf-lib** (pure JavaScript, runs in Workers)
- Applied to: **all 94 pages**
- Content: subtle text on each page — *"Licensed to {email} — {date}"*
- Purpose: traceability deterrent if the file is shared publicly

---

## Remaining steps

See [todo.md](todo.md) for the full remaining task list.
