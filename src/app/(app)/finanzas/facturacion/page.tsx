import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  resolvePagePerms,
  hasModuleAccess,
  hasFacturacionCapability,
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
  if (!hasFacturacionCapability(perms, "facturacion_view")) {
    redirect("/finanzas/rendiciones");
  }

  const tenantId = session.user.tenantId;
  // canManage = puede hacer al menos una acción de mutación. La legacy
  // `facturacion_manage` se expande automáticamente vía
  // hasFacturacionCapability, así que owner/admin/finanzas no pierden nada.
  const canManage =
    hasFacturacionCapability(perms, "facturacion_issue") ||
    hasFacturacionCapability(perms, "facturacion_credit_note") ||
    hasFacturacionCapability(perms, "facturacion_void") ||
    hasFacturacionCapability(perms, "facturacion_resend_email") ||
    hasFacturacionCapability(perms, "facturacion_configure");

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
        canManage={canManage}
        suppliers={suppliers}
      />
    </div>
  );
}
