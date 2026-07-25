import Link from 'next/link';
import { timeAgo } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { humanizeActivity, DOMAIN_TONE } from '../_lib/hub-activity-format';
import type { HubActividadRecienteProps } from '../_lib/hub-types';

/** Punto de estado por dominio (tokens DS, sin hex). */
const DOMAIN_DOT: Record<keyof typeof DOMAIN_TONE, string> = {
  comercial: 'bg-tint-violet-fg',
  operaciones: 'bg-tint-sky-fg',
  personas: 'bg-tint-emerald-fg',
  finanzas: 'bg-tint-amber-fg',
  productividad: 'bg-tint-teal-fg',
  sistema: 'bg-tint-rose-fg',
};

export function HubActividadReciente({
  activities,
}: HubActividadRecienteProps) {
  if (activities.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Actividad reciente</CardTitle>
          <Link
            href="/opai/configuracion/audit"
            className="text-xs font-medium text-primary hover:underline"
          >
            Ver log completo
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-border/40">
          {activities.map((entry) => {
            const h = humanizeActivity({
              action: entry.action,
              entity: entry.entity,
              count: 1,
              userEmail: entry.userEmail,
            });
            return (
              <div
                key={entry.id}
                className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0 text-sm"
              >
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOMAIN_DOT[h.domain]}`}
                />
                <span className="shrink-0 text-xs text-muted-foreground/70 tabular-nums mt-0.5">
                  {timeAgo(entry.createdAt)}
                </span>
                <span className="min-w-0 text-muted-foreground">
                  <span className="font-medium text-foreground">{h.actor}</span>{' '}
                  {h.phrase}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
