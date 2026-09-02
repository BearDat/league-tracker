/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#12161C',
          soft: '#39414F',
          mute: '#6B7583',
          faint: '#98A1AD',
        },
        paper: {
          DEFAULT: '#FFFFFF',
          well: '#F5F6F8',
          sunk: '#EAEDF1',
        },
        rule: {
          DEFAULT: '#DFE3E8',
          strong: '#C2C9D2',
        },
        navy: {
          DEFAULT: '#0C2340',
          deep: '#07182C',
          line: '#1D3557',
        },
        brick: {
          DEFAULT: '#C8102E',
          deep: '#9E0C24',
        },
        win: '#0F7A4F',
        loss: '#B22234',
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
      spacing: {
        rail: '19rem',
      },
    },
  },
  plugins: [],
};
