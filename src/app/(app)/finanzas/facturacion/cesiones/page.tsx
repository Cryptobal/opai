/**
 * Listado de cesiones (operaciones de factoring) con KPIs.
 * Bloque 6 factoring v3.
 */

import { redirect } from "next/navigation";
import { Coins } from "lucide-react";
import { auth } from "@/lib/auth";
import {
  hasFacturacionCapability,
  hasModuleAccess,
  resolvePagePerms,
} from "@/lib/permissions-server";
import { PageHero } from "@/components/opai-ds";
import {
  getFactoringKpis,
  listFactoringOperations,
} from "@/modules/finance/factoring/operations.service";
import { listFactoringCompanies } from "@/modules/finance/factoring/factoring-companies.service";
import { FactoringOperationsClient } from "@/components/finance/factoring/FactoringOperationsClient";

export default async function FactoringOperationsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/finanzas/facturacion/cesiones");
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) redirect("/hub");
  if (!hasFacturacionCapability(perms, "facturacion_view")) {
    redirect("/finanzas/facturacion");
  }

  const tenantId = session.user.tenantId;
  const now = new Date();
  const periodo = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  const [kpis, listResult, companies] = await Promise.all([
    getFactoringKpis(tenantId, periodo),
    listFactoringOperations(tenantId, { periodo, page: 1, pageSize: 20 }),
    listFactoringCompanies(tenantId, { includeInactive: false }),
  ]);

  const initialOperations = listResult.operations.map((o) => ({
    id: o.id,
    code: o.code,
    status: o.status,
    fechaCesion: o.fechaCesion ? o.fechaCesion.toISOString().slice(0, 10) : null,
    submittedAt: o.submittedAt ? o.submittedAt.toISOString() : null,
    factoringCompany: o.factoringCompany,
    factoringCompanyId: o.factoringCompanyId,
    factoringRazonSocial: o.factoringCompanyRel?.razonSocial ?? o.factoringCompany,
    invoiceAmount: Number(o.invoiceAmount),
    montoCesion: o.montoCesion !== null ? Number(o.montoCesion) : null,
    netAdvance: Number(o.netAdvance),
    plazoDias: o.plazoDias,
    aecTrackId: o.aecTrackId,
    cessionSiiStatus: o.cessionSiiStatus,
    dteType: o.dte.dteType,
    dteFolio: o.dte.folio,
    dteReceiverName: o.dte.receiverName ?? "",
  }));

  const factoringOptions = companies.map((c) => ({ id: c.id, label: c.razonSocial }));

  return (
    <div className="space-y-6 min-w-0">
      <PageHero
        icon={<Coins />}
        iconTone="teal"
        eyebrow={["Finanzas", "Facturación"]}
        title="Cesiones de facturas"
        subtitle="Factoring electrónico"
        description="Operaciones de cesión a empresas de factoring, con anticipos, intereses, comisiones y trazabilidad SII."
      />
      <FactoringOperationsClient
        initialOperations={initialOperations}
        initialKpis={kpis}
        initialPeriodo={periodo}
        initialTotal={listResult.total}
        factoringOptions={factoringOptions}
      />
    </div>
  );
}
