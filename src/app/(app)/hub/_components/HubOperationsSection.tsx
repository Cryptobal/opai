import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import {
  ShieldUser,
  ClipboardList,
  Users,
  UserPlus,
  AlertTriangle,
  Clock3,
} from 'lucide-react';
import { HubKpiLinkCard } from './HubKpiLinkCard';
import { HubCollapsibleSection } from './HubCollapsibleSection';
import { HubMiniDonut } from './charts/HubMiniDonut';
import { HubSegmentedBar } from './charts/HubSegmentedBar';
import { HubSparkline } from './charts/HubSparkline';
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

  const attendanceSegments = [
    { value: attendance.present, color: '#10b981', label: 'Presente' },
    { value: attendance.replacement, color: '#3b82f6', label: 'Reemplazo' },
    { value: attendance.pending, color: '#f59e0b', label: 'Pendiente' },
    { value: attendance.absent, color: '#ef4444', label: 'Ausente' },
  ];

  const roundsSegments = [
    { value: rounds.completed, color: '#10b981', label: 'Completadas' },
    { value: rounds.inProgress, color: '#3b82f6', label: 'En curso' },
    { value: rounds.missed, color: '#ef4444', label: 'Perdidas' },
    {
      value: Math.max(0, rounds.scheduled - rounds.completed - rounds.inProgress - rounds.missed),
      color: 'rgba(255,255,255,0.15)',
      label: 'Pendientes',
    },
  ];

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
          description="Puestos sin guardia hoy"
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

      {/* Sub-seccion: Asistencia hoy con donut */}
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
        <div className="rounded-lg border border-border bg-card p-3 flex items-center gap-4">
          <HubMiniDonut
            segments={attendanceSegments}
            centerValue={`${coveragePct}%`}
            centerLabel="cobertura"
            size={96}
            thickness={12}
          />
          <div className="flex-1 min-w-0 grid grid-cols-2 gap-x-3 gap-y-1.5">
            {attendanceSegments.map((seg) => (
              <div key={seg.label} className="flex items-center gap-1.5 min-w-0">
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: seg.color }}
                />
                <span className="text-[11px] text-muted-foreground truncate">
                  {seg.label}{' '}
                  <span className="font-bold tabular-nums text-foreground">
                    {seg.value}
                  </span>
                </span>
              </div>
            ))}
          </div>
          {opsMetrics.attendanceTrend7d && opsMetrics.attendanceTrend7d.length > 0 && (
            <div className="hidden sm:flex flex-col items-end gap-1">
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
                7d
              </span>
              <HubSparkline
                data={opsMetrics.attendanceTrend7d}
                color="#10b981"
                width={64}
                height={22}
              />
            </div>
          )}
        </div>
      </div>

      {/* Sub-seccion: Rondas hoy con barra segmentada */}
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
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] text-muted-foreground">
              {rounds.completionPercent}% completadas ({rounds.completed}/{rounds.scheduled})
            </span>
            {opsMetrics.roundsTrend7d && opsMetrics.roundsTrend7d.length > 0 && (
              <HubSparkline
                data={opsMetrics.roundsTrend7d}
                color="#3b82f6"
                width={56}
                height={18}
              />
            )}
          </div>
          <HubSegmentedBar segments={roundsSegments} />
        </div>
      </div>
    </HubCollapsibleSection>
  );
}
