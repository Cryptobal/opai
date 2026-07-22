import { auth } from "@/lib/auth";
import { resolvePagePerms, hasCapability } from "@/lib/permissions-server";
import { redirect } from "next/navigation";
import { PlanillaClient } from "@/components/finance/flow-v3/PlanillaClient";

/**
 * Flujo de Caja v3 — Modo Planilla. Convive con el módulo viejo
 * (/finanzas/flujo-caja) detrás del flag cashflowPlanillaV3; esta ruta es
 * accesible directo para validación. La matriz completa se pide client-side
 * a /api/finance/flow-v3/matrix (ventana móvil de 12 meses).
 */
export default async function FlujoPlanillaPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/finanzas/flujo-caja/planilla");
  const perms = await resolvePagePerms(session.user);
  if (!hasCapability(perms, "cashflow_view")) redirect("/finanzas");
  const canManage = hasCapability(perms, "cashflow_manage");

  return <PlanillaClient canManage={canManage} />;
}
