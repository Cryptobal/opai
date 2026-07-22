import Link from "next/link";
import { AgendaHubCard } from "@/components/agenda/AgendaHubCard";
import { RadarComercialCard } from "@/components/hub/RadarComercialCard";
import { SectionHeader } from "@/components/opai-ds";
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
import { HubFinanzasSection } from "./HubFinanzasSection";
import { HubInstallationHealthSection } from "./HubInstallationHealthSection";
import { HubOperationsSection } from "./HubOperationsSection";
import { HubPayrollSection } from "./HubPayrollSection";
import { HubPersonasSection } from "./HubPersonasSection";
import { HubSupervisionSection } from "./HubSupervisionSection";
import { HubTicketsSection } from "./HubTicketsSection";

function ModuleLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center rounded-full border border-primary/30 bg-primary/10 px-4 text-[13px] font-semibold text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {children}
    </Link>
  );
}

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
      <SectionHeader
        title="Comercial"
        hint="Radar, agenda, borradores, negociación, contratos y servicios por iniciar."
        actions={<ModuleLink href="/crm">Ir a Comercial</ModuleLink>}
        size="lg"
      />

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.85fr)]">
        <AgendaHubCard />
        <RadarComercialCard />
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
      <SectionHeader
        title="Operaciones"
        hint="Cobertura, tickets, rondas, supervisión y salud de instalaciones."
        actions={<ModuleLink href="/ops">Ir a Operaciones</ModuleLink>}
        size="lg"
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
      <SectionHeader
        title="Finanzas"
        hint="Caja, flujo semanal, facturación, cobranza y rendiciones."
        actions={<ModuleLink href="/finanzas">Ir a Finanzas</ModuleLink>}
        size="lg"
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
      <SectionHeader
        title="Personas"
        hint="Dotación, onboarding, documentación, reclutamiento y conocimiento."
        actions={
          <ModuleLink href="/personas/guardias">Ir a Personas</ModuleLink>
        }
        size="lg"
      />
      <HubPersonasSection metrics={personasMetrics} />
      {atsMetrics ? <HubAtsSection metrics={atsMetrics} /> : null}
    </div>
  );
}

export function HubPayrollView({ metrics }: { metrics: PayrollMetrics }) {
  return (
    <div className="ds-page-enter min-w-0 space-y-5">
      <SectionHeader
        title="Payroll"
        hint="Período activo, anticipos pendientes y fecha del próximo cierre."
        actions={<ModuleLink href="/payroll">Ir a Payroll</ModuleLink>}
        size="lg"
      />
      <HubPayrollSection metrics={metrics} />
    </div>
  );
}
