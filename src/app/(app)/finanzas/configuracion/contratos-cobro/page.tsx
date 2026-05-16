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
 * Vista temporal de setup masivo del calendario de cobro por contrato.
 *
 * No va en el menú principal — solo accesible vía URL directa. Después
 * del setup inicial (25-30 contratos del tenant), queda como herramienta
 * de soporte para ajustes batch. Para edición individual se usa el
 * modal "Editar ítem del flujo de caja" desde la página del contrato.
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
        title="Configuración de contratos — Ciclo de cobro"
        description="Define el calendario de emisión y cobro para cada contrato del tenant. Pantalla de setup masivo."
      />
      <div className="rounded-md bg-status-warn-soft text-status-warn-fg p-3 text-sm">
        Esta es una pantalla de configuración masiva. Para edición
        individual, usá el form de &quot;Editar ítem del flujo de caja&quot;
        desde cada contrato. Cuando un contrato emite proforma, los
        campos &quot;Día factura&quot; y &quot;Mes factura&quot; no
        aplican (la fecha se deriva de proforma + días) y aparecen
        deshabilitados.
      </div>
      <ContractsCobroBatchTable />
    </div>
  );
}
