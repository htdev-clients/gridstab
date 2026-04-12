// Resolves when the feed has finished loading (success or failure),
// so other scripts can await stable layout before computing scroll positions.
window.__substackFeedReady = new Promise(resolve => {
  window.__resolveSubstackFeed = resolve;
});

// Fetch and display Substack RSS feed
async function loadSubstackFeed() {
  const section = document.querySelector('#substack[data-substack-url]');
  const substackBaseUrl = section ? section.getAttribute('data-substack-url') : 'https://gilleschaspiere.substack.com';
  const RSS_URL = substackBaseUrl.replace(/\/$/, '') + '/feed';
  const feedContainer = document.getElementById('substack-feed');
  const loadingPlaceholder = document.getElementById('loading-placeholder');
  const errorMessage = document.getElementById('error-message');

  try {
    // Use RSS2JSON API (free CORS proxy for RSS feeds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(RSS_URL)}`, { signal: controller.signal });
    clearTimeout(timeoutId);
    const data = await response.json();

    if (data.status !== 'ok') throw new Error('Failed to fetch RSS feed');

    // Hide loading, show feed
    loadingPlaceholder.classList.add('hidden');

    // Limit to 4 most recent posts (with images they take more space)
    const posts = data.items.slice(0, 4);

    // Generate HTML for each post (Substack-style design)
    feedContainer.innerHTML = posts.map(post => {
      const date = new Date(post.pubDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      // Extract plain text excerpt (remove HTML tags)
      const excerpt = post.description
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      // Get thumbnail image (use enclosure as fallback, but filter out profile pics)
      let thumbnail = post.thumbnail || '';

      // If no thumbnail, try enclosure link, but exclude profile pictures
      if (!thumbnail && post.enclosure?.link) {
        const enclosureLink = post.enclosure.link;
        // Exclude if it's the profile picture (608x608 or 256x256 versions)
        if (!enclosureLink.includes('608x608.png') && !enclosureLink.includes('w_256')) {
          thumbnail = enclosureLink;
        }
      }

      return `
        <article class="substack-post bg-white rounded-lg overflow-hidden shadow-md hover:shadow-xl transition-all duration-300">
          <a href="${post.link}" target="_blank" rel="noopener noreferrer" class="block">
            <div class="flex flex-col md:flex-row">
              <!-- Content on the left -->
              <div class="p-8 flex-1">
                <div class="post-meta flex items-center gap-3 mb-4">
                  <span class="text-sm text-gray-500">${date}</span>
                  <span class="text-sm text-gray-400">•</span>
                  <span class="text-sm text-gray-500">Dr. Gilles Chaspierre</span>
                </div>
                <h3 class="text-2xl font-bold mb-3 text-gray-900 hover:text-primary transition-colors leading-tight">
                  ${post.title}
                </h3>
                <p class="text-gray-600 mb-4 leading-relaxed">
                  ${excerpt}
                </p>
                <div class="flex items-center text-primary font-semibold hover:underline">
                  Read full article
                  <svg class="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </div>
              </div>

              <!-- Image on the right (or blank space to keep layout consistent) -->
              <div class="post-image-container relative h-52 md:h-auto md:w-80 flex-shrink-0 overflow-hidden">
                ${thumbnail ? `
                  <img src="${thumbnail}"
                       alt="${post.title}"
                       class="absolute inset-0 w-full h-full object-cover object-left-top hover:opacity-95 transition-opacity"
                       loading="lazy">
                ` : ``}
              </div>
            </div>
          </a>
        </article>
      `;
    }).join('');

  } catch (error) {
    console.error('Error loading Substack feed:', error);
    loadingPlaceholder.classList.add('hidden');
    errorMessage.classList.remove('hidden');
  } finally {
    window.__resolveSubstackFeed();
  }
}

// Load feed when page loads
document.addEventListener('DOMContentLoaded', loadSubstackFeed);
