const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  void import("@sentry/nextjs").then((Sentry) => {
    Sentry.init({
      dsn,
      enabled: typeof window !== "undefined" && !!dsn,
      tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
      integrations: [Sentry.replayIntegration()],
      environment: process.env.NODE_ENV,
    });
  });
}
