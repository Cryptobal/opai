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
import { getFolioStatus } from "@/modules/finance/billing/folio.service";

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

  // Default: primera página de 50 DTEs para la lista (igual que el endpoint
  // paginado). El cliente puede cambiar pageSize y page con re-fetch al
  // endpoint /api/finance/billing/issued — el SSR sólo precarga la primera
  // vista. Además se hacen las agregaciones para KPIs del dashboard.
  const INITIAL_PAGE_SIZE = 50;
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const startOfPrevMonth = new Date(startOfMonth);
  startOfPrevMonth.setMonth(startOfPrevMonth.getMonth() - 1);

  const [
    dtes,
    issuedTotal,
    suppliers,
    ventasMesAgg,
    ventasPrevAgg,
    pendientesSiiCount,
    folioStatuses,
  ] = await Promise.all([
    prisma.financeDte.findMany({
      where: { tenantId, direction: "ISSUED", siiStatus: { not: "DRAFT" } },
      include: { lines: true },
      orderBy: { createdAt: "desc" },
      take: INITIAL_PAGE_SIZE,
    }),
    prisma.financeDte.count({
      where: { tenantId, direction: "ISSUED", siiStatus: { not: "DRAFT" } },
    }),
    prisma.financeSupplier.findMany({
      where: { tenantId },
      select: { id: true, rut: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.financeDte.aggregate({
      where: {
        tenantId,
        direction: "ISSUED",
        siiStatus: { in: ["ACCEPTED", "PENDING", "SENT"] },
        date: { gte: startOfMonth },
        dteType: { not: 61 },
      },
      _sum: { totalAmount: true, taxAmount: true },
      _count: { _all: true },
    }),
    prisma.financeDte.aggregate({
      where: {
        tenantId,
        direction: "ISSUED",
        siiStatus: "ACCEPTED",
        date: { gte: startOfPrevMonth, lt: startOfMonth },
        dteType: { not: 61 },
      },
      _sum: { totalAmount: true },
    }),
    prisma.financeDte.count({
      where: {
        tenantId,
        direction: "ISSUED",
        siiStatus: { in: ["PENDING", "SENT"] },
      },
    }),
    getFolioStatus(tenantId),
  ]);

  // Centro de costo: enriquecer con cliente CRM + instalación.
  const accountIds = Array.from(
    new Set(dtes.map((d) => d.crmAccountId).filter((v): v is string => !!v)),
  );
  const installationIds = Array.from(
    new Set(dtes.map((d) => d.installationId).filter((v): v is string => !!v)),
  );
  // Factoring: tipos cedibles según Ley 19.983 — 33/34/43/46.
  const CEDIBLE_TYPES = new Set([33, 34, 43, 46]);
  const dteIds = dtes.map((d: typeof dtes[number]) => d.id);
  const [accountsCC, installationsCC, activeCessions] = await Promise.all([
    accountIds.length > 0
      ? prisma.crmAccount.findMany({
          where: { id: { in: accountIds }, tenantId },
          select: { id: true, name: true, legalName: true },
        })
      : Promise.resolve([]),
    installationIds.length > 0
      ? prisma.crmInstallation.findMany({
          where: { id: { in: installationIds }, tenantId },
          select: { id: true, name: true, commune: true },
        })
      : Promise.resolve([]),
    dteIds.length > 0
      ? prisma.financeFactoringOperation.findMany({
          where: {
            tenantId,
            dteId: { in: dteIds },
            status: { in: ["SUBMITTED", "APPROVED", "FUNDED", "COLLECTED", "CLOSED"] },
          },
          select: { id: true, code: true, status: true, dteId: true },
        })
      : Promise.resolve([]),
  ]);
  const accountMapCC = new Map(accountsCC.map((a) => [a.id, a]));
  const installationMapCC = new Map(installationsCC.map((i) => [i.id, i]));
  const cessionByDte = new Map(activeCessions.map((c) => [c.dteId, c]));

  const dtesData = dtes.map((d: typeof dtes[number]) => {
    const hasXml = d.dteXml !== null && d.dteXml.length > 0;
    const cession = cessionByDte.get(d.id);
    const canBeCeded =
      CEDIBLE_TYPES.has(d.dteType) &&
      d.siiStatus === "ACCEPTED" &&
      hasXml &&
      !cession;
    return {
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
      // Flag para condicionar botones de descarga PDF/XML.
      hasXml,
      // Centro de costo: cliente CRM + instalación (para mostrar columna
      // y permitir edición inline).
      crmAccountId: d.crmAccountId,
      installationId: d.installationId,
      crmAccount: d.crmAccountId ? accountMapCC.get(d.crmAccountId) ?? null : null,
      installation: d.installationId
        ? installationMapCC.get(d.installationId) ?? null
        : null,
      // Factoring: cedible + cesión activa (mismo shape que el endpoint /issued).
      canBeCeded,
      activeCession: cession
        ? { id: cession.id, code: cession.code, status: cession.status }
        : null,
    };
  });

  const ventasMes = ventasMesAgg._sum.totalAmount?.toNumber() ?? 0;
  const ventasPrev = ventasPrevAgg._sum.totalAmount?.toNumber() ?? 0;
  const pctVsPrev =
    ventasPrev > 0 ? ((ventasMes - ventasPrev) / ventasPrev) * 100 : 0;
  const ivaDebitoMes = ventasMesAgg._sum.taxAmount?.toNumber() ?? 0;
  const facturasMes = ventasMesAgg._count._all;

  // Folios disponibles = suma de `disponibles` por tipo (folioHasta - nextFolio + 1).
  // foliosLowCount = cantidad de tipos con stock bajo el threshold (50).
  const foliosDisponibles = folioStatuses.reduce(
    (acc, f) => acc + f.disponibles,
    0,
  );
  const foliosLowCount = folioStatuses.filter((f) => f.lowStock).length;

  const kpis = {
    ventasMes,
    ivaDebitoMes,
    pendientesSii: pendientesSiiCount,
    facturasMes,
    foliosDisponibles,
    foliosLowCount,
    comparison: { vs: "vs mes anterior", pct: pctVsPrev },
  };

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
        kpis={kpis}
      />
    </div>
  );
}
