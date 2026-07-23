import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,

  enabled: !!(
    process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN
  ),

  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  environment: process.env.NODE_ENV,

  // Los loader hooks ESM de OTel (import-in-the-middle) envuelven módulos en
  // Proxies que violan invariantes con `googleapis` (props no-configurables):
  // "'get' on proxy: property 'users' is a read-only and non-configurable…".
  // Eso mataba TODA la integración Gmail en prod (sync aparcada, acciones
  // rechazadas, OAuth callback caído). En Next el código va bundleado, así
  // que estos hooks no aportan instrumentación relevante — fuera.
  registerEsmLoaderHooks: false,
});
