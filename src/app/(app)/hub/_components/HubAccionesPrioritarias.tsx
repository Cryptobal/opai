import Link from 'next/link';
import {
  CheckCircle2,
  ChevronRight,
  Clock3,
  AlertTriangle,
  UserRoundCheck,
  Receipt,
} from 'lucide-react';
import type { HubAccionesPrioritariasProps } from '../_lib/hub-types';

interface ActionItem {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  show: boolean;
}

export function HubAccionesPrioritarias({
  perms,
  opsMetrics,
  financeMetrics,
}: HubAccionesPrioritariasProps) {
  const actions: ActionItem[] = [
    {
      id: 'approve-te',
      label: `Aprobar ${opsMetrics?.pendingTE ?? 0} turno(s) extra`,
      href: '/ops/turnos-extra',
      icon: Clock3,
      color: 'text-purple-400 bg-purple-400/10',
      show:
        perms.canApproveTE &&
        opsMetrics != null &&
        opsMetrics.pendingTE > 0,
    },
    {
      id: 'resolve-alerts',
      label: `Resolver ${opsMetrics?.unresolvedAlerts ?? 0} alerta(s) de ronda`,
      href: '/ops/rondas/alertas',
      icon: AlertTriangle,
      color: 'text-amber-400 bg-amber-400/10',
      show:
        perms.hasOps &&
        opsMetrics != null &&
        opsMetrics.unresolvedAlerts > 0,
    },
    {
      id: 'mark-attendance',
      label: 'Marcar asistencia hoy',
      href: '/ops/pauta-diaria',
      icon: UserRoundCheck,
      color: 'text-emerald-400 bg-emerald-400/10',
      show:
        perms.canMarkAttendance &&
        opsMetrics != null &&
        opsMetrics.attendance.pending > 0,
    },
    {
      id: 'review-rendiciones',
      label: `Revisar ${financeMetrics?.pendingApprovalCount ?? 0} rendición(es)`,
      href: '/finanzas/aprobaciones',
      icon: Receipt,
      color: 'text-blue-400 bg-blue-400/10',
      show:
        perms.canApproveRendicion &&
        financeMetrics != null &&
        financeMetrics.pendingApprovalCount > 0,
    },
  ];

  const visible = actions.filter((a) => a.show).slice(0, 6);

  if (visible.length === 0) return null;

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {visible.map((action) => (
        <Link
          key={action.id}
          href={action.href}
          className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/40"
        >
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${action.color}`}
          >
            <action.icon className="h-4 w-4" />
          </div>
          <span className="min-w-0 flex-1 text-sm font-medium">
            {action.label}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
      ))}
    </div>
  );
}
