"use client";

/**
 * Wrapper cliente del Hub OPAI — War Room operacional.
 * Layout pensado para reunión semanal: KPIs ejecutivos arriba, heatmaps al medio,
 * detalle abajo. Mobile-first con secciones colapsables.
 */

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { HubGreeting } from './HubGreeting';
import { HubQuickActions } from './HubQuickActions';
import { HubAlertsBanner } from './HubAlertsBanner';
import { HubExecutiveKpis } from './HubExecutiveKpis';
import { HubCrmSection } from './HubCrmSection';
import { HubContratosClienteSection } from './HubContratosClienteSection';
import { HubOperationsSection } from './HubOperationsSection';
import { HubInstallationHealthSection } from './HubInstallationHealthSection';
import { HubSupervisionSection } from './HubSupervisionSection';
import { HubFinanzasSection } from './HubFinanzasSection';
import { HubTicketsSection } from './HubTicketsSection';
import { HubActivitySection } from './HubActivitySection';
import { HubAtsSection } from './HubAtsSection';
import { HubPayrollSection } from './HubPayrollSection';
import { HubPersonasSection } from './HubPersonasSection';
import type {
  HubPerms,
  ClosingHubData,
  FinanceMetrics,
  OpsMetrics,
  HubNotification,
  TicketMetrics,
  ActivityEntry,
  SupervisionMetrics,
  HubAlert,
  AtsMetrics,
  PayrollMetrics,
  PersonasMetrics,
} from '../_lib/hub-types';

export interface HubClientWrapperProps {
  firstName: string;
  hubPerms: HubPerms;
  opsMetrics: OpsMetrics | null;
  closingData: ClosingHubData | null;
  financeMetrics: FinanceMetrics | null;
  notifications: HubNotification[];
  ticketMetrics: TicketMetrics;
  activities: ActivityEntry[];
  supervisionMetrics: SupervisionMetrics | null;
  upcomingProjects?: import('../_lib/hub-types').UpcomingProject[];
  alerts: HubAlert[];
  atsMetrics: AtsMetrics | null;
  payrollMetrics: PayrollMetrics | null;
  personasMetrics: PersonasMetrics | null;
  installationsActivas?: number;
}

export function HubClientWrapper({
  firstName,
  hubPerms,
  opsMetrics,
  closingData,
  financeMetrics,
  ticketMetrics,
  activities,
  supervisionMetrics,
  upcomingProjects,
  alerts,
  atsMetrics,
  payrollMetrics,
  personasMetrics,
  installationsActivas = 0,
}: HubClientWrapperProps) {
  const pendingFollowUpsCount = closingData?.kpis.followUpsOverdueCount ?? 0;

  return (
    <div className="space-y-4 min-w-0 max-w-screen-2xl">
      <HubGreeting
        firstName={firstName}
        pendingFollowUpsCount={pendingFollowUpsCount}
      />

      <HubQuickActions perms={hubPerms} />
      <HubAlertsBanner alerts={alerts} />

      {/* 1. KPIs ejecutivos — siempre visibles, base de la reunión */}
      <HubExecutiveKpis
        closingData={closingData}
        opsMetrics={opsMetrics}
        financeMetrics={financeMetrics}
        ticketMetrics={ticketMetrics}
        installationsActivas={installationsActivas}
      />

      {/* 2. Pipeline comercial */}
      {closingData && hubPerms.hasCrm && (
        <HubCrmSection
          perms={hubPerms}
          closingData={closingData}
          sellerFirstName={firstName}
          upcomingProjects={upcomingProjects}
        />
      )}

      {/* 3. Contratos cliente — sin contrato / por vencer / vencidos */}
      {hubPerms.hasCrm && <HubContratosClienteSection />}

      {/* 4. Operaciones — KPIs + heatmaps de rondas y visitas integrados */}
      {opsMetrics && hubPerms.hasOps && (
        <HubOperationsSection opsMetrics={opsMetrics} />
      )}

      {/* 5. Salud por instalación — top 5 peores */}
      {hubPerms.hasSupervision && <HubInstallationHealthSection />}

      {/* 6. Supervisión (heatmap visitas existente, ya renderiza HubVisitHeatmap) */}
      {supervisionMetrics && hubPerms.hasSupervision && (
        <HubSupervisionSection metrics={supervisionMetrics} />
      )}

      {/* 7. Tickets — KPIs + matriz por instalación */}
      <HubTicketsSection ticketMetrics={ticketMetrics} />

      {/* 8. Personas — KPIs + heatmap conocimiento + postulantes + cumples */}
      {personasMetrics && hubPerms.hasPersonas && (
        <HubPersonasSection metrics={personasMetrics} />
      )}

      {/* 9. ATS, Payroll, Finanzas (colapsadas) */}
      {atsMetrics && hubPerms.hasAts && <HubAtsSection metrics={atsMetrics} />}
      {payrollMetrics && hubPerms.hasPayroll && <HubPayrollSection metrics={payrollMetrics} />}
      {financeMetrics && hubPerms.hasFinance && (
        <HubFinanzasSection
          financeMetrics={financeMetrics}
          opsMetrics={opsMetrics}
        />
      )}

      {/* 10. Actividad reciente */}
      <HubActivitySection activities={activities} />

      {!closingData && !opsMetrics && !financeMetrics && (
        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">Sin datos disponibles</CardTitle>
            <CardDescription>
              No hay acceso a módulos de Inicio para este rol.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
