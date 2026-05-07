import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, hasModuleAccess, hasCapability, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { PageHero } from "@/components/opai-ds";
import { Surface } from "@/components/opai-ds";
import {
  Receipt,
  CheckCircle2,
  Wallet,
  BarChart3,
  Landmark,
  FileText,
  FileInput,
} from "lucide-react";
import {
  buildMonthRange,
  computeNetSales,
  computeNetPurchases,
} from "@/modules/finance/billing/sales-aggregator";

export default async function FinanzasDashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/finanzas");
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) {
    redirect("/hub");
  }

  // Si el usuario solo tiene acceso a rendiciones (sin reportes ni rendicion_view_all),
  // redirigir a rendiciones directamente en vez de mostrar dashboard sensible.
  const canSeeFinanceDashboard =
    hasCapability(perms, "rendicion_view_all") ||
    canView(perms, "finance", "reportes") ||
    canView(perms, "finance", "contabilidad") ||
    canView(perms, "finance", "facturacion");
  if (!canSeeFinanceDashboard) {
    redirect("/finanzas/rendiciones");
  }

  const tenantId = session.user.tenantId;

  // Período: mes en curso (fecha tributaria, NO createdAt). El helper
  // computeNetSales aplica la fórmula F29 ((33+34+39+41) + 56 − 61),
  // que es la única que coincide con lo que ve el contador.
  const monthRange = buildMonthRange(null);

  const [
    pendingRendiciones,
    pendingApprovals,
    pendingPaymentAmount,
    salesAgg,
    pendientesSiiCount,
    comprasPorRevisarCount,
    purchasesAgg,
  ] = await Promise.all([
    prisma.financeRendicion.count({
      where: { tenantId, status: { in: ["DRAFT", "SUBMITTED"] } },
    }),
    prisma.financeRendicion.count({
      where: { tenantId, status: { in: ["SUBMITTED", "IN_APPROVAL"] } },
    }),
    prisma.financeRendicion.aggregate({
      where: { tenantId, status: "APPROVED" },
      _sum: { amount: true },
    }),
    computeNetSales(tenantId, monthRange),
    prisma.financeDte.count({
      where: { tenantId, direction: "ISSUED", siiStatus: { in: ["PENDING", "SENT"] } },
    }),
    prisma.financeDte.count({
      where: { tenantId, direction: "RECEIVED", receptionStatus: "PENDING_REVIEW" },
    }),
    computeNetPurchases(tenantId, monthRange),
  ]);

  const amountPending = pendingPaymentAmount._sum.amount ?? 0;
  const ventasMes = salesAgg.ventasNetas;
  const comprasMes = purchasesAgg.comprasNetas;
  const periodoLabel = monthRange.label;

  const fmtCLP = new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    minimumFractionDigits: 0,
  });

  const canApprove = hasCapability(perms, "rendicion_approve");
  const canPay = hasCapability(perms, "rendicion_pay");

  const modules = [
    {
      href: "/finanzas/rendiciones",
      title: "Rendiciones",
      description: "Crea y gestiona rendiciones de gastos y kilometraje.",
      icon: Receipt,
      count: pendingRendiciones > 0 ? pendingRendiciones : null,
      countLabel: "pendiente(s)",
      color: "text-status-ok-fg bg-status-ok-soft",
      show: true,
    },
    {
      href: "/finanzas/aprobaciones",
      title: "Aprobaciones",
      description: "Revisa y aprueba rendiciones enviadas por tu equipo.",
      icon: CheckCircle2,
      count: pendingApprovals > 0 ? pendingApprovals : null,
      countLabel: "por aprobar",
      color: "text-status-info-fg bg-status-info-soft",
      show: canApprove,
    },
    {
      href: "/finanzas/pagos",
      title: "Pagos",
      description: "Procesa pagos manuales o genera archivos bancarios.",
      icon: Wallet,
      count: amountPending > 0 ? fmtCLP.format(amountPending) : null,
      countLabel: "por pagar",
      color: "text-tint-violet-fg bg-tint-violet",
      show: canPay,
    },
    {
      href: "/finanzas/facturacion",
      title: "Facturación",
      description: "Emite DTE: facturas, NC, ND, libro IVA",
      icon: FileText,
      count: ventasMes !== 0 ? fmtCLP.format(ventasMes) : null,
      countLabel:
        pendientesSiiCount > 0
          ? `${periodoLabel} · ${pendientesSiiCount} pend. SII`
          : `${periodoLabel} · ventas netas`,
      color: "text-status-ok-fg bg-status-ok-soft",
      show: canView(perms, "finance", "facturacion"),
      highlighted: true,
    },
    {
      href: "/finanzas/facturacion?tab=recibidos",
      title: "Compras",
      description: "DTE recibidos, sync RCV, control de pagos",
      icon: FileInput,
      count:
        comprasPorRevisarCount > 0
          ? comprasPorRevisarCount
          : comprasMes > 0
            ? fmtCLP.format(comprasMes)
            : null,
      countLabel:
        comprasPorRevisarCount > 0
          ? "por revisar"
          : `${periodoLabel} · compras netas`,
      color: "text-status-warn-fg bg-status-warn-soft",
      show: canView(perms, "finance", "facturacion"),
    },
    {
      href: "/finanzas/reportes",
      title: "Reportes",
      description: "Resumen de gastos por tipo, estado y período.",
      icon: BarChart3,
      count: null,
      countLabel: null,
      color: "text-status-warn-fg bg-status-warn-soft",
      show: true,
    },
  ];

  return (
    <div className="space-y-6 min-w-0">
      <PageHero
        icon={<Landmark />}
        iconTone="teal"
        title="Finanzas"
        subtitle="rendiciones, aprobaciones y pagos"
        description="Rendiciones de gastos, aprobaciones, pagos y reportes."
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 min-w-0">
        {modules.filter((m) => m.show).map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="block">
              <Surface
                elevation={1}
                padding="md"
                hoverable
                className={cn(
                  "h-full",
                  item.highlighted && "ring-1 ring-status-ok-border",
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-ds-md bg-primary/10 text-primary shrink-0">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-[14px] font-semibold text-ds-text-1">{item.title}</p>
                    <p className="text-[12px] text-ds-text-3 mt-0.5">{item.description}</p>
                    {item.count != null && (
                      <p className="font-display text-2xl font-bold text-ds-text-1 ds-num mt-2">{item.count}</p>
                    )}
                  </div>
                </div>
              </Surface>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
