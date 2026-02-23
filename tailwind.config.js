/** @type {import('tailwindcss').Config} */
module.exports = {
  future: {
    hoverOnlyWhenSupported: true,
  },
  content: [
    './_includes/**/*.html',
    './_layouts/**/*.html',
    './*.html',
    './assets/js/**/*.js',
  ],
  theme: {
    extend: {
      colors: {
        'gridstab-orange': '#FF6719',
        'gridstab-dark': '#1a1a1a',
        'gridstab-blue': '#2563eb',
      },
      fontFamily: {
        'sans': ['Inter', 'system-ui', 'sans-serif'],
        'serif': ['Merriweather', 'Georgia', 'serif'],
      },
      backgroundImage: {
        'hero-gradient': 'linear-gradient(135deg, rgba(26,26,26,0.7), rgba(255,103,25,0.4))',
      },
    },
  },
  plugins: [],
}
