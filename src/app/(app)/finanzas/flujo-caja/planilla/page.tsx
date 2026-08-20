import { auth } from "@/lib/auth";
import { resolvePagePerms, hasCapability } from "@/lib/permissions-server";
import { redirect } from "next/navigation";
import { PlanillaClient } from "@/components/finance/flow-v3/PlanillaClient";
import { FinanceN3Chips } from "@/components/finance/FinanceN3Chips";

/**
 * Flujo de Caja — Caja (planilla tesorería). El Resultado proyectado vive
 * en /finanzas/flujo-caja/resultado. La matriz se pide client-side a
 * /api/finance/flow-v3/matrix (horizonte hoy−4sem → +12 meses).
 */
export default async function FlujoPlanillaPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/finanzas/flujo-caja/planilla");
  const perms = await resolvePagePerms(session.user);
  if (!hasCapability(perms, "cashflow_view")) redirect("/finanzas");
  const canManage = hasCapability(perms, "cashflow_manage");
  const tenantId = session.user.tenantId ?? "";

  return (
    <>
      <FinanceN3Chips submoduleKey="finance-flujo-caja" />
      <PlanillaClient canManage={canManage} tenantId={tenantId} />
    </>
  );
}
