"use client";

/**
 * Wrapper cliente del Hub OPAI — War Room operacional.
 * Permite reordenar / ocultar secciones por usuario vía registry
 * (`hub-sections-registry.ts`). Orden persistido en `AdminPreference`.
 */

import { useState } from 'react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Pencil } from 'lucide-react';
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
import { HubCustomizeBar } from './HubCustomizeBar';
import {
  resolveHubOrder,
  resolveHiddenSections,
  type HubSectionKey,
  type HubSectionDataBag,
  type HubSectionMeta,
} from '../_lib/hub-sections-registry';
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
  FinanceCaps,
} from '../_lib/hub-types';

export interface HubClientWrapperProps {
  firstName: string;
  hubPerms: HubPerms;
  opsMetrics: OpsMetrics | null;
  closingData: ClosingHubData | null;
  financeMetrics: FinanceMetrics | null;
  financeCaps: FinanceCaps;
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
  hubOrder: HubSectionKey[];
  hubHidden: HubSectionKey[];
}

export function HubClientWrapper({
  firstName,
  hubPerms,
  opsMetrics,
  closingData,
  financeMetrics,
  financeCaps,
  ticketMetrics,
  activities,
  supervisionMetrics,
  upcomingProjects,
  alerts,
  atsMetrics,
  payrollMetrics,
  personasMetrics,
  installationsActivas = 0,
  hubOrder,
  hubHidden,
}: HubClientWrapperProps) {
  const [isEditing, setIsEditing] = useState(false);

  const pendingFollowUpsCount = closingData?.kpis.followUpsOverdueCount ?? 0;

  const dataBag: HubSectionDataBag = {
    closingData,
    opsMetrics,
    financeMetrics,
    ticketMetrics,
    supervisionMetrics,
    atsMetrics,
    payrollMetrics,
    personasMetrics,
  };

  const orderedSections = resolveHubOrder(hubPerms, dataBag, { hubOrder, hubHidden });
  const hiddenSections = resolveHiddenSections(hubPerms, dataBag, { hubHidden });

  const renderSection = (section: HubSectionMeta) => {
    switch (section.key) {
      case 'executive_kpis':
        return (
          <HubExecutiveKpis
            key={section.key}
            closingData={closingData}
            opsMetrics={opsMetrics}
            financeMetrics={financeMetrics}
            ticketMetrics={ticketMetrics}
            installationsActivas={installationsActivas}
          />
        );
      case 'crm':
        return closingData ? (
          <HubCrmSection
            key={section.key}
            perms={hubPerms}
            closingData={closingData}
            sellerFirstName={firstName}
            upcomingProjects={upcomingProjects}
          />
        ) : null;
      case 'contratos_cliente':
        return <HubContratosClienteSection key={section.key} />;
      case 'ops':
        return opsMetrics ? (
          <HubOperationsSection key={section.key} opsMetrics={opsMetrics} />
        ) : null;
      case 'installation_health':
        return <HubInstallationHealthSection key={section.key} />;
      case 'supervision':
        return supervisionMetrics ? (
          <HubSupervisionSection key={section.key} metrics={supervisionMetrics} />
        ) : null;
      case 'tickets':
        return <HubTicketsSection key={section.key} ticketMetrics={ticketMetrics} />;
      case 'personas':
        return personasMetrics ? (
          <HubPersonasSection key={section.key} metrics={personasMetrics} />
        ) : null;
      case 'ats':
        return atsMetrics ? <HubAtsSection key={section.key} metrics={atsMetrics} /> : null;
      case 'payroll':
        return payrollMetrics ? (
          <HubPayrollSection key={section.key} metrics={payrollMetrics} />
        ) : null;
      case 'finanzas':
        return financeMetrics ? (
          <HubFinanzasSection
            key={section.key}
            financeMetrics={financeMetrics}
            financeCaps={financeCaps}
            opsMetrics={opsMetrics}
          />
        ) : null;
      case 'activity':
        return <HubActivitySection key={section.key} activities={activities} />;
    }
  };

  return (
    <div className="space-y-4 min-w-0 max-w-screen-2xl">
      <HubGreeting firstName={firstName} pendingFollowUpsCount={pendingFollowUpsCount} />
      <HubQuickActions perms={hubPerms} />
      <HubAlertsBanner alerts={alerts} />

      {isEditing ? (
        <HubCustomizeBar
          orderedSections={orderedSections}
          hiddenSections={hiddenSections}
          onClose={() => setIsEditing(false)}
        />
      ) : (
        <>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Pencil className="h-3 w-3" />
              Personalizar Inicio
            </button>
          </div>
          {orderedSections.map(renderSection)}
        </>
      )}

      {!closingData && !opsMetrics && !financeMetrics && !isEditing && (
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
