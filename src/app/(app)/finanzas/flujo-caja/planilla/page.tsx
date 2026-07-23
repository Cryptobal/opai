import { auth } from "@/lib/auth";
import { resolvePagePerms, hasCapability } from "@/lib/permissions-server";
import { redirect } from "next/navigation";
import { isTenantFeatureFlagEnabled } from "@/lib/tenant-modules";
import { PlanillaClient } from "@/components/finance/flow-v3/PlanillaClient";

/**
 * Flujo de Caja v3 — Modo Planilla: la ruta PRINCIPAL por defecto. El módulo
 * anterior (/finanzas/flujo-caja) queda como rollback vía el flag opt-out
 * cashflowPlanillaLegacy. La matriz completa se pide client-side a
 * /api/finance/flow-v3/matrix (horizonte hoy−4sem → +12 meses).
 */
export default async function FlujoPlanillaPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/finanzas/flujo-caja/planilla");
  const perms = await resolvePagePerms(session.user);
  if (!hasCapability(perms, "cashflow_view")) redirect("/finanzas");
  const canManage = hasCapability(perms, "cashflow_manage");
  const flagOn = !(await isTenantFeatureFlagEnabled(session.user.tenantId, "cashflowPlanillaLegacy"));

  return <PlanillaClient canManage={canManage} flagOn={flagOn} />;
}
