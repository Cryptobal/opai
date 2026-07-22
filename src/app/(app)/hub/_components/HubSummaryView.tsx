import { AgendaHubCard } from "@/components/agenda/AgendaHubCard";
import { SectionHeader } from "@/components/opai-ds";
import type {
  ActivityEntry,
  ClosingHubData,
  FinanceCaps,
  FinanceMetrics,
  HubAlert,
  HubPerms,
  OpsMetrics,
  TicketMetrics,
} from "../_lib/hub-types";
import { HubActivitySection } from "./HubActivitySection";
import { HubAlertsBanner } from "./HubAlertsBanner";
import { HubPulsoNegocio } from "./HubPulsoNegocio";
import { HubQuickActions } from "./HubQuickActions";

interface HubSummaryViewProps {
  hubPerms: HubPerms;
  closingData: ClosingHubData | null;
  financeMetrics: FinanceMetrics | null;
  financeCaps: FinanceCaps;
  opsMetrics: OpsMetrics | null;
  ticketMetrics: TicketMetrics;
  alerts: HubAlert[];
  activities: ActivityEntry[];
}

export function HubSummaryView({
  hubPerms,
  closingData,
  financeMetrics,
  financeCaps,
  opsMetrics,
  ticketMetrics,
  alerts,
  activities,
}: HubSummaryViewProps) {
  return (
    <div className="ds-page-enter min-w-0 space-y-5">
      <HubQuickActions perms={hubPerms} />
      <HubAlertsBanner alerts={alerts} />

      <section className="space-y-3" aria-labelledby="hub-business-pulse">
        <SectionHeader
          title={<span id="hub-business-pulse">Ahora</span>}
          hint="Indicadores transversales que requieren una lectura rápida."
        />
        <HubPulsoNegocio
          hubPerms={hubPerms}
          closingData={closingData}
          opsMetrics={opsMetrics}
          financeMetrics={financeMetrics}
          financeCaps={financeCaps}
          ticketMetrics={ticketMetrics}
        />
      </section>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
        <section className="min-w-0 space-y-3" aria-labelledby="hub-my-day">
          <SectionHeader
            title={<span id="hub-my-day">Mi día</span>}
            hint="Agenda, tareas y compromisos de los próximos días."
          />
          <AgendaHubCard />
        </section>

        <section className="min-w-0" aria-label="Actividad reciente">
          <HubActivitySection activities={activities} />
        </section>
      </div>
    </div>
  );
}
