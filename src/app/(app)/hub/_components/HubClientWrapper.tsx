"use client";

/**
 * Wrapper cliente para el Hub — refactored accordion layout.
 * Evita el error createClientModuleProxy al reducir a un solo boundary servidor->cliente.
 */

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { HubGreeting } from './HubGreeting';
// HubNotifications removed from Hub layout — notification system still exists elsewhere
import { HubCrmSection } from './HubCrmSection';
import { HubOperationsSection } from './HubOperationsSection';
import { HubSupervisionSection } from './HubSupervisionSection';
import { HubFinanzasSection } from './HubFinanzasSection';
import { HubTicketsSection } from './HubTicketsSection';
import { HubActivitySection } from './HubActivitySection';
import type {
  HubPerms,
  ClosingHubData,
  FinanceMetrics,
  OpsMetrics,
  HubNotification,
  TicketMetrics,
  ActivityEntry,
  SupervisionMetrics,
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
  showPortalLink?: boolean;
}

export function HubClientWrapper({
  firstName,
  hubPerms,
  opsMetrics,
  closingData,
  financeMetrics,
  notifications,
  ticketMetrics,
  activities,
  supervisionMetrics,
  showPortalLink,
}: HubClientWrapperProps) {
  const pendingFollowUpsCount = closingData?.kpis.followUpsOverdueCount ?? 0;

  return (
    <div className="space-y-4 min-w-0 pb-24 max-w-screen-2xl">
      {/* Header */}
      <HubGreeting
        firstName={firstName}
        pendingFollowUpsCount={pendingFollowUpsCount}
        showPortalLink={showPortalLink}
      />

      {/* Section 1: Hub de Cierre (expanded by default) */}
      {closingData && hubPerms.hasCrm && (
        <HubCrmSection
          perms={hubPerms}
          closingData={closingData}
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

      {/* Section 5: Recent Activity (collapsed by default) */}
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
