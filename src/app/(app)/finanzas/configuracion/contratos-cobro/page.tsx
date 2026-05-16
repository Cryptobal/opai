import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  resolvePagePerms,
  hasModuleAccess,
  hasCapability,
} from "@/lib/permissions-server";
import { PageHero } from "@/components/opai-ds";
import { Settings2 } from "lucide-react";
import { ContractsCobroBatchTable } from "@/components/finance/configuracion/ContractsCobroBatchTable";

/**
 * Centro de configuración masiva del calendario de cobro por contrato.
 *
 * Accesible desde Configuración Finanzas → "Contratos — Ciclo de cobro".
 * Permite editar en batch el calendario de emisión y cobro de todos los
 * contratos del tenant. Para edición individual se usa el modal
 * "Editar ítem del flujo de caja" desde la página del contrato.
 *
 * Requiere capability `cashflow_configure`.
 */
export default async function ContratosCobroPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/finanzas/configuracion/contratos-cobro");
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) redirect("/hub");
  if (!hasCapability(perms, "cashflow_configure")) redirect("/hub");

  return (
    <div className="space-y-6 min-w-0">
      <PageHero
        icon={<Settings2 />}
        iconTone="teal"
        title="Contratos — Ciclo de cobro"
        description="Centro de configuración masiva del calendario de facturación y cobro por contrato."
      />
      <div className="rounded-md border border-ds-border-default bg-ds-surface-1 p-3 text-xs text-ds-text-3">
        Edita el calendario de emisión y cobro de todos los contratos en una
        sola vista. Los cambios se aplican en batch al guardar. Para edición
        individual, podés usar el form desde cada contrato del cliente.
        Cuando un contrato emite proforma, los campos &quot;Día factura&quot;
        y &quot;Mes factura&quot; no aplican (la fecha se deriva de proforma
        + días) y aparecen deshabilitados.
      </div>
      <ContractsCobroBatchTable />
    </div>
  );
}
