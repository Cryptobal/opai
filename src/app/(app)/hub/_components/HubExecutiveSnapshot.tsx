import {
  AlertTriangle,
  ClipboardList,
  Clock3,
  Route,
  ShieldUser,
  Users,
  Send,
  Target,
  Receipt,
  Wallet,
} from 'lucide-react';
import { HubKpiLinkCard } from './HubKpiLinkCard';
import type { HubExecutiveSnapshotProps } from '../_lib/hub-types';

/**
 * Role-adaptive KPI snapshot — selects up to 6 KPIs based on which modules
 * the user has access to. Ops-first when available, then CRM, then Finance.
 */
export function HubExecutiveSnapshot({
  perms,
  opsMetrics,
  crmMetrics,
  financeMetrics,
  docsSignals,
}: HubExecutiveSnapshotProps) {
  // Only show this snapshot when user has ops or mixed-module access.
  // Pure CRM users get their full CRM section (HubCrmSection) which has its own KPIs.
  // Pure docs-only users get HubDocsSection with its own KPIs.
  const hasOpsKpis = perms.hasOps && opsMetrics;
  const hasCrmKpis = perms.hasCrm && crmMetrics;
  const hasFinanceKpis = perms.hasFinance && financeMetrics;

  // Don't render if only CRM (CRM section already has its own 6 KPIs)
  if (!hasOpsKpis && !hasFinanceKpis) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-6">
      {/* Ops KPIs */}
      {hasOpsKpis && (
        <>
          <HubKpiLinkCard
            href="/crm/installations"
            title="Puestos Activos"
            value={opsMetrics.activePuestos}
            icon={<ClipboardList className="h-4 w-4" />}
            variant="blue"
          />
          <HubKpiLinkCard
            href="/ops/pauta-diaria"
            title="Cobertura Hoy"
            value={`${opsMetrics.attendance.coveragePercent}%`}
            icon={<ShieldUser className="h-4 w-4" />}
            trend={
              opsMetrics.attendance.coveragePercent >= 90
                ? 'up'
                : opsMetrics.attendance.coveragePercent >= 75
                  ? 'neutral'
                  : 'down'
            }
            trendValue={`${opsMetrics.attendance.present + opsMetrics.attendance.replacement}/${opsMetrics.attendance.total} posiciones`}
            variant={
              opsMetrics.attendance.coveragePercent >= 90 ? 'emerald' : 'amber'
            }
            titleInfoTooltip="Porcentaje de posiciones cubiertas (presente + reemplazo) sobre el total programado hoy."
          />
          <HubKpiLinkCard
            href="/personas/guardias"
            title="Guardias Activos"
            value={opsMetrics.activeGuardias}
            icon={<Users className="h-4 w-4" />}
            variant="sky"
          />
        </>
      )}

      {/* CRM KPIs (only when mixed with ops) */}
      {hasOpsKpis && hasCrmKpis && (
        <HubKpiLinkCard
          href="/crm/leads?status=pending"
          title="Leads Abiertos"
          value={crmMetrics.pendingLeadsCount}
          icon={<Target className="h-4 w-4" />}
          description={`${crmMetrics.leadsCreated30} nuevos en 30d`}
          variant="purple"
        />
      )}

      {/* Finance KPIs */}
      {hasFinanceKpis && (
        <HubKpiLinkCard
          href="/finanzas/aprobaciones"
          title="Rendiciones Pend."
          value={financeMetrics.pendingApprovalCount}
          icon={<Receipt className="h-4 w-4" />}
          variant="amber"
        />
      )}

      {/* More Ops KPIs if space */}
      {hasOpsKpis && (
        <>
          <HubKpiLinkCard
            href="/ops/refuerzos"
            title="Refuerzos Hoy"
            value={opsMetrics.refuerzosActivosHoy}
            icon={<Clock3 className="h-4 w-4" />}
            description={`${opsMetrics.refuerzosProximos} próximo(s)`}
            variant="purple"
          />
          {opsMetrics.pendingTE > 0 && (
            <HubKpiLinkCard
              href="/ops/turnos-extra"
              title="TE Pendientes"
              value={opsMetrics.pendingTE}
              icon={<Clock3 className="h-4 w-4" />}
              variant="purple"
            />
          )}
          <HubKpiLinkCard
            href="/ops/refuerzos"
            title="Pend. Facturar Refuerzo"
            value={`$${Math.round(opsMetrics.refuerzosPendientesFacturarAmount).toLocaleString("es-CL")}`}
            icon={<Wallet className="h-4 w-4" />}
            description={`${opsMetrics.refuerzosPendientesFacturarCount} solicitud(es)`}
            variant="amber"
          />
          {opsMetrics.unresolvedAlerts > 0 ? (
            <HubKpiLinkCard
              href="/ops/rondas/alertas"
              title="Alertas Ronda"
              value={opsMetrics.unresolvedAlerts}
              icon={<AlertTriangle className="h-4 w-4" />}
              trend="down"
              trendValue={
                opsMetrics.criticalAlerts > 0
                  ? `${opsMetrics.criticalAlerts} crítica(s)`
                  : 'Sin críticas'
              }
              variant="amber"
            />
          ) : (
            <HubKpiLinkCard
              href="/ops/rondas"
              title="Rondas Hoy"
              value={`${opsMetrics.rounds.completed}/${opsMetrics.rounds.scheduled}`}
              icon={<Route className="h-4 w-4" />}
              trend={
                opsMetrics.rounds.completionPercent >= 80
                  ? 'up'
                  : opsMetrics.rounds.completionPercent >= 50
                    ? 'neutral'
                    : 'down'
              }
              trendValue={`${opsMetrics.rounds.completionPercent}% completadas`}
              variant="emerald"
            />
          )}
        </>
      )}
    </div>
  );
}
