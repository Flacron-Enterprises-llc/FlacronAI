/** @type {import('tailwindcss').Config} */
import colors from 'tailwindcss/colors';

// ─────────────────────────────────────────────────────────────────────────────
// FlacronAI brand design tokens — SINGLE SOURCE OF TRUTH (T-1.2, reconciled T-7.P2)
// Colors are sampled from the official logo files (frontend/public/logo-*.png):
//   brand orange #FD4403 · brand navy #002A64
// Reconfirmed 2026-08-13 when the client compared a generated report against
// their own reference sample.pdf and asked to pixel-match these exact colors
// (see properPdfGenerator.js) — this is the authoritative palette, not the
// external product-spec document's #FF5A1F/#171C2B (no client approval found
// for that palette; PHASES.md Phase 2).
// Raw-CSS consumers (scrollbar, checkbox accent) mirror these via CSS variables
// in src/index.css :root — keep both in sync if a brand color ever changes.
//
// Semantic status tokens (success/warning/error/info/muted) formalize the
// colors already used consistently across the app (Tailwind's own green/amber/
// red/blue/gray families) as named references — existing per-component shade
// choices (e.g. bg-green-500, text-red-400) are left as-is; these tokens exist
// for new code and centralized reference, not to force a mass rename.
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
        muted: colors.gray[600], // secondary/supporting text — formalizes the already-dominant text-gray-600 convention
        success: { DEFAULT: colors.green[600], soft: colors.green[50] },
        warning: { DEFAULT: colors.amber[600], soft: colors.amber[50] },
        error: { DEFAULT: colors.red[600], soft: colors.red[50] },
        info: { DEFAULT: colors.blue[600], soft: colors.blue[50] },
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
