// GridStab Main JavaScript

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide icons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  // Header Scroll Behavior
  const header = document.getElementById('main-header');
  const hasHero = document.querySelector('.min-h-screen') !== null;

  const setHeaderSolid = () => {
    if (!header) return;
    header.classList.add('bg-white', 'shadow-md');
    header.classList.remove('bg-transparent');
    header.querySelectorAll('a:not(.bg-gridstab-orange)').forEach(link => {
      link.classList.remove('text-white');
      link.classList.add('text-gray-800');
    });
    const logo = header.querySelector('.text-2xl');
    if (logo) { logo.classList.remove('text-white'); logo.classList.add('text-gray-800'); }
    const mobileToggle = header.querySelector('#mobile-menu-toggle');
    if (mobileToggle) { mobileToggle.classList.remove('text-white'); mobileToggle.classList.add('text-gray-800'); }
  };

  const setHeaderTransparent = () => {
    if (!header) return;
    header.classList.add('bg-transparent');
    header.classList.remove('bg-white', 'shadow-md');
    header.querySelectorAll('a:not(.bg-gridstab-orange)').forEach(link => {
      link.classList.add('text-white');
      link.classList.remove('text-gray-800');
    });
    const logo = header.querySelector('.text-2xl');
    if (logo) { logo.classList.add('text-white'); logo.classList.remove('text-gray-800'); }
    const mobileToggle = header.querySelector('#mobile-menu-toggle');
    if (mobileToggle) { mobileToggle.classList.add('text-white'); mobileToggle.classList.remove('text-gray-800'); }
  };

  // On pages without a hero, always solid
  if (header && !hasHero) {
    setHeaderSolid();
  }

  if (header && hasHero) {
    // Set correct state on initial load (e.g. when navigating to /#about)
    if (window.scrollY > 50) {
      setHeaderSolid();
    }

    window.addEventListener('scroll', () => {
      const mobileMenuOpen = document.getElementById('mobile-menu') &&
                             !document.getElementById('mobile-menu').classList.contains('hidden');
      if (mobileMenuOpen) return; // keep solid while menu is open
      if (window.scrollY > 50) {
        setHeaderSolid();
      } else {
        setHeaderTransparent();
      }
    });
  }

  // Smooth Scroll for Anchor Links
  // Handles both bare "#hash" and "/baseurl/#hash" same-page links
  document.querySelectorAll('a[href*="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      const hashIndex = href.indexOf('#');
      if (hashIndex === -1) return;

      const fragment = href.slice(hashIndex);
      if (fragment === '#') return;

      // Check if this is a same-page link
      const isBareFragment = href.startsWith('#');
      const isSamePage = !isBareFragment && (() => {
        try {
          const url = new URL(href, window.location.href);
          const normalize = p => p.replace(/\/$/, '');
          return url.origin === window.location.origin &&
                 normalize(url.pathname) === normalize(window.location.pathname);
        } catch(err) { return false; }
      })();

      if (!isBareFragment && !isSamePage) return;

      const target = document.querySelector(fragment);
      if (target) {
        e.preventDefault();

        // Close mobile menu if open
        const mobileMenu = document.getElementById('mobile-menu');
        if (mobileMenu && !mobileMenu.classList.contains('hidden')) {
          mobileMenu.classList.add('hidden');
        }

        // Scroll to target
        const headerHeight = header ? header.offsetHeight : 0;
        const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - headerHeight;

        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      }
    });
  });

  // Mobile Menu Toggle
  const menuToggle = document.getElementById('mobile-menu-toggle');
  const mobileMenu = document.getElementById('mobile-menu');

  if (menuToggle && mobileMenu) {
    const setToggleIcon = (iconName) => {
      const icon = menuToggle.querySelector('[data-lucide]');
      if (icon && typeof lucide !== 'undefined') {
        const newIcon = document.createElement('i');
        newIcon.setAttribute('data-lucide', iconName);
        newIcon.className = 'w-6 h-6 pointer-events-none';
        icon.replaceWith(newIcon);
        lucide.createIcons();
      }
    };

    const closeMenu = () => {
      mobileMenu.classList.add('hidden');
      setToggleIcon('menu');
      if (hasHero && window.scrollY <= 50) {
        setHeaderTransparent();
      }
    };

    menuToggle.addEventListener('click', () => {
      mobileMenu.classList.toggle('hidden');
      const isOpen = !mobileMenu.classList.contains('hidden');
      setToggleIcon(isOpen ? 'x' : 'menu');
      if (isOpen) {
        setHeaderSolid();
      } else if (hasHero && window.scrollY <= 50) {
        setHeaderTransparent();
      }
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!mobileMenu.classList.contains('hidden') &&
          !mobileMenu.contains(e.target) &&
          !menuToggle.contains(e.target)) {
        closeMenu();
      }
    });
  }

  // Add fade-in animation to elements on scroll (optional enhancement)
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-fade-in');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  // Observe service cards
  document.querySelectorAll('.service-card').forEach(card => {
    observer.observe(card);
  });

  // External link handler (add icon if not present)
  document.querySelectorAll('a[target="_blank"]').forEach(link => {
    if (!link.querySelector('[data-lucide="external-link"]')) {
      // Icon already added in HTML, just ensure they're rendered
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    }
  });

  // Log initialization
  console.log('GridStab website initialized successfully');
});
