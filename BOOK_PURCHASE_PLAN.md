# Book Purchase Feature — Implementation Plan

## Overview

Sell Gilles' PDF book via the GridStab website. Users pay via Stripe, receive a personalized watermarked PDF as an email attachment. Delivery is one-time — buyers are instructed to save the file.

**PDF:** 6.7MB, 94 pages  
**Payment:** Stripe Checkout  
**Email:** Resend (Gilles' own account for production)  
**Storage:** Cloudflare R2 (original PDF only)  
**Serverless:** Cloudflare Pages Functions + Cloudflare Queue

---

## Infrastructure

| Component | Purpose |
|---|---|
| Cloudflare Pages Functions | Serverless endpoints, co-located in this repo under `functions/` |
| Cloudflare R2 | Stores the original PDF only (`book/original.pdf`) |
| Cloudflare Queue | Async PDF watermarking job (avoids CPU time limits) |
| Stripe Checkout | Hosted payment page — we never handle card data |
| Resend | Sends the watermarked PDF as an email attachment after payment |

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
    → Static page: "Payment successful! Your book will arrive by email shortly."
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
   - Sends watermarked PDF as attachment via Resend
   - Discards watermarked PDF — not stored anywhere
```

**Delivery:** One-time email attachment. The confirmation email instructs buyers to save the file to their device or cloud storage.  
**Lost file:** Buyer contacts Gilles at contact@gridstab.com. Gilles downloads the original from R2, manually watermarks if needed, or handles at his discretion.

---

## Endpoints (Pages Functions)

| File | Endpoint | Method | Role |
|---|---|---|---|
| `functions/api/checkout.js` | `/api/checkout` | GET | Creates Stripe session, redirects |
| `functions/api/webhook.js` | `/api/webhook` | POST | Verifies Stripe event, enqueues job |

---

## Queue Consumer

| File | Purpose |
|---|---|
| `workers/watermark/index.js` | Watermarks PDF, emails as attachment, discards watermarked copy |

Configured as **Workers Unbound** in Cloudflare dashboard for higher CPU limits.

---

## Jekyll Pages to Create

| Page | URL | Purpose |
|---|---|---|
| `book/success.html` | `/book/success` | Post-payment confirmation page |

---

## R2 Bucket Structure

```
book/original.pdf    ← master copy (uploaded manually, never changes)
```

No per-buyer storage. R2 usage stays flat regardless of sales volume.

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
