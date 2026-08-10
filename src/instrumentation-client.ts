const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  void import("@sentry/nextjs").then((Sentry) => {
    Sentry.init({
      dsn,
      enabled: typeof window !== "undefined" && !!dsn,
      tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
      // Session Replay desactivado: rrweb graba el DOM de forma continua en
      // clientes iPad/iPhone. Puede rehabilitarse puntualmente para depuración.
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      environment: process.env.NODE_ENV,
    });
  });
}
