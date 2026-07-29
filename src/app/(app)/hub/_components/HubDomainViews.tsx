import { AgendaHubCard } from "@/components/agenda/AgendaHubCard";
import type {
  AtsMetrics,
  ClosingHubData,
  FinanceCaps,
  FinanceMetrics,
  HubPerms,
  OpsMetrics,
  PayrollMetrics,
  PersonasMetrics,
  SupervisionMetrics,
  TicketMetrics,
  UpcomingProject,
} from "../_lib/hub-types";
import { HubAtsSection } from "./HubAtsSection";
import { HubContratosClienteSection } from "./HubContratosClienteSection";
import { HubCrmSection } from "./HubCrmSection";
import { HubDomainHeader } from "./HubDomainHeader";
import { HubFinanzasSection } from "./HubFinanzasSection";
import { HubInstallationHealthSection } from "./HubInstallationHealthSection";
import { HubOperationsSection } from "./HubOperationsSection";
import { HubPayrollSection } from "./HubPayrollSection";
import { HubPersonasSection } from "./HubPersonasSection";
import { HubSupervisionSection } from "./HubSupervisionSection";
import { HubTicketsSection } from "./HubTicketsSection";

export function HubCommercialView({
  hubPerms,
  closingData,
  sellerFirstName,
  upcomingProjects,
}: {
  hubPerms: HubPerms;
  closingData: ClosingHubData;
  sellerFirstName: string;
  upcomingProjects: UpcomingProject[];
}) {
  return (
    <div className="ds-page-enter min-w-0 space-y-5">
      {/* "Control comercial" = dashboard del Hub; "Abrir Comercial" = CRM real */}
      <HubDomainHeader
        title="Control comercial"
        hint="Agenda, borradores, negociación, contratos y servicios por iniciar."
        moduleHref="/crm"
        moduleLabel="Abrir Comercial"
      />

      <div className="min-w-0">
        <AgendaHubCard />
      </div>

      <HubCrmSection
        perms={hubPerms}
        closingData={closingData}
        sellerFirstName={sellerFirstName}
        upcomingProjects={upcomingProjects}
      />

      <HubContratosClienteSection />
    </div>
  );
}

export function HubOperationsView({
  opsMetrics,
  ticketMetrics,
  supervisionMetrics,
}: {
  opsMetrics: OpsMetrics;
  ticketMetrics: TicketMetrics;
  supervisionMetrics: SupervisionMetrics | null;
}) {
  return (
    <div className="ds-page-enter min-w-0 space-y-5">
      <HubDomainHeader
        title="Control operacional"
        hint="Cobertura, tickets, rondas, supervisión y salud de instalaciones."
        moduleHref="/ops"
        moduleLabel="Abrir Operaciones"
      />

      <HubOperationsSection opsMetrics={opsMetrics} />
      <HubTicketsSection ticketMetrics={ticketMetrics} />
      {supervisionMetrics ? (
        <HubSupervisionSection metrics={supervisionMetrics} />
      ) : null}
      <HubInstallationHealthSection />
    </div>
  );
}

export function HubFinanceView({
  financeMetrics,
  financeCaps,
  opsMetrics,
}: {
  financeMetrics: FinanceMetrics;
  financeCaps: FinanceCaps;
  opsMetrics: OpsMetrics | null;
}) {
  return (
    <div className="ds-page-enter min-w-0 space-y-5">
      <HubDomainHeader
        title="Control financiero"
        hint="Caja, flujo semanal, facturación, cobranza y rendiciones."
        moduleHref="/finanzas"
        moduleLabel="Abrir Finanzas"
      />
      <HubFinanzasSection
        financeMetrics={financeMetrics}
        financeCaps={financeCaps}
        opsMetrics={opsMetrics}
      />
    </div>
  );
}

export function HubPeopleView({
  personasMetrics,
  atsMetrics,
}: {
  personasMetrics: PersonasMetrics;
  atsMetrics: AtsMetrics | null;
}) {
  return (
    <div className="ds-page-enter min-w-0 space-y-5">
      <HubDomainHeader
        title="Personas"
        hint="Dotación, onboarding, documentación, reclutamiento y conocimiento."
        moduleHref="/personas/guardias"
        moduleLabel="Abrir Personas"
      />
      <HubPersonasSection metrics={personasMetrics} />
      {atsMetrics ? <HubAtsSection metrics={atsMetrics} /> : null}
    </div>
  );
}

export function HubPayrollView({ metrics }: { metrics: PayrollMetrics }) {
  return (
    <div className="ds-page-enter min-w-0 space-y-5">
      <HubDomainHeader
        title="Payroll"
        hint="Período activo, anticipos pendientes y fecha del próximo cierre."
        moduleHref="/payroll"
        moduleLabel="Abrir Payroll"
      />
      <HubPayrollSection metrics={metrics} />
    </div>
  );
}
