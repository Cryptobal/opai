import { getGreeting } from '../_lib/hub-utils';
import type { HubGreetingProps } from '../_lib/hub-types';

export function HubGreeting({
  firstName,
  perms,
  opsMetrics,
  crmMetrics,
  financeMetrics,
}: HubGreetingProps) {
  const greeting = getGreeting();

  // Build adaptive subtitle with most relevant info
  const parts: string[] = [];

  if (opsMetrics && perms.hasOps) {
    if (opsMetrics.criticalAlerts > 0) {
      parts.push(`${opsMetrics.criticalAlerts} alerta(s) crítica(s)`);
    }
    if (opsMetrics.attendance.absent > 0) {
      parts.push(`${opsMetrics.attendance.absent} ausencia(s) hoy`);
    }
    if (opsMetrics.pendingTE > 0) {
      parts.push(`${opsMetrics.pendingTE} TE por aprobar`);
    }
  }

  if (crmMetrics && perms.hasCrm) {
    if (crmMetrics.followUpsOverdueCount > 0) {
      parts.push(
        `${crmMetrics.followUpsOverdueCount} seguimiento(s) vencido(s)`,
      );
    } else if (crmMetrics.pendingLeadsCount > 0) {
      parts.push(`${crmMetrics.pendingLeadsCount} leads abiertos`);
    }
  }

  if (financeMetrics && perms.hasFinance) {
    if (financeMetrics.pendingApprovalCount > 0) {
      parts.push(
        `${financeMetrics.pendingApprovalCount} rendición(es) pendiente(s)`,
      );
    }
  }

  const subtitle =
    parts.length > 0
      ? parts.join(' · ')
      : 'Centro de control operacional.';

  return (
    <div className="rounded-xl border border-primary/10 bg-gradient-to-r from-primary/5 via-transparent to-primary/3 p-5 sm:p-6">
      <h1 className="text-2xl font-bold tracking-tight sm:text-2xl">
        {greeting}, {firstName}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      <div className="mt-3 h-1 w-20 rounded-full bg-gradient-to-r from-primary to-primary/40" />
    </div>
  );
}
