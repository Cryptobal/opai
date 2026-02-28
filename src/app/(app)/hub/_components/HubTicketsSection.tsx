import Link from 'next/link';
import {
  Ticket,
  Clock3,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Flame,
  UserX,
  ArrowRight,
} from 'lucide-react';
import { HubKpiLinkCard } from './HubKpiLinkCard';
import { HubCollapsibleSection } from './HubCollapsibleSection';
import type { HubTicketsSectionProps } from '../_lib/hub-types';

const PRIORITY_COLORS: Record<string, string> = {
  p1: 'text-red-500',
  p2: 'text-orange-500',
  p3: 'text-yellow-500',
  p4: 'text-blue-400',
};

export function HubTicketsSection({ ticketMetrics }: HubTicketsSectionProps) {
  if (!ticketMetrics.moduleActive) {
    return (
      <HubCollapsibleSection
        icon={<Ticket className="h-4 w-4" />}
        title="Tickets"
      >
        <div className="py-4 text-center">
          <p className="text-xs text-muted-foreground">
            Modulo de tickets pendiente de integracion
          </p>
        </div>
      </HubCollapsibleSection>
    );
  }

  const activeTotal = ticketMetrics.openCount + ticketMetrics.inProgressCount;
  const hasCritical = ticketMetrics.breachedCount > 0 || ticketMetrics.p1PendingCount > 0;

  return (
    <HubCollapsibleSection
      icon={<Ticket className="h-4 w-4" />}
      title="Tickets"
      badge={
        activeTotal > 0 ? (
          <span
            className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
              hasCritical
                ? 'bg-red-500/20 text-red-400'
                : 'bg-primary/15 text-primary'
            }`}
          >
            {activeTotal}
          </span>
        ) : undefined
      }
    >
      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <HubKpiLinkCard
          href="/ops/tickets?status=open"
          title="Abiertos"
          value={ticketMetrics.openCount}
          icon={<AlertCircle className="h-4 w-4" />}
          variant={ticketMetrics.openCount > 0 ? 'amber' : 'default'}
        />
        <HubKpiLinkCard
          href="/ops/tickets?status=in_progress"
          title="En progreso"
          value={ticketMetrics.inProgressCount}
          icon={<Clock3 className="h-4 w-4" />}
          variant="blue"
        />
        <HubKpiLinkCard
          href="/ops/tickets?status=resolved&period=today"
          title="Resueltos hoy"
          value={ticketMetrics.resolvedTodayCount}
          icon={<CheckCircle2 className="h-4 w-4" />}
          variant="emerald"
        />
        {ticketMetrics.breachedCount > 0 && (
          <HubKpiLinkCard
            href="/ops/tickets?sla=breached"
            title="SLA vencidos"
            value={ticketMetrics.breachedCount}
            icon={<AlertTriangle className="h-4 w-4" />}
            variant="red"
            alert
          />
        )}
        {ticketMetrics.p1PendingCount > 0 && (
          <HubKpiLinkCard
            href="/ops/tickets?priority=p1"
            title="P1 pendientes"
            value={ticketMetrics.p1PendingCount}
            icon={<Flame className="h-4 w-4" />}
            variant="red"
          />
        )}
        {ticketMetrics.unassignedCount > 0 && (
          <HubKpiLinkCard
            href="/ops/tickets?assigned=unassigned"
            title="Sin asignar"
            value={ticketMetrics.unassignedCount}
            icon={<UserX className="h-4 w-4" />}
            variant="amber"
          />
        )}
      </div>

      {/* Urgent Tickets List */}
      {ticketMetrics.urgentTickets.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Requieren atencion
          </h4>
          <div className="space-y-1">
            {ticketMetrics.urgentTickets.map((ticket) => (
              <Link
                key={ticket.id}
                href={`/ops/tickets/${ticket.id}`}
                className="flex items-center gap-2 rounded-lg border border-border/50 bg-[#161b22] p-2 transition-colors hover:bg-[#1c2333]"
              >
                <span
                  className={`text-[9px] font-bold ${PRIORITY_COLORS[ticket.priority] ?? 'text-muted-foreground'}`}
                >
                  {ticket.priority.toUpperCase()}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                  {ticket.code}
                </span>
                <span className="text-[11px] truncate flex-1">{ticket.title}</span>
                {ticket.slaDueAt && new Date(ticket.slaDueAt) < new Date() && (
                  <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />
                )}
              </Link>
            ))}
          </div>
          <Link
            href="/ops/tickets"
            className="flex items-center gap-1 text-[11px] text-primary hover:underline pt-1"
          >
            Ver todos
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </HubCollapsibleSection>
  );
}
