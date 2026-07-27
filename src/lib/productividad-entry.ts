import { cache } from "react";
import { getAppRequestContext } from "@/lib/app-request-context";
import { resolveProductividadLanding } from "@/lib/surface";

/**
 * Entrada a `/productividad`. Reutiliza `getAppRequestContext` (mismo
 * React.cache que el layout) para no pagar auth/permisos/módulos dos veces.
 */
export const getProductividadEntryContext = cache(async () => {
  const ctx = await getAppRequestContext();
  if (!ctx) return { session: null as null, landing: null as string | null };

  const enabled = new Set(ctx.tenantModules);
  const role = ctx.session.user.role;
  const isAdmin = role === "owner" || role === "admin";
  const landing = resolveProductividadLanding(
    ctx.permissions,
    (key) => enabled.has(key),
    { isAdmin },
  );

  return { session: ctx.session, landing };
});
