export async function register() {
  const hasSentryDsn =
    Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN) || Boolean(process.env.SENTRY_DSN);
  if (!hasSentryDsn) return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export async function onRequestError(...args: unknown[]) {
  const hasSentryDsn =
    Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN) || Boolean(process.env.SENTRY_DSN);
  if (!hasSentryDsn) return;

  const Sentry = await import("@sentry/nextjs");
  return (Sentry as { captureRequestError?: (...params: unknown[]) => unknown })
    .captureRequestError?.(...args);
}
