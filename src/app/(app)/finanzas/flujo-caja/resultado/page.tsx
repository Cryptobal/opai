import { auth } from "@/lib/auth";
import { resolvePagePerms, hasCapability } from "@/lib/permissions-server";
import { redirect } from "next/navigation";
import { ResultadoClient } from "@/components/finance/flow-v3/ResultadoClient";

/**
 * Flujo de Caja — Resultado proyectado (P&L operativo mensual).
 * Tesorería sigue en /finanzas/flujo-caja/planilla.
 */
export const dynamic = "force-dynamic";

export default async function FlujoResultadoPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/finanzas/flujo-caja/resultado");
  const perms = await resolvePagePerms(session.user);
  if (!hasCapability(perms, "cashflow_view")) redirect("/finanzas");

  return <ResultadoClient />;
}
