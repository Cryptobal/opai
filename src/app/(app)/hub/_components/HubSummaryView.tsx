import { AgendaHubCard } from "@/components/agenda/AgendaHubCard";
import { HubEmailProvider } from "@/components/hub/hub-email-context";
import { RecentEmailCard } from "@/components/hub/RecentEmailCard";
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
import { HubMobileViewPicker } from "./HubMobileViewPicker";
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

/**
 * Inicio del Hub — mobile-first.
 *
 * Orden móvil (DOM): accesos directos → selector del Centro de Control →
 * Mi día (agenda + correos recientes) → Requiere atención → Pulso →
 * Actividad reciente. En desktop se recompone con `lg:order-*` para
 * mantener la lectura ejecutiva (pulso y alertas arriba).
 */
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
    <HubEmailProvider enabled={hubPerms.hasCrm}>
      <div className="ds-page-enter flex min-w-0 flex-col gap-5">
        {/* 1. Accesos directos */}
        <div className="min-w-0 lg:order-1">
          <HubQuickActions perms={hubPerms} />
        </div>

        {/* 2. Selector del Centro de Control (solo mobile) */}
        <div className="min-w-0 lg:order-1 lg:hidden">
          <HubMobileViewPicker />
        </div>

        {/* 3-4. Mi día: agenda + correos recientes */}
        <section
          className="min-w-0 space-y-3 lg:order-4"
          aria-labelledby="hub-my-day"
        >
          <SectionHeader
            title={<span id="hub-my-day">Mi día</span>}
            hint="Agenda, correos y compromisos de los próximos días."
          />
          {/* grid-cols-1 explícito: sin él, el track implícito `auto` crece
              al min-content de los textos nowrap (truncate) y las tarjetas
              se salen de la pantalla en móvil. minmax(0,1fr) lo impide. */}
          <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
            <AgendaHubCard />
            {hubPerms.hasCrm && <RecentEmailCard />}
          </div>
        </section>

        {/* 5. Requiere atención */}
        {alerts.length > 0 && (
          <section
            className="min-w-0 space-y-3 lg:order-2"
            aria-labelledby="hub-attention"
          >
            <SectionHeader
              title={<span id="hub-attention">Requiere atención</span>}
              hint="Señales accionables ordenadas por urgencia."
            />
            <HubAlertsBanner alerts={alerts} />
          </section>
        )}

        {/* 6. Pulso del negocio */}
        <section
          className="min-w-0 space-y-3 lg:order-3"
          aria-labelledby="hub-business-pulse"
        >
          <SectionHeader
            title={<span id="hub-business-pulse">Pulso del negocio</span>}
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

        {/* 7. Actividad reciente */}
        <section className="min-w-0 lg:order-5" aria-label="Actividad reciente">
          <HubActivitySection activities={activities} />
        </section>
      </div>
    </HubEmailProvider>
  );
}
