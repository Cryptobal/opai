import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import {
  ShieldUser,
  ClipboardList,
  Users,
  UserPlus,
  AlertTriangle,
  Clock3,
  Route,
} from 'lucide-react';
import { HubKpiLinkCard } from './HubKpiLinkCard';
import { HubCompactStat } from './HubCompactStat';
import { HubCollapsibleSection } from './HubCollapsibleSection';
import type { OpsMetrics } from '../_lib/hub-types';

interface HubOperationsSectionProps {
  opsMetrics: OpsMetrics;
}

export function HubOperationsSection({ opsMetrics }: HubOperationsSectionProps) {
  const { attendance, rounds } = opsMetrics;
  const coveragePct = attendance.coveragePercent;
  const coverageColor =
    coveragePct >= 95 ? 'text-emerald-500 border-emerald-500/30' :
    coveragePct >= 80 ? 'text-amber-500 border-amber-500/30' :
    'text-red-500 border-red-500/30';
  const coverageBarColor =
    coveragePct >= 95 ? 'bg-emerald-500' :
    coveragePct >= 80 ? 'bg-amber-500' :
    'bg-red-500';
  const roundsBarColor =
    rounds.completionPercent >= 80 ? 'bg-emerald-500' :
    rounds.completionPercent >= 50 ? 'bg-amber-500' :
    'bg-red-500';

  return (
    <HubCollapsibleSection
      icon={<ShieldUser className="h-4 w-4" />}
      title="Operaciones"
      badge={
        <Badge variant="outline" className={`text-[10px] ${coverageColor}`}>
          {coveragePct}% cobertura
        </Badge>
      }
    >
      {/* KPI Cards 2-col grid */}
      <div className="grid grid-cols-2 gap-3">
        <HubKpiLinkCard
          href="/crm/installations"
          title="Puestos activos"
          value={opsMetrics.activePuestos}
          icon={<ClipboardList className="h-4 w-4" />}
          variant="blue"
        />
        <HubKpiLinkCard
          href="/ops/pauta-diaria"
          title="Cobertura hoy"
          value={`${coveragePct}%`}
          icon={<ShieldUser className="h-4 w-4" />}
          description={`${attendance.present + attendance.replacement}/${attendance.total} posiciones`}
          variant={coveragePct >= 95 ? 'emerald' : 'amber'}
          alert={coveragePct < 80}
        />
        <HubKpiLinkCard
          href="/personas/guardias"
          title="Guardias activos"
          value={opsMetrics.activeGuardias}
          icon={<Users className="h-4 w-4" />}
          variant="sky"
        />
        <HubKpiLinkCard
          href="/personas/guardias?filter=nuevos_mes"
          title="Guardias nuevos"
          value={opsMetrics.guardiasNuevosMes}
          icon={<UserPlus className="h-4 w-4" />}
          description="Este mes"
          variant="teal"
        />
        <HubKpiLinkCard
          href="/ops/ppc"
          title="PPC"
          value={opsMetrics.ppcGaps}
          icon={<AlertTriangle className="h-4 w-4" />}
          description="Puestos por cubrir"
          variant={opsMetrics.ppcGaps > 0 ? 'amber' : 'default'}
        />
        <HubKpiLinkCard
          href="/ops/refuerzos"
          title="Refuerzos hoy"
          value={opsMetrics.refuerzosActivosHoy}
          icon={<Clock3 className="h-4 w-4" />}
          description={`${opsMetrics.refuerzosProximos} proximo(s)`}
          variant="purple"
        />
      </div>

      {/* Sub-seccion: Asistencia hoy */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold">Asistencia hoy</p>
          <Link
            href="/ops/pauta-diaria"
            className="text-[10px] font-medium text-primary hover:underline"
          >
            Ver pauta diaria
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <HubCompactStat label="Presente" value={attendance.present} className="[&>p:last-child]:text-emerald-500" />
          <HubCompactStat label="Ausente" value={attendance.absent} className="[&>p:last-child]:text-red-400" />
          <HubCompactStat label="Pendiente" value={attendance.pending} className="[&>p:last-child]:text-amber-500" />
          <HubCompactStat label="Reemplazo" value={attendance.replacement} />
        </div>
      </div>

      {/* Sub-seccion: Rondas hoy */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold">Rondas hoy</p>
          <Link
            href="/ops/rondas"
            className="text-[10px] font-medium text-primary hover:underline"
          >
            Ver rondas
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
          <HubCompactStat label="Programadas" value={rounds.scheduled} />
          <HubCompactStat label="Completadas" value={rounds.completed} className="[&>p:last-child]:text-emerald-500" />
          <HubCompactStat label="En curso" value={rounds.inProgress} />
          <HubCompactStat label="Perdidas" value={rounds.missed} className="[&>p:last-child]:text-red-400" />
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{rounds.completionPercent}% completadas ({rounds.completed}/{rounds.scheduled})</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${roundsBarColor}`}
              style={{ width: `${Math.min(rounds.completionPercent, 100)}%` }}
            />
          </div>
        </div>
      </div>
    </HubCollapsibleSection>
  );
}
