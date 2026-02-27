import { Ticket, Clock3, CheckCircle2, AlertCircle } from 'lucide-react';
import { HubKpiLinkCard } from './HubKpiLinkCard';
import { HubCollapsibleSection } from './HubCollapsibleSection';
import type { HubTicketsSectionProps } from '../_lib/hub-types';

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

  return (
    <HubCollapsibleSection
      icon={<Ticket className="h-4 w-4" />}
      title="Tickets"
    >
      <div className="grid grid-cols-3 gap-3">
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
      </div>
    </HubCollapsibleSection>
  );
}
