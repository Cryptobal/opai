/**
 * Observabilidad del módulo de correo (S12): los errores dejan de morir en
 * console.* — se reportan a Sentry con contexto (tenant, casilla, hilo)
 * manteniendo el log de consola. Sin DSN configurado, captureException es
 * no-op y solo queda el log.
 */
import * as Sentry from "@sentry/nextjs";

export type EmailErrorContext = {
  /** Punto del módulo donde ocurrió (ej. "sync-queue", "detalle-hilo"). */
  scope: string;
  tenantId?: string | null;
  emailAccountId?: string | null;
  threadId?: string | null;
  /** Metadata extra NO sensible (nunca cuerpos de correo ni tokens). */
  extra?: Record<string, unknown>;
  level?: "error" | "warning";
};

export function captureEmailError(error: unknown, ctx: EmailErrorContext): void {
  const log = ctx.level === "warning" ? console.warn : console.error;
  log(`[correo:${ctx.scope}]`, {
    tenantId: ctx.tenantId,
    emailAccountId: ctx.emailAccountId,
    threadId: ctx.threadId,
    ...ctx.extra,
  }, error);
  try {
    Sentry.captureException(error, {
      level: ctx.level ?? "error",
      tags: {
        module: "crm-email",
        scope: ctx.scope,
        ...(ctx.tenantId ? { tenantId: ctx.tenantId } : {}),
      },
      extra: {
        emailAccountId: ctx.emailAccountId ?? undefined,
        threadId: ctx.threadId ?? undefined,
        ...ctx.extra,
      },
    });
  } catch {
    // Sentry nunca debe tumbar el flujo del módulo.
  }
}
