/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(${name}) / <alpha-value>)`;

module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: v('--c-text'),
          soft: v('--c-text-soft'),
          mute: v('--c-text-mute'),
          faint: v('--c-text-faint'),
        },
        paper: {
          DEFAULT: v('--c-surface'),
          well: v('--c-bg'),
          sunk: v('--c-surface-2'),
        },
        rule: {
          DEFAULT: v('--c-line'),
          strong: v('--c-line-strong'),
        },
        navy: {
          DEFAULT: v('--c-masthead'),
          deep: v('--c-masthead-deep'),
          line: v('--c-masthead-line'),
        },
        brick: {
          DEFAULT: v('--c-accent'),
          deep: v('--c-accent-deep'),
        },
        azure: {
          DEFAULT: v('--c-accent-2'),
        },
        win: v('--c-win'),
        loss: v('--c-loss'),
      },
      fontFamily: {
        display: ['var(--font-display)', 'Archivo', 'Helvetica Neue', 'Arial', 'sans-serif'],
        sans: ['var(--font-sans)', 'IBM Plex Sans', 'Segoe UI', 'Arial', 'sans-serif'],
      },
      fontSize: {
        micro: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.08em' }],
        tiny: ['0.75rem', { lineHeight: '1.05rem' }],
      },
      borderRadius: {
        none: '0',
        sm: '2px',
        DEFAULT: '3px',
        md: '4px',
      },
      maxWidth: {
        shell: '1180px',
      },
      backgroundImage: {
        brand: 'linear-gradient(90deg, #F49AC8 0%, #C79AE2 50%, #8FA9EE 100%)',
        'brand-soft': 'linear-gradient(135deg, rgb(244 154 200 / 0.16) 0%, rgb(143 169 238 / 0.16) 100%)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'slide-in': {
          from: { opacity: '0', transform: 'translateX(-4px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.32s cubic-bezier(0.22, 1, 0.36, 1) both',
        'slide-in': 'slide-in 0.24s ease-out both',
        'pulse-dot': 'pulse-dot 1.8s ease-in-out infinite',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};
