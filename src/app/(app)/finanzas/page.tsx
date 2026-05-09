import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, hasModuleAccess, hasCapability, canView } from "@/lib/permissions-server";
import { hasFacturacionCapability } from "@/lib/permissions-server";
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
  BookText,
  ArrowUpCircle,
  ArrowDownCircle,
  Banknote,
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

  // Si el usuario solo tiene acceso a rendiciones (sin reportes ni
  // rendicion_view_all), redirigir a rendiciones directamente en vez de
  // mostrar dashboard sensible.
  const canSeeFinanceDashboard =
    hasCapability(perms, "rendicion_view_all") ||
    hasCapability(perms, "reports_finance_view") ||
    hasCapability(perms, "finance_reports_view") ||
    hasCapability(perms, "purchases_view") ||
    hasCapability(perms, "banking_view") ||
    hasCapability(perms, "accounting_view") ||
    canView(perms, "finance", "reportes") ||
    canView(perms, "finance", "contabilidad") ||
    canView(perms, "finance", "facturacion");
  if (!canSeeFinanceDashboard) {
    redirect("/finanzas/rendiciones");
  }

  const tenantId = session.user.tenantId;

  // Permisos granulares que controlan qué KPIs/cards renderizamos.
  const canSeeBanking = hasCapability(perms, "banking_view");
  const canSeePurchases =
    hasCapability(perms, "purchases_view") ||
    hasFacturacionCapability(perms, "facturacion_view") ||
    canView(perms, "finance", "facturacion");
  const canSeeAccounting =
    hasCapability(perms, "accounting_view") ||
    hasCapability(perms, "contabilidad_manage");
  const canSeeReports =
    hasCapability(perms, "reports_finance_view") ||
    hasCapability(perms, "finance_reports_view") ||
    canView(perms, "finance", "reportes");
  const canViewRendicionesAll = hasCapability(perms, "rendicion_view_all");
  const canApprove = hasCapability(perms, "rendicion_approve");
  const canPay = hasCapability(perms, "rendicion_pay");

  // Período: mes en curso (fecha tributaria, NO createdAt).
  const monthRange = buildMonthRange(null);

  // Queries condicionales: cada una se dispara solo si el usuario puede
  // ver el dato. Para los que no tiene permiso, devolvemos placeholders.
  const [
    pendingRendiciones,
    pendingApprovals,
    pendingPaymentAmount,
    salesAgg,
    pendientesSiiCount,
    comprasPorRevisarCount,
    purchasesAgg,
    bankAccounts,
  ] = await Promise.all([
    canViewRendicionesAll
      ? prisma.financeRendicion.count({
          where: { tenantId, status: { in: ["DRAFT", "SUBMITTED"] } },
        })
      : Promise.resolve(0),
    canApprove
      ? prisma.financeRendicion.count({
          where: { tenantId, status: { in: ["SUBMITTED", "IN_APPROVAL"] } },
        })
      : Promise.resolve(0),
    canPay
      ? prisma.financeRendicion.aggregate({
          where: { tenantId, status: "APPROVED" },
          _sum: { amount: true },
        })
      : Promise.resolve({ _sum: { amount: null } }),
    canSeePurchases
      ? computeNetSales(tenantId, monthRange)
      : Promise.resolve({ ventasNetas: 0, totalVentas: 0, totalNotasCredito: 0 }),
    canSeePurchases
      ? prisma.financeDte.count({
          where: { tenantId, direction: "ISSUED", siiStatus: { in: ["PENDING", "SENT"] } },
        })
      : Promise.resolve(0),
    canSeePurchases
      ? prisma.financeDte.count({
          where: { tenantId, direction: "RECEIVED", receptionStatus: "PENDING_REVIEW" },
        })
      : Promise.resolve(0),
    canSeePurchases
      ? computeNetPurchases(tenantId, monthRange)
      : Promise.resolve({ comprasNetas: 0, totalCompras: 0, totalNotasCredito: 0 }),
    canSeeBanking
      ? prisma.financeBankAccount.findMany({
          where: { tenantId, isActive: true },
          select: {
            id: true,
            bankName: true,
            accountNumber: true,
            currency: true,
            currentBalance: true,
          },
        })
      : Promise.resolve([] as { id: string; bankName: string; accountNumber: string; currency: string; currentBalance: { toNumber(): number } | null }[]),
  ]);

  const amountPending = Number(pendingPaymentAmount._sum.amount ?? 0);
  const ventasMes = salesAgg.ventasNetas;
  const comprasMes = purchasesAgg.comprasNetas;
  const periodoLabel = monthRange.label;

  // Saldo bancario consolidado (CLP). Convierte Decimals a number.
  const totalBankBalance = bankAccounts.reduce<number>((acc, a) => {
    const bal = a.currentBalance ? Number(a.currentBalance) : 0;
    // Solo suma cuentas en CLP. Las en USD/UF se muestran aparte.
    return a.currency === "CLP" ? acc + bal : acc;
  }, 0);

  const fmtCLP = new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    minimumFractionDigits: 0,
  });

  // ── KPIs de cabecera (cards compactas con número grande) ──
  // Cada uno solo si el usuario tiene el permiso correspondiente.
  const headlineKpis: {
    label: string;
    value: string;
    sublabel: string;
    icon: typeof Landmark;
    tone: "ok" | "info" | "warn" | "neutral";
    href: string;
    show: boolean;
  }[] = [
    {
      label: "Saldo en bancos",
      value: fmtCLP.format(totalBankBalance),
      sublabel:
        bankAccounts.length === 1
          ? `${bankAccounts[0].bankName} - ${bankAccounts[0].accountNumber}`
          : `${bankAccounts.length} cuenta${bankAccounts.length === 1 ? "" : "s"} CLP`,
      icon: Banknote,
      tone: "ok",
      href: "/finanzas/bancos",
      show: canSeeBanking,
    },
    {
      label: "Ventas del mes",
      value: fmtCLP.format(ventasMes),
      sublabel: pendientesSiiCount > 0 ? `${pendientesSiiCount} pend. SII` : periodoLabel,
      icon: ArrowUpCircle,
      tone: "info",
      href: "/finanzas/facturacion",
      show: canSeePurchases,
    },
    {
      label: "Compras del mes",
      value: fmtCLP.format(comprasMes),
      sublabel:
        comprasPorRevisarCount > 0
          ? `${comprasPorRevisarCount} por revisar`
          : periodoLabel,
      icon: ArrowDownCircle,
      tone: "warn",
      href: "/finanzas/facturacion/recibidos",
      show: canSeePurchases,
    },
    {
      label: "Rendiciones pendientes",
      value: pendingRendiciones.toLocaleString("es-CL"),
      sublabel:
        canApprove && pendingApprovals > 0
          ? `${pendingApprovals} por aprobar`
          : "este mes",
      icon: Receipt,
      tone: "neutral",
      href: "/finanzas/rendiciones",
      show: canViewRendicionesAll || canApprove,
    },
  ];

  const visibleHeadlineKpis = headlineKpis.filter((k) => k.show);

  // ── Cards de módulos (acceso rápido) ──
  const modules: {
    href: string;
    title: string;
    description: string;
    icon: typeof Receipt;
    count: string | number | null;
    countLabel: string | null;
    show: boolean;
    highlighted?: boolean;
  }[] = [
    {
      href: "/finanzas/rendiciones",
      title: "Rendiciones",
      description: "Crea y gestiona rendiciones de gastos y kilometraje.",
      icon: Receipt,
      count: pendingRendiciones > 0 ? pendingRendiciones : null,
      countLabel: "pendiente(s)",
      show: true,
    },
    {
      href: "/finanzas/rendiciones/aprobaciones",
      title: "Aprobaciones",
      description: "Revisa y aprueba rendiciones enviadas por tu equipo.",
      icon: CheckCircle2,
      count: pendingApprovals > 0 ? pendingApprovals : null,
      countLabel: "por aprobar",
      show: canApprove,
    },
    {
      href: "/finanzas/rendiciones/pagos",
      title: "Pagos",
      description: "Procesa pagos manuales o genera archivos bancarios.",
      icon: Wallet,
      count: amountPending > 0 ? fmtCLP.format(amountPending) : null,
      countLabel: "por pagar",
      show: canPay,
    },
    {
      href: "/finanzas/facturacion",
      title: "Compras y Ventas",
      description: "DTEs emitidos y recibidos, libro IVA, folios y proveedores.",
      icon: FileText,
      count: ventasMes !== 0 ? fmtCLP.format(ventasMes) : null,
      countLabel: `${periodoLabel} · ventas netas`,
      show: canSeePurchases,
      highlighted: true,
    },
    {
      href: "/finanzas/bancos",
      title: "Banca",
      description: "Cuentas, movimientos, conciliación y reglas auto-match.",
      icon: Landmark,
      count: bankAccounts.length > 0 ? fmtCLP.format(totalBankBalance) : null,
      countLabel: bankAccounts.length > 0 ? "saldo total CLP" : null,
      show: canSeeBanking,
    },
    {
      href: "/finanzas/contabilidad",
      title: "Contabilidad",
      description: "Plan de cuentas, asientos, libro mayor y períodos.",
      icon: BookText,
      count: null,
      countLabel: null,
      show: canSeeAccounting,
    },
    {
      href: "/finanzas/reportes",
      title: "Informes",
      description: "EERR, balance, ventas por cliente, rentabilidad.",
      icon: BarChart3,
      count: null,
      countLabel: null,
      show: canSeeReports,
    },
  ];

  const TONE_CLASSES: Record<string, { bg: string; fg: string; ring: string }> = {
    ok: {
      bg: "bg-status-ok-soft",
      fg: "text-status-ok-fg",
      ring: "ring-status-ok-border",
    },
    info: {
      bg: "bg-status-info-soft",
      fg: "text-status-info-fg",
      ring: "ring-status-info-border",
    },
    warn: {
      bg: "bg-status-warn-soft",
      fg: "text-status-warn-fg",
      ring: "ring-status-warn-border",
    },
    neutral: {
      bg: "bg-muted/40",
      fg: "text-foreground",
      ring: "ring-border",
    },
  };

  return (
    <div className="space-y-6 min-w-0">
      <PageHero
        icon={<Landmark />}
        iconTone="teal"
        title="Finanzas"
        subtitle="resumen del módulo"
        description="Rendiciones, compras y ventas, banca, contabilidad e informes."
      />

      {/* KPIs de cabecera — solo los que el usuario puede ver. */}
      {visibleHeadlineKpis.length > 0 && (
        <div
          className={cn(
            "grid gap-3 min-w-0",
            visibleHeadlineKpis.length === 1
              ? "grid-cols-1 sm:max-w-md"
              : visibleHeadlineKpis.length === 2
                ? "grid-cols-1 sm:grid-cols-2"
                : visibleHeadlineKpis.length === 3
                  ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                  : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
          )}
        >
          {visibleHeadlineKpis.map((k) => {
            const Icon = k.icon;
            const tone = TONE_CLASSES[k.tone];
            return (
              <Link key={k.label} href={k.href} className="block">
                <Surface elevation={1} padding="md" hoverable className="h-full">
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "p-2 rounded-ds-md shrink-0",
                        tone.bg,
                        tone.fg,
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-muted-foreground">
                        {k.label}
                      </p>
                      <p className="font-display text-xl sm:text-2xl font-semibold text-ds-text-1 ds-num mt-1 truncate">
                        {k.value}
                      </p>
                      <p className="text-[12px] text-ds-text-3 mt-0.5 truncate">
                        {k.sublabel}
                      </p>
                    </div>
                  </div>
                </Surface>
              </Link>
            );
          })}
        </div>
      )}

      {/* Cards de módulos */}
      <div>
        <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-muted-foreground mb-2">
          Módulos
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 min-w-0">
          {modules
            .filter((m) => m.show)
            .map((item) => {
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
                        <p className="font-display text-[14px] font-semibold text-ds-text-1">
                          {item.title}
                        </p>
                        <p className="text-[12px] text-ds-text-3 mt-0.5">
                          {item.description}
                        </p>
                        {item.count != null && (
                          <p className="font-display text-2xl font-bold text-ds-text-1 ds-num mt-2">
                            {item.count}
                          </p>
                        )}
                        {item.countLabel && (
                          <p className="text-[12px] text-ds-text-3 mt-0.5">
                            {item.countLabel}
                          </p>
                        )}
                      </div>
                    </div>
                  </Surface>
                </Link>
              );
            })}
        </div>
      </div>
    </div>
  );
}
