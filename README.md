# GridStab.com

Professional website for Gilles Chaspierre - Expert in power systems dynamics, stability, and control.

## About

This is a Jekyll-based static site designed for deployment on GitHub Pages. The site showcases:
- Expertise in grid stability and power-electronic systems
- Consulting services for power system dynamics
- Integration with GridStab News (Substack newsletter)

## Local Development

1. Install dependencies:
   ```bash
   bundle install
   ```

2. Run the development server:
   ```bash
   bundle exec jekyll serve
   ```

3. Visit the site at: `http://localhost:4000/website/`

## Tech Stack

- **Framework**: Jekyll 4.3
- **Styling**: Tailwind CSS (via CDN)
- **Icons**: Lucide Icons
- **Hosting**: Cloudflare Pages

## Deployment

Hosted on Cloudflare Pages. Build settings (configured in the Cloudflare dashboard):

- **Build command**: `bundle exec jekyll build`
- **Build output directory**: `_site`
- **Environment variable**: `JEKYLL_ENV=production`

No `wrangler.toml` required. Push to `main` branch to trigger a deployment.

## Structure

```
├── _config.yml           # Jekyll configuration
├── _layouts/             # Page layouts
├── _includes/            # Reusable components
├── _data/                # Data files (services, subscriptions, navigation)
├── assets/               # CSS, JS, images
├── index.html            # Homepage
└── cv.html              # CV page
```

## License

Copyright © 2026 by Gilles Chaspierre. All rights reserved.
