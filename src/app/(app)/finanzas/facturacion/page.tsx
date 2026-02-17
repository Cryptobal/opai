import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  resolvePagePerms,
  hasModuleAccess,
  canView,
  hasCapability,
} from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { PageHeader } from "@/components/opai";
import { FinanceSubnav } from "@/components/finance";
import { FacturacionClient } from "@/components/finance/FacturacionClient";

export default async function FacturacionPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/finanzas/facturacion");
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) {
    redirect("/hub");
  }
  if (!canView(perms, "finance", "facturacion")) {
    redirect("/finanzas");
  }

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());
  const canManage = hasCapability(perms, "facturacion_manage");

  const dtes = await prisma.financeDte.findMany({
    where: { tenantId, direction: "ISSUED" },
    include: { lines: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const dtesData = dtes.map((d: typeof dtes[number]) => ({
    id: d.id,
    dteType: d.dteType,
    folio: d.folio,
    receiverRut: d.receiverRut,
    receiverName: d.receiverName,
    netAmount: d.netAmount.toNumber(),
    taxAmount: d.taxAmount.toNumber(),
    totalAmount: d.totalAmount.toNumber(),
    siiStatus: d.siiStatus,
    currency: d.currency,
    linesCount: d.lines.length,
    createdAt: d.createdAt.toISOString(),
  }));

  const suppliers = await prisma.financeSupplier.findMany({
    where: { tenantId },
    select: { id: true, rut: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Facturación electrónica"
        description="Emisión y gestión de documentos tributarios electrónicos (DTE)."
      />
      <FinanceSubnav />
      <FacturacionClient
        dtes={dtesData}
        canManage={canManage}
        suppliers={suppliers}
      />
    </div>
  );
}
