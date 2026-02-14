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
- **Hosting**: GitHub Pages (Project Site mode)

## Deployment

This site is configured for GitHub Pages project site mode with `baseurl: "/website"`.

To deploy:
1. Push to GitHub repository
2. Enable GitHub Pages in repository settings
3. Select source: `main` branch, root directory
4. Site will be available at `https://username.github.io/website/`

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
