// GridStab Main JavaScript

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide icons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  // Header Scroll Behavior
  const header = document.getElementById('main-header');
  const hasHero = document.querySelector('.min-h-screen') !== null;

  // On pages without a hero, start with solid header immediately
  if (header && !hasHero) {
    header.classList.add('bg-white', 'shadow-md');
    header.classList.remove('bg-transparent');
    const navLinks = header.querySelectorAll('a:not(.bg-gridstab-orange)');
    navLinks.forEach(link => {
      link.classList.remove('text-white');
      link.classList.add('text-gray-800');
    });
    const logo = header.querySelector('.text-2xl');
    if (logo) {
      logo.classList.remove('text-white');
      logo.classList.add('text-gray-800');
    }
    const mobileToggle = header.querySelector('#mobile-menu-toggle');
    if (mobileToggle) {
      mobileToggle.classList.remove('text-white');
      mobileToggle.classList.add('text-gray-800');
    }
  }

  if (header && hasHero) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 50) {
        header.classList.add('bg-white', 'shadow-md');
        header.classList.remove('bg-transparent');

        // Change text color on scroll
        const navLinks = header.querySelectorAll('a:not(.bg-gridstab-orange)');
        navLinks.forEach(link => {
          link.classList.remove('text-white');
          link.classList.add('text-gray-800');
        });

        // Change mobile toggle button color
        const mobileToggle = header.querySelector('#mobile-menu-toggle');
        if (mobileToggle) {
          mobileToggle.classList.remove('text-white');
          mobileToggle.classList.add('text-gray-800');
        }

        // Change logo color
        const logo = header.querySelector('.text-2xl');
        if (logo) {
          const logoText = logo.querySelectorAll('span');
          logoText.forEach((span, index) => {
            if (index === 0) {
              span.classList.remove('text-gridstab-orange');
              span.classList.add('text-gridstab-orange');
            }
          });
          logo.classList.remove('text-white');
          logo.classList.add('text-gray-800');
        }
      } else {
        header.classList.add('bg-transparent');
        header.classList.remove('bg-white', 'shadow-md');

        // Restore white text color
        const navLinks = header.querySelectorAll('a:not(.bg-gridstab-orange)');
        navLinks.forEach(link => {
          link.classList.add('text-white');
          link.classList.remove('text-gray-800');
        });

        // Restore mobile toggle button color
        const mobileToggle = header.querySelector('#mobile-menu-toggle');
        if (mobileToggle) {
          mobileToggle.classList.add('text-white');
          mobileToggle.classList.remove('text-gray-800');
        }

        // Restore logo color
        const logo = header.querySelector('.text-2xl');
        if (logo) {
          logo.classList.add('text-white');
          logo.classList.remove('text-gray-800');
        }
      }
    });
  }

  // Smooth Scroll for Anchor Links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const href = this.getAttribute('href');

      // Ignore if href is just "#"
      if (href === '#') return;

      const target = document.querySelector(href);
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
        newIcon.className = 'w-6 h-6';
        icon.replaceWith(newIcon);
        lucide.createIcons();
      }
    };

    menuToggle.addEventListener('click', () => {
      mobileMenu.classList.toggle('hidden');
      const isOpen = !mobileMenu.classList.contains('hidden');
      setToggleIcon(isOpen ? 'x' : 'menu');
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!mobileMenu.classList.contains('hidden') &&
          !mobileMenu.contains(e.target) &&
          !menuToggle.contains(e.target)) {
        mobileMenu.classList.add('hidden');
        setToggleIcon('menu');
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
