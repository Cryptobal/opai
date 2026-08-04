import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  resolvePagePerms,
  hasModuleAccess,
  hasCapability,
} from "@/lib/permissions-server";
import { ContractsCobroBatchTable } from "@/components/finance/configuracion/ContractsCobroBatchTable";

/**
 * Edición masiva de monto, vigencia y reajuste IPC de items CONTRACT.
 * El calendario de emisión y cobro vive en Programaciones.
 *
 * Requiere capability `cashflow_configure`.
 */
export default async function ContratosMontoIpcPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/finanzas/configuracion/contratos");
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) redirect("/hub");
  if (!hasCapability(perms, "cashflow_configure")) redirect("/hub");

  return (
    <div className="space-y-4 min-w-0">
      <div className="rounded-md border border-ds-border-default bg-ds-surface-1 p-3 text-xs text-ds-text-3">
        Edita monto, moneda, vigencia y reajuste IPC del contrato. El
        calendario de emisión y cobro se configura en{" "}
        <a
          href="/finanzas/configuracion/programaciones-cobro"
          className="underline hover:no-underline text-ds-text-1"
        >
          Programaciones — Calendario de cobro
        </a>
        .
      </div>
      <ContractsCobroBatchTable />
    </div>
  );
}
