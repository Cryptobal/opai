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
    foliosCAFs,
  ] = await Promise.all([
    prisma.financeDte.findMany({
      where: { tenantId, direction: "ISSUED" },
      include: { lines: true },
      orderBy: { createdAt: "desc" },
      take: INITIAL_PAGE_SIZE,
    }),
    prisma.financeDte.count({
      where: { tenantId, direction: "ISSUED" },
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
    prisma.tenantDteCaf.findMany({
      where: { tenantId, isActive: true },
      select: { dteType: true, folioDesde: true, folioHasta: true },
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

  const ventasMes = ventasMesAgg._sum.totalAmount?.toNumber() ?? 0;
  const ventasPrev = ventasPrevAgg._sum.totalAmount?.toNumber() ?? 0;
  const pctVsPrev =
    ventasPrev > 0 ? ((ventasMes - ventasPrev) / ventasPrev) * 100 : 0;
  const ivaDebitoMes = ventasMesAgg._sum.taxAmount?.toNumber() ?? 0;
  const facturasMes = ventasMesAgg._count._all;

  // Folios disponibles = suma de rangos CAF activos. La detección "stock bajo"
  // queda como `0` aquí; un cálculo real requiere comparar con `nextFolio`
  // del tracker — refinar en sub-fase posterior.
  const foliosDisponibles = foliosCAFs.reduce(
    (acc: number, c: { folioDesde: number; folioHasta: number }) =>
      acc + (c.folioHasta - c.folioDesde + 1),
    0,
  );
  const foliosLowCount = 0;

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
