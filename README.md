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
