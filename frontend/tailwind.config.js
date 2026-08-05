/** @type {import('tailwindcss').Config} */

// ─────────────────────────────────────────────────────────────────────────────
// FlacronAI brand design tokens — SINGLE SOURCE OF TRUTH (T-1.2)
// Colors are sampled from the official logo files (frontend/public/logo-*.png):
//   brand orange #FD4403 · brand navy #002A64
// Raw-CSS consumers (scrollbar, checkbox accent) mirror these via CSS variables
// in src/index.css :root — keep both in sync if a brand color ever changes.
// ─────────────────────────────────────────────────────────────────────────────

const brandOrange = {
  50: '#FFF3EE',
  100: '#FFE5DA',
  200: '#FFC9B0',
  300: '#FEA57F',
  400: '#FE7A47',
  500: '#FD4403', // logo orange
  600: '#E23C02',
  700: '#BC3202',
  800: '#962802',
  900: '#7A2102',
  950: '#421101',
};

const brandNavy = {
  50: '#EEF3FA',
  100: '#D9E4F2',
  200: '#B3C9E5',
  300: '#86A8D4',
  400: '#5585C2',
  500: '#2F63A8',
  600: '#174B8C',
  700: '#073A75',
  800: '#002A64', // logo navy
  900: '#002250',
  950: '#001633',
};

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: brandOrange,
        navy: brandNavy,
        // Semantic aliases — components should consume these, not raw hex
        primary: {
          DEFAULT: brandOrange[500],
          hover: brandOrange[600],
          soft: brandOrange[50],
        },
        ink: brandNavy[900], // headings / high-emphasis text
        bg: '#ffffff',
        surface: '#f8f8f8',
        border: '#e5e7eb',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'], // body
        display: ['Space Grotesk', 'Inter', 'system-ui', 'sans-serif'], // headings
      },
      borderRadius: {
        btn: '0.75rem', // buttons / inputs
        card: '1rem', // cards / panels
      },
      boxShadow: {
        btn: '0 10px 15px -3px rgb(253 68 3 / 0.20), 0 4px 6px -4px rgb(253 68 3 / 0.20)',
        'btn-hover': '0 10px 15px -3px rgb(253 68 3 / 0.40), 0 4px 6px -4px rgb(253 68 3 / 0.40)',
        card: '0 1px 3px 0 rgb(0 42 100 / 0.08), 0 1px 2px -1px rgb(0 42 100 / 0.08)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        slideUp: { '0%': { transform: 'translateY(20px)', opacity: 0 }, '100%': { transform: 'translateY(0)', opacity: 1 } },
        float: { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-10px)' } },
      },
      backdropBlur: { xs: '2px' },
    },
  },
  plugins: [],
};
