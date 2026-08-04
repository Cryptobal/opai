import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  resolvePagePerms,
  hasModuleAccess,
  hasCapability,
  hasFacturacionCapability,
} from "@/lib/permissions-server";
import { RecurringCalendarBatchTable } from "@/components/finance/configuracion/RecurringCalendarBatchTable";

/**
 * Edición masiva del calendario de emisión y cobro de programaciones.
 * Fuente de verdad del Flujo de Caja v3 (FinanceDteRecurringTemplate).
 *
 * Requiere `facturacion_configure` o `cashflow_configure`.
 */
export default async function ProgramacionesCobroPage() {
  const session = await auth();
  if (!session?.user) {
    redirect(
      "/opai/login?callbackUrl=/finanzas/configuracion/programaciones-cobro",
    );
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) redirect("/hub");
  const allowed =
    hasFacturacionCapability(perms, "facturacion_configure") ||
    hasCapability(perms, "cashflow_configure");
  if (!allowed) redirect("/hub");

  return (
    <div className="space-y-4 min-w-0">
      <div className="rounded-md border border-ds-border-default bg-ds-surface-1 p-3 text-xs text-ds-text-3">
        Este calendario es el que efectivamente proyecta el Flujo de Caja.
        Las columnas &quot;Emisión est.&quot; y &quot;Cobro est.&quot; muestran
        dónde caerá cada cuota según la misma regla del flujo. El estado
        (activa/inactiva) se gestiona en Facturación → Programación.
      </div>
      <RecurringCalendarBatchTable />
    </div>
  );
}
