// docs/specs/00-foundation.md §6.13 — security headers and Next config.
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''; // e.g. https://abc.supabase.co (empty until .env.local exists)
const supabaseWs = supabase.replace(/^https/, 'wss');
const isDev = process.env.NODE_ENV !== 'production';
const src = (...parts) => parts.filter(Boolean).join(' ');

const csp = [
  "default-src 'self'",
  src("script-src 'self' 'unsafe-inline'", isDev && "'unsafe-eval'"), // Next 14 inline bootstrap; nonce-based CSP is a Stage 7 item
  "style-src 'self' 'unsafe-inline'",
  src("img-src 'self' data: blob:", supabase),
  "font-src 'self'",
  src("connect-src 'self'", supabase, supabaseWs),
  "worker-src 'self' blob:",
  src("frame-src 'self' blob:", supabase), // "Download PDF" opens signed URLs; react-pdf does not use frames
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  isDev ? '' : 'upgrade-insecure-requests',
]
  .filter(Boolean)
  .join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: { dirs: ['src', 'evals'] }, // `next lint` (CI lint step) and `next build`; evals/ is outside Next's defaults
  experimental: { serverComponentsExternalPackages: ['pdfjs-dist'] }, // server-side text extraction (03 §6.3)
  webpack: (config) => {
    config.resolve.alias.canvas = false; // react-pdf: no node-canvas
    return config;
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
