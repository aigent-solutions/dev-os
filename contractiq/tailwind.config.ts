import type { Config } from 'tailwindcss';

// Design-system tokens only (docs/specs/00-foundation.md §9.2).
// colors, spacing, borderRadius and fontSize REPLACE Tailwind's defaults, so
// off-system values don't exist as utilities. Values live in src/styles/tokens.css.
const v = (name: string) => `var(--${name})`;

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    screens: { sm: '640px', md: '768px', lg: '1024px', xl: '1280px' },
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      fg: {
        primary: v('fg-primary'),
        secondary: v('fg-secondary'),
        disabled: v('fg-disabled'),
        placeholder: v('fg-placeholder'),
        link: v('fg-link'),
        inverse: v('fg-inverse'),
      },
      surface: { DEFAULT: v('surface'), page: v('surface-page'), subtle: v('surface-subtle'), pressed: v('surface-pressed') },
      overlay: v('overlay'),
      border: { DEFAULT: v('border'), strong: v('border-strong'), control: v('border-control') },
      focus: v('focus-ring'),
      brand: { DEFAULT: v('brand'), hover: v('brand-hover'), pressed: v('brand-pressed'), subtle: v('brand-subtle') },
      success: { bg: v('success-bg'), border: v('success-border'), fg: v('success-fg'), solid: v('success-solid') },
      warning: { bg: v('warning-bg'), border: v('warning-border'), fg: v('warning-fg'), solid: v('warning-solid') },
      danger: { bg: v('danger-bg'), border: v('danger-border'), fg: v('danger-fg'), solid: v('danger-solid') },
      info: { bg: v('info-bg'), border: v('info-border'), fg: v('info-fg'), solid: v('info-solid') },
      accent: { bg: v('accent-bg'), border: v('accent-border'), fg: v('accent-fg'), solid: v('accent-solid') },
      highlight: { DEFAULT: v('highlight'), active: v('highlight-active') },
    },
    spacing: {
      0: '0px', px: '1px', 0.5: '2px', 1: '4px', 2: '8px', 3: '12px', 4: '16px', 5: '20px', 6: '24px', 8: '32px',
      10: '40px', 12: '48px', 16: '64px', 20: '80px', 24: '96px', 28: '112px', 32: '128px', 40: '160px',
      64: '256px', 80: '320px', 96: '384px',
    },
    borderRadius: { none: '0px', sm: '4px', md: '6px', lg: '8px', xl: '12px', full: '9999px' },
    fontFamily: { sans: ['var(--font-inter-display)', 'system-ui', 'sans-serif'] },
    fontSize: {
      h1: ['48px', { lineHeight: '56px', fontWeight: '700' }],
      h2: ['36px', { lineHeight: '44px', fontWeight: '700' }],
      h3: ['30px', { lineHeight: '38px', fontWeight: '600' }],
      h4: ['28px', { lineHeight: '36px', fontWeight: '600' }],
      h5: ['24px', { lineHeight: '32px', fontWeight: '500' }],
      'body-lg': ['16px', { lineHeight: '24px', fontWeight: '500' }],
      'body-sm': ['12px', { lineHeight: '18px', fontWeight: '400' }],
    },
    letterSpacing: { normal: '0' },
    boxShadow: { none: 'none' }, // flat depth: no shadows
    transitionDuration: { 100: '100ms', 150: '150ms', 200: '200ms', 250: '250ms', 300: '300ms' },
    transitionTimingFunction: { out: 'ease-out', in: 'ease-in', 'in-out': 'ease-in-out' },
    extend: {
      maxWidth: { prose: '72ch', auth: '400px' }, // auth: 01-auth.md §9 card width
      // Motion from docs/design.md / 00-foundation.md §9.5: enter ease-out, exit ease-in.
      // Radix keeps elements mounted until the exit animation ends. Disabled under reduced motion (tokens.css).
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'fade-out': { from: { opacity: '1' }, to: { opacity: '0' } },
        'scale-in': { from: { opacity: '0', transform: 'scale(0.98)' }, to: { opacity: '1', transform: 'scale(1)' } },
        'scale-out': { from: { opacity: '1', transform: 'scale(1)' }, to: { opacity: '0', transform: 'scale(0.98)' } },
        // Indeterminate progress bar (03 §9). Replaced by a static 40% bar under reduced motion.
        indeterminate: { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(250%)' } },
      },
      animation: {
        'overlay-in': 'fade-in 200ms ease-out',
        'overlay-out': 'fade-out 150ms ease-in',
        'modal-in': 'scale-in 200ms ease-out',
        'modal-out': 'scale-out 150ms ease-in',
        'pop-in': 'fade-in 150ms ease-out',
        'pop-out': 'fade-out 150ms ease-in',
        indeterminate: 'indeterminate 1500ms ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
