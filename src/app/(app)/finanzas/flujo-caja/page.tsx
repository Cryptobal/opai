import { auth } from "@/lib/auth";
import { resolvePagePerms, hasCapability } from "@/lib/permissions-server";
import { redirect } from "next/navigation";
import { PageHero, Surface } from "@/components/opai-ds";
import { Wallet, TrendingUp, TrendingDown, AlertTriangle, Settings } from "lucide-react";
import Link from "next/link";
import { getOrCreateCashflowConfig } from "@/modules/finance/cashflow/config.service";
import { buildProjection } from "@/modules/finance/cashflow/projection.service";
import { addWeeks } from "date-fns";
import { CashflowTabs } from "@/components/finance/cashflow/CashflowTabs";

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

  type ToneKey = "ok" | "info" | "warn";
  const kpis: Array<{
    label: string;
    value: string;
    tone: ToneKey;
    icon: typeof Wallet;
    sub: string;
  }> = [
    { label: "Saldo actual", value: fmtCLP.format(opening), tone: "info", icon: Wallet, sub: "consolidado bancos CLP" },
    { label: "Saldo proyectado", value: fmtCLP.format(finalBalance), tone: finalBalance >= 0 ? "ok" : "warn", icon: TrendingUp, sub: `en ${weeks} semanas` },
    { label: "Ingresos del horizonte", value: fmtCLP.format(totalIncome), tone: "ok", icon: TrendingUp, sub: `${weeks} sem` },
    { label: "Egresos del horizonte", value: fmtCLP.format(totalExpense), tone: "warn", icon: TrendingDown, sub: `${weeks} sem` },
  ];

  if (firstNegative) {
    kpis.push({
      label: "Próximo gap",
      value: fmtCLP.format(firstNegative.balanceClp),
      tone: "warn",
      icon: AlertTriangle,
      sub: firstNegative.bucketKey,
    });
  }

  const TONE: Record<ToneKey, { bg: string; fg: string }> = {
    ok: { bg: "bg-status-ok-soft", fg: "text-status-ok-fg" },
    info: { bg: "bg-status-info-soft", fg: "text-status-info-fg" },
    warn: { bg: "bg-status-warn-soft", fg: "text-status-warn-fg" },
  };

  return (
    <div className="space-y-5 min-w-0">
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

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {kpis.map((k) => {
          const Icon = k.icon;
          const tone = TONE[k.tone];
          return (
            <Surface key={k.label} elevation={1} padding="md">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-ds-md shrink-0 ${tone.bg} ${tone.fg}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-muted-foreground">
                    {k.label}
                  </p>
                  <p className="font-display text-xl font-semibold text-ds-text-1 ds-num mt-1 truncate">
                    {k.value}
                  </p>
                  <p className="text-[12px] text-ds-text-3 mt-0.5 truncate">{k.sub}</p>
                </div>
              </div>
            </Surface>
          );
        })}
      </div>

      <CashflowTabs
        initialProjection={JSON.parse(JSON.stringify(projection))}
        canManage={canManage}
        defaultWeeks={config.horizonWeeksDefault}
        defaultMonths={config.horizonMonthsDefault}
      />
    </div>
  );
}
