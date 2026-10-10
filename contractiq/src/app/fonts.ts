import localFont from 'next/font/local';

// Inter Display 4.1 (SIL Open Font License, see ./fonts/Inter-LICENSE.txt) — the only typeface (docs/design.md).
export const interDisplay = localFont({
  src: [
    { path: './fonts/InterDisplay-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/InterDisplay-Medium.woff2', weight: '500', style: 'normal' },
    { path: './fonts/InterDisplay-SemiBold.woff2', weight: '600', style: 'normal' },
    { path: './fonts/InterDisplay-Bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-inter-display',
  display: 'swap',
  fallback: ['system-ui', 'sans-serif'],
});
