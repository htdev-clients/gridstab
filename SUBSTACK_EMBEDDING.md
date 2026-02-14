# Substack Content Embedding Guide

There are **two ways** to display your Substack articles on GridStab.com:

## Option 1: Manual Curation (Current Approach) ✅

**Pros:**
- Full design control (matches your site's style)
- Fast page load (no external dependencies)
- Choose exactly which articles to highlight
- Works offline/if Substack is down

**Cons:**
- Requires manual updates when you publish new articles
- Need to download cover images separately

**How it works:**
1. Edit `_data/featured_articles.yml`
2. Add article title, excerpt, URL, date, and image
3. Commit and push to GitHub

**Current implementation:** [_data/featured_articles.yml](_data/featured_articles.yml)

---

## Option 2: Substack Embed Widget (Automatic)

**Pros:**
- Automatically updates when you publish new articles
- No manual work needed
- Uses real Substack cover images

**Cons:**
- Less design control (Substack's iframe styling)
- Slightly slower page load (external iframe)
- Depends on Substack's availability

### How to Implement Substack Embed:

#### Step 1: Get Your Embed Code

Visit: https://gilleschaspiere.substack.com/embed

Or manually create:
```html
<iframe
  src="https://gilleschaspiere.substack.com/embed"
  width="100%"
  height="320"
  style="border:1px solid #EEE; background:white;"
  frameborder="0"
  scrolling="no">
</iframe>
```

#### Step 2: Update `_includes/insights.html`

Replace the current article loop with:

```html
<section id="insights" class="py-20 bg-white">
  <div class="container mx-auto px-6">
    <!-- Section Header -->
    <div class="text-center mb-16">
      <h2 class="text-4xl md:text-5xl font-bold text-gridstab-dark mb-4">
        Latest from GridStab News
      </h2>
      <p class="text-xl text-gray-600 max-w-3xl mx-auto">
        Demystifying power system dynamics and stability
      </p>
    </div>

    <!-- Substack Embed Widget -->
    <div class="max-w-4xl mx-auto mb-16">
      <iframe
        src="https://gilleschaspiere.substack.com/embed"
        width="100%"
        height="600"
        style="border:1px solid #EEE; background:white; border-radius: 8px;"
        frameborder="0"
        scrolling="no">
      </iframe>
    </div>

    <!-- View All Articles CTA -->
    <div class="text-center">
      <a href="{{ site.substack_url }}"
         target="_blank"
         rel="noopener noreferrer"
         class="inline-flex items-center px-8 py-4 bg-gridstab-orange text-white rounded-lg hover:bg-opacity-90 transition-all font-semibold text-lg shadow-lg hover:shadow-xl">
        View All Articles on Substack
        <i data-lucide="external-link" class="w-5 h-5 ml-2"></i>
      </a>
    </div>
  </div>
</section>
```

---

## Option 3: Hybrid Approach (Best of Both)

Combine both methods:
- Show 1-2 **manually curated** featured articles (for design control)
- Below that, add the **Substack embed widget** for recent posts

This gives you:
- Design control for top highlights
- Automatic updates for additional content

---

## Recommendation

**For now:** Stick with **Option 1** (manual curation)
- You have full design control
- Matches your site's beautiful aesthetic
- Just update the YAML file when you publish

**In the future:** Consider adding the embed widget below the curated section for automatic updates

---

## Getting Real Cover Images

To use actual Substack cover images instead of placeholders:

### Method 1: Download from Substack
1. Visit your article on Substack
2. Right-click cover image → "Save Image As"
3. Save to `assets/images/` folder
4. Update `image:` field in `featured_articles.yml`

### Method 2: Use Substack CDN URLs (not recommended)
```yaml
image: "https://substackcdn.com/image/fetch/.../your-image.png"
```
*Note: External URLs may break if Substack changes CDN*

---

## Questions?

Current setup uses **Option 1** with your real articles from Substack. Cover images are currently using your local photos (windturbines.jpg, europenight.jpg, solarpanels.jpg) as placeholders.
