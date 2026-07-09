import { auth } from "@/lib/auth";
import { resolvePagePerms, hasCapability } from "@/lib/permissions-server";
import { redirect } from "next/navigation";
import { after } from "next/server";
import {
  getOrCreateCashflowConfig,
  resolveWeeksBackDefault,
} from "@/modules/finance/cashflow/config.service";
import { buildProjection } from "@/modules/finance/cashflow/projection.service";
import { listRecentCloses } from "@/modules/finance/cashflow/weekly-close.service";
import { ensureCashflowSynced } from "@/modules/finance/cashflow/auto-sync";
import { addWeeks, subWeeks } from "date-fns";
import { CashflowGrid } from "@/components/finance/cashflow/v2/CashflowGrid";

// Semanas del primer render en el server. Total = 8 (BACK + hoy + FORWARD).
// El horizonte completo (config.horizonWeeksDefault) solo se pide bajo
// demanda; ver el cálculo de la ventana más abajo.
const INITIAL_WEEKS_FORWARD = 6;
const INITIAL_WEEKS_BACK = 2;

export default async function FlujoCajaPage({
  searchParams,
}: {
  searchParams: Promise<{ weeks?: string; weeksBack?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/finanzas/flujo-caja");
  const perms = await resolvePagePerms(session.user);
  if (!hasCapability(perms, "cashflow_view")) redirect("/finanzas");

  const sp = await searchParams;
  const tenantId = session.user.tenantId;
  const config = await getOrCreateCashflowConfig(tenantId);
  const canManage = hasCapability(perms, "cashflow_manage");

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
  // B6: la ventana hacia atrás por defecto vendrá de la preferencia del tenant
  // (config.weeksBackDefault, migración pendiente de aprobación). Hoy el
  // resolver devuelve INITIAL_WEEKS_BACK como fallback; cuando la migración se
  // aplique, respetará la preferencia sin tocar este call site.
  const weeksBackDefault = resolveWeeksBackDefault(config, INITIAL_WEEKS_BACK);
  const rawWeeksBack =
    sp.weeksBack !== undefined && sp.weeksBack !== ""
      ? Number(sp.weeksBack)
      : weeksBackDefault;
  const weeksBack = Math.max(
    0,
    Math.min(52, isFinite(rawWeeksBack) ? rawWeeksBack : weeksBackDefault),
  );
  const today = new Date();
  const projection = await buildProjection(tenantId, {
    from: weeksBack > 0 ? subWeeks(today, weeksBack) : today,
    to: addWeeks(today, weeks),
    granularity: "weekly",
  });
  const recentCloses = await listRecentCloses(tenantId, 6);

  // Grilla densa (planilla) como vista por defecto. Reemplaza a CashflowV2Shell
  // y a la ruta legacy `?v=1` (CashflowTabs/WeeklyMatrix/MonthlyMatrix), ambas
  // retiradas. La proyección se serializa a JSON (fechas → ISO string; la
  // grilla las consume con toDate()).
  return (
    <div className="space-y-4 min-w-0">
      <CashflowGrid
        projection={JSON.parse(JSON.stringify(projection))}
        canManage={canManage}
        anchor={projection.anchor}
        recentCloses={JSON.parse(JSON.stringify(recentCloses))}
        weeksBack={weeksBack}
      />
    </div>
  );
}
