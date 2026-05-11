# GridStab.com

Professional website for **Gilles Chaspierre** — expert in power systems dynamics, stability, and control. Live at [gridstab.com](https://gridstab.com).

## Overview

A clean, fast static site built to establish the client's online presence as a consultant and newsletter author in the power engineering space. The site consolidates his consulting services, credentials (CV), Substack newsletter feed, subscription plans, and book — all in a single-page layout with a separate CV page.

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Jekyll 4.3 |
| Styling | Tailwind CSS (CLI build + CDN fallback) |
| Icons | Lucide (local SVGs) |
| Fonts | Inter (self-hosted) |
| Hosting | Cloudflare Pages |

## Features

- **Single-page layout** — Hero, About, Services, Newsletter feed, Subscription plans, Book, Contact, all connected via smooth anchor navigation
- **Responsive design** — Mobile-first with a hamburger menu on small screens
- **Live Substack feed** — JavaScript fetches the client's latest articles via RSS-to-JSON API and renders them dynamically, with a graceful fallback on error
- **Responsive hero images** — `<picture>` element serving WebP/JPEG at 800w and 1200w breakpoints with `fetchpriority="high"` for fast LCP
- **Self-hosted fonts** — Inter served via `@font-face` from `assets/fonts/`, no Google Fonts CDN dependency
- **SEO** — `jekyll-seo-tag` for meta tags, Open Graph image, `jekyll-sitemap` for sitemap, `robots.txt`
- **Data-driven content** — Services, navigation, and subscription plans defined in YAML files under `_data/`, keeping templates clean
- **SVG icon system** — Lucide icons served as local `.svg` files and injected via Liquid includes, avoiding a CDN dependency
- **Book preview modal** — Clicking the cover or the Preview button opens a modal with the first 5 pages rendered as images (no PDF embed, so no browser download UI). Desktop: single-page view with side navigation arrows and keyboard support (arrows + Escape). Mobile: scrollable vertical stack of all pages.
- **Book purchase system** — End-to-end paid download flow: Stripe Checkout → webhook → async queue → per-buyer watermarked PDF stored in R2 → buyer receives an HMAC-signed download link valid for 30 days via Resend (chosen over attachment delivery to keep emails small and avoid corporate spam filters). Implemented as Cloudflare Pages Functions (`functions/api/`) plus a standalone Cloudflare Worker (`workers/watermark/`) that watermarks all 94 pages via `pdf-lib`, signs the download URL, and runs a daily cron to delete expired delivery PDFs from R2. Uses Cloudflare Queue for async processing, R2 for PDF storage, and KV for delivery idempotency.
