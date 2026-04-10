"use client";

/**
 * Wrapper cliente para el Hub — unified accordion layout for all roles.
 * Evita el error createClientModuleProxy al reducir a un solo boundary servidor->cliente.
 */

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { HubGreeting } from './HubGreeting';
import { HubQuickActions } from './HubQuickActions';
import { HubAlertsBanner } from './HubAlertsBanner';
import { HubCrmSection } from './HubCrmSection';
import { HubOperationsSection } from './HubOperationsSection';
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
}: HubClientWrapperProps) {
  const pendingFollowUpsCount = closingData?.kpis.followUpsOverdueCount ?? 0;

  return (
    <div className="space-y-4 min-w-0 max-w-screen-2xl">
      {/* Header */}
      <HubGreeting
        firstName={firstName}
        pendingFollowUpsCount={pendingFollowUpsCount}
      />

      {/* Quick actions — role-aware */}
      <HubQuickActions perms={hubPerms} />

      {/* Critical alerts banner */}
      <HubAlertsBanner alerts={alerts} />

      {/* Section 1: Hub de Cierre (expanded by default) */}
      {closingData && hubPerms.hasCrm && (
        <HubCrmSection
          perms={hubPerms}
          closingData={closingData}
          sellerFirstName={firstName}
          upcomingProjects={upcomingProjects}
        />
      )}

      {/* Section 2: Operations (collapsed by default) */}
      {opsMetrics && hubPerms.hasOps && (
        <HubOperationsSection opsMetrics={opsMetrics} />
      )}

      {/* Section 2.5: Supervision (collapsed by default) */}
      {supervisionMetrics && hubPerms.hasSupervision && (
        <HubSupervisionSection metrics={supervisionMetrics} />
      )}

      {/* Section 3: Finance & Rendiciones (collapsed by default) */}
      {financeMetrics && hubPerms.hasFinance && (
        <HubFinanzasSection
          financeMetrics={financeMetrics}
          opsMetrics={opsMetrics}
        />
      )}

      {/* Section 4: Tickets (collapsed by default) */}
      <HubTicketsSection ticketMetrics={ticketMetrics} />

      {/* Section 5: ATS (collapsed by default) */}
      {atsMetrics && hubPerms.hasAts && (
        <HubAtsSection metrics={atsMetrics} />
      )}

      {/* Section 6: Payroll (collapsed by default) */}
      {payrollMetrics && hubPerms.hasPayroll && (
        <HubPayrollSection metrics={payrollMetrics} />
      )}

      {/* Section 7: Personas (collapsed by default) */}
      {personasMetrics && hubPerms.hasPersonas && (
        <HubPersonasSection metrics={personasMetrics} />
      )}

      {/* Section 8: Recent Activity (collapsed by default) */}
      <HubActivitySection activities={activities} />

      {/* Empty state */}
      {!closingData && !opsMetrics && !financeMetrics && (
        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">Sin datos disponibles</CardTitle>
            <CardDescription>
              No hay acceso a modulos de Inicio para este rol.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
