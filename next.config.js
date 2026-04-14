const { withSentryConfig } = require("@sentry/nextjs");

/** Binarios nativos de sharp (logos WebP → PNG en PDF). Debe coincidir con la plataforma de Vercel (linux x64). */
const sharpTraceGlobs = [
  "node_modules/sharp/**/*",
  "node_modules/@img/sharp-libvips-linux-x64/**/*",
  "node_modules/@img/sharp-linux-x64/**/*",
  "node_modules/@img/sharp-libvips-linuxmusl-x64/**/*",
  "node_modules/@img/sharp-linuxmusl-x64/**/*",
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  outputFileTracingIncludes: {
    '/api/cpq/quotes/\\[id\\]/export-pdf': ['./public/fonts/**/*'],
    '/api/cpq/quotes/\\[id\\]/send-email': ['./public/fonts/**/*'],
    '/api/cpq/quotes/\\[id\\]/send-portal': [
      './public/fonts/**/*',
      'node_modules/@sparticuz/chromium/bin/**/*',
      ...sharpTraceGlobs,
    ],
    '/api/cpq/quotes/\\[id\\]/send-portal/route': [
      'node_modules/@sparticuz/chromium/bin/**/*',
      './public/fonts/**/*',
      ...sharpTraceGlobs,
    ],
    '/api/crm/leads/\\[id\\]/approve-and-send/route': ['node_modules/@sparticuz/chromium/bin/**/*'],
    '/api/crm/leads/\\[id\\]/approve-and-send': ['node_modules/@sparticuz/chromium/bin/**/*'],
    '/api/portal/cliente/cotizaciones/\\[id\\]/pdf': ['./public/fonts/**/*'],
    // Chromium bin para generación de PDFs (Playwright + @sparticuz/chromium)
    '/api/pdf/generate-presentation/route': ['node_modules/@sparticuz/chromium/bin/**/*'],
    '/api/pdf/generate-presentation': ['node_modules/@sparticuz/chromium/bin/**/*'],
    '/api/pdf/generate-pricing-v2/route': ['node_modules/@sparticuz/chromium/bin/**/*'],
    '/api/pdf/generate-pricing-v2': ['node_modules/@sparticuz/chromium/bin/**/*'],
    '/api/ops/pauta-mensual/export-pdf/route': ['node_modules/@sparticuz/chromium/bin/**/*'],
    '/api/ops/guard-events/\\[id\\]/send-doc/route': ['node_modules/@sparticuz/chromium/bin/**/*'],
    '/api/ops/control-nocturno/\\[id\\]/route': ['node_modules/@sparticuz/chromium/bin/**/*'],
    '/api/ops/control-nocturno/\\[id\\]': ['node_modules/@sparticuz/chromium/bin/**/*'],
    '/api/ops/control-nocturno/\\[id\\]/test-email/route': ['node_modules/@sparticuz/chromium/bin/**/*'],
    // Turno close: genera PDF con Playwright + Chromium para adjuntar al email
    '/api/ops/rondas/monitoreo/turno/\\[id\\]/close/route': ['node_modules/@sparticuz/chromium/bin/**/*'],
    '/api/ops/rondas/monitoreo/turno/\\[id\\]/close': ['node_modules/@sparticuz/chromium/bin/**/*'],
    '/api/cpq/quotes/\\[id\\]/proposal-pdf/route': [
      'node_modules/@sparticuz/chromium/bin/**/*',
      './public/fonts/**/*',
      ...sharpTraceGlobs,
    ],
    '/api/cpq/quotes/\\[id\\]/proposal-pdf': [
      'node_modules/@sparticuz/chromium/bin/**/*',
      './public/fonts/**/*',
      ...sharpTraceGlobs,
    ],
    '/api/portal/cliente/cotizaciones/\\[id\\]/proposal-pdf/route': [
      'node_modules/@sparticuz/chromium/bin/**/*',
      './public/fonts/**/*',
      ...sharpTraceGlobs,
    ],
    '/api/portal/cliente/cotizaciones/\\[id\\]/proposal-pdf': [
      'node_modules/@sparticuz/chromium/bin/**/*',
      './public/fonts/**/*',
      ...sharpTraceGlobs,
    ],
    '/api/crm/leads/\\[id\\]/proposal-preview/route': ['./public/fonts/**/*', ...sharpTraceGlobs],
    '/api/crm/leads/\\[id\\]/proposal-preview': ['./public/fonts/**/*', ...sharpTraceGlobs],
    '/api/cpq/quotes/\\[id\\]/send-pdf-email/route': [
      'node_modules/@sparticuz/chromium/bin/**/*',
      './public/fonts/**/*',
      ...sharpTraceGlobs,
    ],
    '/api/cpq/quotes/\\[id\\]/send-pdf-email': [
      'node_modules/@sparticuz/chromium/bin/**/*',
      './public/fonts/**/*',
      ...sharpTraceGlobs,
    ],
    '/api/ai/help-chat/stream': ['./docs/**/*'],
    '/api/ai/help-chat': ['./docs/**/*'],
  },
  turbopack: {
    root: __dirname,
  },
  serverExternalPackages: [
    'sharp',
    '@sparticuz/chromium',
    'playwright-core',
    '@react-pdf/renderer',
    '@react-pdf/reconciler',
    '@react-pdf/layout',
    '@react-pdf/font',
    '@react-pdf/pdfkit',
    '@react-pdf/primitives',
    '@react-pdf/fns',
    '@react-pdf/render',
    '@react-pdf/stylesheet',
    '@react-pdf/textkit',
    '@react-pdf/image',
  ],
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 30,
    },
  },
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/:path*manifest.json',
        headers: [
          { key: 'Content-Type', value: 'application/manifest+json' },
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          { key: 'Content-Type', value: 'application/manifest+json' },
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        ],
      },
      {
        source: '/llms.txt',
        headers: [
          { key: 'Content-Type', value: 'text/plain; charset=utf-8' },
          { key: 'Cache-Control', value: 'public, max-age=86400, s-maxage=86400' },
          { key: 'X-Robots-Tag', value: 'noindex' },
        ],
      },
      {
        source: '/llms-full.txt',
        headers: [
          { key: 'Content-Type', value: 'text/plain; charset=utf-8' },
          { key: 'Cache-Control', value: 'public, max-age=86400, s-maxage=86400' },
          { key: 'X-Robots-Tag', value: 'noindex' },
        ],
      },
    ];
  },
};

const sentryOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  tunnelRoute: "/monitoring",
  silent: !process.env.CI,
};

const shouldEnableSentry =
  process.env.NODE_ENV === "production" &&
  (process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN);

module.exports = shouldEnableSentry
  ? withSentryConfig(nextConfig, sentryOptions)
  : nextConfig;
