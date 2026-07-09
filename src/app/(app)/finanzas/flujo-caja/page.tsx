import { auth } from "@/lib/auth";
import { resolvePagePerms, hasCapability } from "@/lib/permissions-server";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { Settings, ArrowLeftRight } from "lucide-react";
import Link from "next/link";
import { getOrCreateCashflowConfig } from "@/modules/finance/cashflow/config.service";
import { buildProjection } from "@/modules/finance/cashflow/projection.service";
import { listRecentCloses } from "@/modules/finance/cashflow/weekly-close.service";
import { ensureCashflowSynced } from "@/modules/finance/cashflow/auto-sync";
import { addWeeks, subWeeks } from "date-fns";
import { CashflowTabs } from "@/components/finance/cashflow/CashflowTabs";
import { CashflowKpis, type KpiData } from "@/components/finance/cashflow/CashflowKpis";
import { BancaTabsHeader } from "@/components/finance/BancaTabsHeader";
import { OpeningAnchorCard } from "@/components/finance/cashflow/OpeningAnchorCard";
import { CashflowV2Shell } from "@/components/finance/cashflow/v2/CashflowV2Shell";

// Semanas del primer render en el server. Total = 8 (BACK + hoy + FORWARD).
// El horizonte completo (config.horizonWeeksDefault) solo se pide bajo
// demanda; ver el cálculo de la ventana más abajo.
const INITIAL_WEEKS_FORWARD = 6;
const INITIAL_WEEKS_BACK = 2;

export default async function FlujoCajaPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; weeks?: string; weeksBack?: string; v?: string }>;
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
  // templates DTE) y items materializados, sincroniza silenciosamente. Se
  // agenda con `after()` para correr DESPUÉS de emitir el render y no
  // bloquear el primer paint (antes se hacía inline y pagaba ~2-5s en el
  // primer load post-deploy). Idempotente y best-effort: nunca lanza al
  // caller y su retorno se descarta, así que sacarlo del camino crítico no
  // cambia lo que se pinta. El cron nightly cubre IVA/TURNOS_EXTRA y refresh
  // de montos; la proyección de este render usa los datos ya materializados.
  after(() => ensureCashflowSynced(tenantId));

  // Ventana inicial liviana: el primer render del server proyecta solo 8
  // semanas (INITIAL_WEEKS_BACK atrás + hoy + INITIAL_WEEKS_FORWARD adelante)
  // en vez de las 54 del horizonte completo (52 fwd + 2 back). El resto de
  // semanas se trae bajo demanda vía GET /api/finance/cashflow/projection
  // (from/to) desde la grilla (patrón fetchWeeklyRange de la v2). Sin este
  // recorte se disparaban ~20 queries por el rango completo en cada carga.
  //
  // Overrides por query string: si llegan ?weeks / ?weeksBack se respetan con
  // el mismo clamp de antes ([8, 104] y [0, 52]); solo cambia el default.
  const weeks =
    sp.weeks !== undefined && sp.weeks !== ""
      ? Math.max(8, Math.min(104, Number(sp.weeks) || config.horizonWeeksDefault))
      : INITIAL_WEEKS_FORWARD;
  const rawWeeksBack =
    sp.weeksBack !== undefined && sp.weeksBack !== ""
      ? Number(sp.weeksBack)
      : INITIAL_WEEKS_BACK;
  const weeksBack = Math.max(
    0,
    Math.min(52, isFinite(rawWeeksBack) ? rawWeeksBack : INITIAL_WEEKS_BACK),
  );
  const today = new Date();
  const projection = await buildProjection(tenantId, {
    from: weeksBack > 0 ? subWeeks(today, weeksBack) : today,
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

  // KPI de drift acumulado: saldo banco real vs saldo proyectado a hoy.
  const drift = projection.totals.currentDriftClp;
  if (drift !== null) {
    const absDrift = Math.abs(drift);
    const isFlat = absDrift < 50_000;
    const tone: KpiData["tone"] = isFlat
      ? "ok"
      : absDrift < 500_000
        ? "info"
        : "warn";
    const icon: KpiData["icon"] = isFlat
      ? "ok"
      : drift > 0
        ? "up"
        : "down";
    kpis.push({
      label: "Drift de caja",
      value: isFlat ? "✓ Cuadrado" : fmtCLP.format(drift),
      tone,
      icon,
      sub: isFlat
        ? "banco ≈ proyectado"
        : drift > 0
          ? "banco > proyectado"
          : "banco < proyectado",
      // La cuadratura ahora se abre como modal desde la grilla principal.
      href: "/finanzas/flujo-caja",
    });
  }

  // Flujo de Caja v2 es ahora la pantalla por defecto. ?v=1 cae a la vista
  // anterior (fallback que se retira un sprint después). v2 se monta sobre la
  // MISMA proyección; la serialización JSON convierte las fechas a ISO string
  // (el shell las consume con new Date()), igual que CashflowTabs.
  if (sp.v !== "1") {
    const recentCloses = await listRecentCloses(tenantId, 6);
    return (
      <div className="space-y-4 min-w-0">
        <CashflowV2Shell
          projection={JSON.parse(JSON.stringify(projection))}
          canManage={canManage}
          anchor={projection.anchor}
          recentCloses={JSON.parse(JSON.stringify(recentCloses))}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 min-w-0">
      <BancaTabsHeader active="cashflow" />

      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Flujo de Caja</h1>
          <p className="text-xs text-muted-foreground">
            Forecast semanal y mensual de ingresos y egresos
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/finanzas/flujo-caja/cuadratura"
            className="inline-flex items-center gap-1.5 text-[13px] text-ds-text-2 hover:text-ds-text-1"
          >
            <ArrowLeftRight className="h-4 w-4" /> Cuadratura
          </Link>
          {canConfigure ? (
            <Link
              href="/opai/configuracion/finanzas/flujo-caja"
              className="inline-flex items-center gap-1.5 text-[13px] text-ds-text-2 hover:text-ds-text-1"
            >
              <Settings className="h-4 w-4" /> Configurar
            </Link>
          ) : null}
        </div>
      </div>

      <OpeningAnchorCard />

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
