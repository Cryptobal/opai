const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  outputFileTracingIncludes: {
    '/api/cpq/quotes/\\[id\\]/export-pdf': ['./public/fonts/**/*'],
    '/api/cpq/quotes/\\[id\\]/send-email': ['./public/fonts/**/*'],
    '/api/cpq/quotes/\\[id\\]/send-portal': ['./public/fonts/**/*'],
    '/api/portal/cliente/cotizaciones/\\[id\\]/pdf': ['./public/fonts/**/*'],
    // Chromium bin para generación de PDFs (Playwright + @sparticuz/chromium)
    '/api/pdf/generate-presentation/route': ['node_modules/@sparticuz/chromium/bin/**/*'],
    '/api/pdf/generate-presentation': ['node_modules/@sparticuz/chromium/bin/**/*'],
    '/api/pdf/generate-pricing-v2/route': ['node_modules/@sparticuz/chromium/bin/**/*'],
    '/api/pdf/generate-pricing-v2': ['node_modules/@sparticuz/chromium/bin/**/*'],
    '/api/ops/pauta-mensual/export-pdf/route': ['node_modules/@sparticuz/chromium/bin/**/*'],
    '/api/ops/guard-events/\\[id\\]/send-doc/route': ['node_modules/@sparticuz/chromium/bin/**/*'],
    '/api/ops/control-nocturno/\\[id\\]/test-email/route': ['node_modules/@sparticuz/chromium/bin/**/*'],
  },
  turbopack: {
    root: __dirname,
  },
  serverExternalPackages: [
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
      static: 0,
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

module.exports =
  process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN
    ? withSentryConfig(nextConfig, sentryOptions)
    : nextConfig;
