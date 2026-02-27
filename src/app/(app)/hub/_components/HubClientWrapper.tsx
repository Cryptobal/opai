"use client";

/**
 * Wrapper cliente para el Hub — refactored accordion layout.
 * Evita el error createClientModuleProxy al reducir a un solo boundary servidor->cliente.
 */

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { HubGreeting } from './HubGreeting';
import { HubNotifications } from './HubNotifications';
import { HubFabSpeedDial } from './HubFabSpeedDial';
import { HubPipelineSection } from './HubPipelineSection';
import { HubOperationsSection } from './HubOperationsSection';
import { HubSupervisionSection } from './HubSupervisionSection';
import { HubFinanzasSection } from './HubFinanzasSection';
import { HubTicketsSection } from './HubTicketsSection';
import { HubActivitySection } from './HubActivitySection';
import type {
  HubPerms,
  CrmMetrics,
  DocsSignals,
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
  crmMetrics: CrmMetrics | null;
  financeMetrics: FinanceMetrics | null;
  docsSignals: DocsSignals | null;
  notifications: HubNotification[];
  ticketMetrics: TicketMetrics;
  activities: ActivityEntry[];
  supervisionMetrics: SupervisionMetrics | null;
}

export function HubClientWrapper({
  firstName,
  hubPerms,
  opsMetrics,
  crmMetrics,
  financeMetrics,
  docsSignals,
  notifications,
  ticketMetrics,
  activities,
  supervisionMetrics,
}: HubClientWrapperProps) {
  const pendingFollowUpsCount = crmMetrics
    ? crmMetrics.followUpsOverdueCount + crmMetrics.followUpQueue.length
    : 0;

  return (
    <div className="space-y-4 min-w-0 pb-24">
      {/* Header */}
      <HubGreeting
        firstName={firstName}
        pendingFollowUpsCount={pendingFollowUpsCount}
      />

      {/* Notifications (last 3) */}
      <HubNotifications notifications={notifications} />

      {/* Section 1: Pipeline Comercial (expanded by default) */}
      {crmMetrics && hubPerms.hasCrm && (
        <HubPipelineSection
          perms={hubPerms}
          crmMetrics={crmMetrics}
          docsSignals={docsSignals}
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
      {!crmMetrics && !docsSignals && !opsMetrics && !financeMetrics && (
        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">Sin datos disponibles</CardTitle>
            <CardDescription>
              No hay acceso a modulos de Inicio para este rol.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* FAB Speed Dial */}
      <HubFabSpeedDial />
    </div>
  );
}
