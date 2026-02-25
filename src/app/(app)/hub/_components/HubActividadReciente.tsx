import Link from 'next/link';
import { timeAgo } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { HubActividadRecienteProps } from '../_lib/hub-types';

function formatActivityAction(action: string): string {
  const map: Record<string, string> = {
    create: 'creó',
    update: 'actualizó',
    delete: 'eliminó',
    approve: 'aprobó',
    reject: 'rechazó',
    submit: 'envió',
    login: 'inició sesión',
    attendance_mark: 'marcó asistencia',
    profile_update: 'actualizó perfil',
    name_change: 'cambió nombre',
  };
  return map[action] || action;
}

function formatEntity(type: string): string {
  const map: Record<string, string> = {
    CrmLead: 'lead',
    CrmDeal: 'negocio',
    CrmContact: 'contacto',
    CrmAccount: 'cuenta',
    OpsTurnoExtra: 'turno extra',
    OpsGuardia: 'guardia',
    FinanceRendicion: 'rendición',
    Presentation: 'propuesta',
    User: 'usuario',
  };
  return map[type] || type;
}

const actionDotColor: Record<string, string> = {
  create: 'bg-emerald-500',
  update: 'bg-blue-500',
  delete: 'bg-red-500',
  approve: 'bg-purple-500',
  reject: 'bg-red-400',
  submit: 'bg-sky-500',
  login: 'bg-muted-foreground',
  attendance_mark: 'bg-emerald-400',
  profile_update: 'bg-blue-400',
  name_change: 'bg-blue-400',
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
          {activities.map((entry) => (
            <div
              key={entry.id}
              className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0 text-sm"
            >
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${actionDotColor[entry.action] || 'bg-muted-foreground'}`} />
              <span className="shrink-0 text-xs text-muted-foreground/70 tabular-nums mt-0.5">
                {timeAgo(entry.createdAt)}
              </span>
              <span className="min-w-0 text-muted-foreground">
                <span className="font-medium text-foreground">
                  {entry.userEmail?.split('@')[0] || 'Sistema'}
                </span>{' '}
                {formatActivityAction(entry.action)}{' '}
                {formatEntity(entry.entity)}
                {entry.entityId ? (
                  <span className="font-mono text-xs text-muted-foreground/70">
                    {' '}
                    {entry.entityId.slice(0, 8)}
                  </span>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
