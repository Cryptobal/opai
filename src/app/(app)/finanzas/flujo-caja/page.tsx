import { auth } from "@/lib/auth";
import { resolvePagePerms, hasCapability } from "@/lib/permissions-server";
import { redirect } from "next/navigation";
import { PageHero } from "@/components/opai-ds";
import { Wallet, Settings } from "lucide-react";
import Link from "next/link";
import { getOrCreateCashflowConfig } from "@/modules/finance/cashflow/config.service";
import { buildProjection } from "@/modules/finance/cashflow/projection.service";
import { ensureCashflowSynced } from "@/modules/finance/cashflow/auto-sync";
import { addWeeks } from "date-fns";
import { CashflowTabs } from "@/components/finance/cashflow/CashflowTabs";
import { CashflowKpis, type KpiData } from "@/components/finance/cashflow/CashflowKpis";
import { bucketKeyFor } from "@/modules/finance/cashflow/recurrence-engine";

export default async function FlujoCajaPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; weeks?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/finanzas/flujo-caja");
  const perms = await resolvePagePerms(session.user);
  if (!hasCapability(perms, "cashflow_view")) redirect("/finanzas");

  const sp = await searchParams;
  const tenantId = session.user.tenantId;
  const config = await getOrCreateCashflowConfig(tenantId);
  const canManage = hasCapability(perms, "cashflow_manage");
  const canConfigure = hasCapability(perms, "cashflow_configure");

  // Self-heal: si detectamos drift entre datos fuente (quotes, dotación,
  // templates DTE) y items materializados, sincroniza inline ANTES de
  // construir la proyección. Idempotente y barato cuando ya está OK
  // (~50ms de counts); paga ~2-5s solo en el primer load post-deploy.
  // El cron nightly cubre IVA/TURNOS_EXTRA y refresh de montos.
  await ensureCashflowSynced(tenantId);

  const weeks = Math.max(8, Math.min(104, Number(sp.weeks) || config.horizonWeeksDefault));
  const today = new Date();
  const projection = await buildProjection(tenantId, {
    from: today,
    to: addWeeks(today, weeks),
    granularity: "weekly",
  });

  const fmtCLP = new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    minimumFractionDigits: 0,
  });

  const opening = projection.openingBalanceClp;
  const finalBalance = projection.cumulativeBalances.at(-1)?.balanceClp ?? opening;
  const firstNegative = projection.cumulativeBalances.find((b) => b.balanceClp < 0);
  const totalIncome = projection.totals.totalIncome;
  const totalExpense = projection.totals.totalExpense;

  const kpis: KpiData[] = [
    { label: "Saldo actual", value: fmtCLP.format(opening), tone: "info", icon: "wallet", sub: "consolidado bancos CLP" },
    { label: "Saldo proyectado", value: fmtCLP.format(finalBalance), tone: finalBalance >= 0 ? "ok" : "warn", icon: "up", sub: `en ${weeks} semanas` },
    { label: "Ingresos del horizonte", value: fmtCLP.format(totalIncome), tone: "ok", icon: "up", sub: `${weeks} sem` },
    { label: "Egresos del horizonte", value: fmtCLP.format(totalExpense), tone: "warn", icon: "down", sub: `${weeks} sem` },
  ];

  if (firstNegative) {
    kpis.push({
      label: "Próximo gap",
      value: fmtCLP.format(firstNegative.balanceClp),
      tone: "warn",
      icon: "alert",
      sub: firstNegative.bucketKey,
    });
  }

  // KPI de cuadratura: real banco vs proyectado de la semana corriente.
  const currentWeekKey = bucketKeyFor(today, "weekly");
  const currentWeek = projection.buckets.find((b) => b.key === currentWeekKey);
  if (currentWeek) {
    const variance = currentWeek.bankVarianceClp;
    const isFlat = Math.abs(variance) < 50_000;
    const tone: KpiData["tone"] = isFlat ? "ok" : variance > 0 ? "info" : "warn";
    const icon: KpiData["icon"] = isFlat ? "ok" : variance > 0 ? "up" : "down";
    kpis.push({
      label: "Cuadratura semana",
      value: isFlat ? "✓ Cuadrada" : fmtCLP.format(variance),
      tone,
      icon,
      sub: isFlat
        ? "real ≈ proyectado"
        : variance > 0
          ? "real > proyectado"
          : "real < proyectado",
    });
  }

  return (
    <div className="space-y-3 sm:space-y-5 min-w-0">
      <PageHero
        icon={<Wallet />}
        iconTone="teal"
        title="Flujo de Caja"
        subtitle="proyección y análisis"
        description="Forecast semanal y mensual de ingresos y egresos. Vincula proyecciones con movimientos bancarios reales."
        actions={
          canConfigure ? (
            <Link
              href="/opai/configuracion/finanzas/flujo-caja"
              className="inline-flex items-center gap-1.5 text-[13px] text-ds-text-2 hover:text-ds-text-1"
            >
              <Settings className="h-4 w-4" /> Configurar
            </Link>
          ) : null
        }
      />

      <CashflowKpis kpis={kpis} />

      <CashflowTabs
        initialProjection={JSON.parse(JSON.stringify(projection))}
        canManage={canManage}
        defaultWeeks={config.horizonWeeksDefault}
        defaultMonths={config.horizonMonthsDefault}
      />
    </div>
  );
}
