import type { Config } from 'tailwindcss';

/**
 * Airwave runs one design system under two lighting conditions:
 *   data-theme="dark"  -> "Nightwatch"  petrol black, oxidized brass signal
 *   data-theme="light" -> "Daylight"    cool porcelain, bronze signal
 *
 * Every colour is stored as a space-separated RGB triplet in globals.css so
 * Tailwind's alpha modifiers (bg-signal/20) keep working across both themes.
 */
const config: Config = {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        base: 'rgb(var(--surface-0) / <alpha-value>)',
        panel: 'rgb(var(--surface-1) / <alpha-value>)',
        raised: 'rgb(var(--surface-2) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        dim: 'rgb(var(--ink-dim) / <alpha-value>)',
        faint: 'rgb(var(--ink-faint) / <alpha-value>)',
        signal: 'rgb(var(--signal) / <alpha-value>)',
        'signal-deep': 'rgb(var(--signal-deep) / <alpha-value>)',
        'on-signal': 'rgb(var(--on-signal) / <alpha-value>)',
        carrier: 'rgb(var(--carrier) / <alpha-value>)',
        alert: 'rgb(var(--alert) / <alpha-value>)',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Arial Narrow', 'sans-serif'],
        sans: ['var(--font-body)', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      letterSpacing: {
        label: '0.14em',
        wordmark: '0.22em',
      },
      borderRadius: {
        DEFAULT: '3px',
        sm: '2px',
        md: '4px',
        lg: '6px',
        xl: '10px',
      },
      boxShadow: {
        // A key you can feel: solid bottom edge, no soft blur halo.
        key: '0 6px 0 0 rgb(var(--key-edge)), 0 12px 20px -8px rgb(0 0 0 / 0.55)',
        'key-down': '0 1px 0 0 rgb(var(--key-edge)), 0 4px 10px -8px rgb(0 0 0 / 0.5)',
        panel: '0 1px 0 0 rgb(var(--line) / 0.8)',
        sheet: '0 -18px 40px -12px rgb(0 0 0 / 0.45)',
      },
      keyframes: {
        squelch: {
          '0%, 100%': { opacity: '0.28' },
          '50%': { opacity: '0.6' },
        },
        lamp: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
        rise: {
          from: { transform: 'translateY(12px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        slideUp: {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        fade: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
      animation: {
        squelch: 'squelch 3.2s ease-in-out infinite',
        lamp: 'lamp 1.6s ease-in-out infinite',
        rise: 'rise 0.28s cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-up': 'slideUp 0.26s cubic-bezier(0.16, 1, 0.3, 1) both',
        fade: 'fade 0.2s ease-out both',
      },
      transitionTimingFunction: {
        key: 'cubic-bezier(0.2, 0.9, 0.3, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
