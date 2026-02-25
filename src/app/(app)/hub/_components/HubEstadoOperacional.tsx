import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HubCompactStat } from './HubCompactStat';
import type { HubEstadoOperacionalProps } from '../_lib/hub-types';

export function HubEstadoOperacional({
  opsMetrics,
}: HubEstadoOperacionalProps) {
  const { attendance, rounds } = opsMetrics;

  const coverageColor = attendance.coveragePercent >= 90 ? 'bg-emerald-500' : attendance.coveragePercent >= 75 ? 'bg-amber-500' : 'bg-red-500';
  const roundsColor = rounds.completionPercent >= 80 ? 'bg-emerald-500' : rounds.completionPercent >= 50 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Attendance today */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Asistencia hoy</CardTitle>
            <Link
              href="/ops/pauta-diaria"
              className="text-xs font-medium text-primary hover:underline"
            >
              Ver pauta diaria
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <HubCompactStat label="Presente" value={attendance.present} className="[&>p:last-child]:text-emerald-500" />
            <HubCompactStat label="Ausente" value={attendance.absent} className="[&>p:last-child]:text-red-400" />
            <HubCompactStat label="Pendiente" value={attendance.pending} className="[&>p:last-child]:text-amber-500" />
            <HubCompactStat label="Reemplazo" value={attendance.replacement} />
          </div>
          {/* Coverage progress bar */}
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Cobertura: {attendance.coveragePercent}% (
                {attendance.present + attendance.replacement}/{attendance.total})
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${coverageColor}`}
                style={{ width: `${Math.min(attendance.coveragePercent, 100)}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Rounds today */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Rondas hoy</CardTitle>
            <Link
              href="/ops/rondas"
              className="text-xs font-medium text-primary hover:underline"
            >
              Ver rondas
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <HubCompactStat label="Programadas" value={rounds.scheduled} />
            <HubCompactStat label="Completadas" value={rounds.completed} className="[&>p:last-child]:text-emerald-500" />
            <HubCompactStat label="En curso" value={rounds.inProgress} />
            <HubCompactStat label="Perdidas" value={rounds.missed} className="[&>p:last-child]:text-red-400" />
          </div>
          {/* Completion progress bar */}
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Completadas: {rounds.completionPercent}% (
                {rounds.completed}/{rounds.scheduled})
              </span>
              {opsMetrics.unresolvedAlerts > 0 && (
                <Link
                  href="/ops/rondas/alertas"
                  className="font-medium text-amber-400 hover:underline"
                >
                  {opsMetrics.unresolvedAlerts} alerta(s) sin resolver
                </Link>
              )}
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${roundsColor}`}
                style={{ width: `${Math.min(rounds.completionPercent, 100)}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
