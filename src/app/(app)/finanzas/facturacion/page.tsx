import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  resolvePagePerms,
  hasModuleAccess,
  canView,
  hasCapability,
} from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/opai-ds";
import { FileText } from "lucide-react";
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
  if (!canView(perms, "finance", "facturacion")) redirect("/finanzas/rendiciones");

  const tenantId = session.user.tenantId;
  const canManage = hasCapability(perms, "facturacion_manage");

  // Default: primera página de 50 DTEs (igual que el endpoint paginado).
  // El cliente puede cambiar pageSize y page con re-fetch al endpoint
  // /api/finance/billing/issued — el SSR sólo precarga la primera vista.
  const INITIAL_PAGE_SIZE = 50;
  const [dtes, issuedTotal] = await Promise.all([
    prisma.financeDte.findMany({
      where: { tenantId, direction: "ISSUED" },
      include: { lines: true },
      orderBy: { createdAt: "desc" },
      take: INITIAL_PAGE_SIZE,
    }),
    prisma.financeDte.count({
      where: { tenantId, direction: "ISSUED" },
    }),
  ]);

  const dtesData = dtes.map((d: typeof dtes[number]) => ({
    id: d.id,
    dteType: d.dteType,
    folio: d.folio,
    receiverRut: d.receiverRut,
    receiverName: d.receiverName,
    receiverEmail: d.receiverEmail,
    netAmount: d.netAmount.toNumber(),
    taxAmount: d.taxAmount.toNumber(),
    totalAmount: d.totalAmount.toNumber(),
    siiStatus: d.siiStatus,
    currency: d.currency,
    linesCount: d.lines.length,
    createdAt: d.createdAt.toISOString(),
    emailSentAt: d.emailSentAt ? d.emailSentAt.toISOString() : null,
    emailStatus: d.emailStatus,
    referenceType: d.referenceType,
    referenceFolio: d.referenceFolio,
  }));

  const suppliers = await prisma.financeSupplier.findMany({
    where: { tenantId },
    select: { id: true, rut: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6 min-w-0">
      <PageHero
        icon={<FileText />}
        iconTone="teal"
        eyebrow={["Finanzas", "Facturación"]}
        title="Facturación electrónica"
        subtitle="DTE Chile"
        description="Emisión y gestión de documentos tributarios electrónicos (DTE)."
      />
      <FacturacionClient
        dtes={dtesData}
        issuedTotal={issuedTotal}
        canManage={canManage}
        suppliers={suppliers}
      />
    </div>
  );
}
