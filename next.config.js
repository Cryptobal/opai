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
    // Facturación: el render del PDF (proforma / estado de pago / factura)
    // usa @react-pdf con fuentes en public/fonts y el logo WebP→PNG vía
    // sharp. Sin estos globs, en Vercel `process.cwd()/public/fonts/*.ttf`
    // no viaja en el lambda y el render tira ENOENT
    // (PlusJakartaSans-Regular.ttf), rompiendo el auto-envío recurrente.
    '/api/cron/finance-recurring-billing/route': ['./public/fonts/**/*', ...sharpTraceGlobs],
    '/api/cron/finance-recurring-billing': ['./public/fonts/**/*', ...sharpTraceGlobs],
    '/api/finance/billing/recurring/\\[id\\]/run-now/route': ['./public/fonts/**/*', ...sharpTraceGlobs],
    '/api/finance/billing/recurring/\\[id\\]/run-now': ['./public/fonts/**/*', ...sharpTraceGlobs],
    '/api/finance/billing/drafts/\\[id\\]/send-as/route': ['./public/fonts/**/*', ...sharpTraceGlobs],
    '/api/finance/billing/drafts/\\[id\\]/send-as': ['./public/fonts/**/*', ...sharpTraceGlobs],
    '/api/finance/billing/drafts/bulk-retry-send/route': ['./public/fonts/**/*', ...sharpTraceGlobs],
    '/api/finance/billing/drafts/bulk-retry-send': ['./public/fonts/**/*', ...sharpTraceGlobs],
    '/api/finance/billing/bulk-send-as/route': ['./public/fonts/**/*', ...sharpTraceGlobs],
    '/api/finance/billing/bulk-send-as': ['./public/fonts/**/*', ...sharpTraceGlobs],
    '/api/finance/billing/issued/\\[id\\]/send-as/route': ['./public/fonts/**/*', ...sharpTraceGlobs],
    '/api/finance/billing/issued/\\[id\\]/send-as': ['./public/fonts/**/*', ...sharpTraceGlobs],
    '/api/finance/billing/preview-pdf/route': ['./public/fonts/**/*', ...sharpTraceGlobs],
    '/api/finance/billing/preview-pdf': ['./public/fonts/**/*', ...sharpTraceGlobs],
  },
  turbopack: {
    root: __dirname,
  },
  serverExternalPackages: [
    // Prisma: evitar que Webpack/Turbopack bundle el cliente y termine
    // resolviendo el variant `wasm.js` (que exige Prisma Accelerate y
    // rechaza URLs `postgresql://`). Externalizándolo, Node lo carga
    // por require natural y obtiene el library engine correcto.
    '@prisma/client',
    '.prisma/client',
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
    // DTE PDF rendering local (sin SimpleAPI) — pdf-lib + bwip-js son
    // libs Node-only que NO deben bundlearse con webpack porque rompen
    // el server (importan APIs de Node.js que webpack intenta polyfillar).
    'pdf-lib',
    'bwip-js',
    'fast-xml-parser',
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
  async redirects() {
    return [
      // Facturación N3 refactor — `recurrentes` se unificó dentro de
      // `programacion` (junto con borradores libres).
      {
        source: '/finanzas/facturacion/recurrentes',
        destination: '/finanzas/facturacion/programacion',
        permanent: true,
      },
      // Compatibilidad con deeplinks legacy `?tab=...` que apuntaban a
      // los tabs internos antes del refactor a rutas reales.
      {
        source: '/finanzas/facturacion',
        has: [{ type: 'query', key: 'tab', value: 'borradores' }],
        destination: '/finanzas/facturacion/programacion',
        permanent: true,
      },
      {
        source: '/finanzas/facturacion',
        has: [{ type: 'query', key: 'tab', value: 'recibidos' }],
        destination: '/finanzas/facturacion/recibidos',
        permanent: true,
      },
      {
        source: '/finanzas/facturacion',
        has: [{ type: 'query', key: 'tab', value: 'libro' }],
        destination: '/finanzas/facturacion/libro-iva',
        permanent: true,
      },
      {
        source: '/finanzas/facturacion',
        has: [{ type: 'query', key: 'tab', value: 'folios' }],
        destination: '/finanzas/facturacion/folios',
        permanent: true,
      },
      {
        source: '/finanzas/facturacion',
        has: [{ type: 'query', key: 'tab', value: 'dtes' }],
        destination: '/finanzas/facturacion/dtes',
        permanent: true,
      },
    ];
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
