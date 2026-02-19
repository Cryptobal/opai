"use client";

/**
 * Wrapper cliente para el Hub.
 * Evita el error createClientModuleProxy al reducir a un solo boundary servidor→cliente.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CrmGlobalSearch } from '@/components/crm/CrmGlobalSearch';
import { HubGreeting } from './HubGreeting';
import { HubQuickActions } from './HubQuickActions';
import { HubExecutiveSnapshot } from './HubExecutiveSnapshot';
import { HubAlertasCriticas } from './HubAlertasCriticas';
import { HubAccionesPrioritarias } from './HubAccionesPrioritarias';
import { HubEstadoOperacional } from './HubEstadoOperacional';
import { HubCrmSection } from './HubCrmSection';
import { HubFinanceSection } from './HubFinanceSection';
import { HubDocsSection } from './HubDocsSection';
import { HubActividadReciente } from './HubActividadReciente';
import type {
  HubPerms,
  CrmMetrics,
  DocsSignals,
  FinanceMetrics,
  OpsMetrics,
  HubAlert,
  ActivityEntry,
} from '../_lib/hub-types';

export interface HubClientWrapperProps {
  firstName: string;
  hubPerms: HubPerms;
  opsMetrics: OpsMetrics | null;
  crmMetrics: CrmMetrics | null;
  financeMetrics: FinanceMetrics | null;
  docsSignals: DocsSignals | null;
  alerts: HubAlert[];
  activities: ActivityEntry[];
}

export function HubClientWrapper({
  firstName,
  hubPerms,
  opsMetrics,
  crmMetrics,
  financeMetrics,
  docsSignals,
  alerts,
  activities,
}: HubClientWrapperProps) {
  return (
    <div className="space-y-6 min-w-0">
      <HubGreeting
        firstName={firstName}
        perms={hubPerms}
        opsMetrics={opsMetrics}
        crmMetrics={crmMetrics}
        financeMetrics={financeMetrics}
      />

      <HubQuickActions perms={hubPerms} />

      {hubPerms.hasCrm && (
        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Buscador CRM</CardTitle>
            <CardDescription>
              Busca contactos, cuentas, negocios, cotizaciones e instalaciones
              sin salir de Inicio.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CrmGlobalSearch />
          </CardContent>
        </Card>
      )}

      <HubExecutiveSnapshot
        perms={hubPerms}
        opsMetrics={opsMetrics}
        crmMetrics={crmMetrics}
        financeMetrics={financeMetrics}
        docsSignals={docsSignals}
      />

      <HubAlertasCriticas alerts={alerts} />

      <HubAccionesPrioritarias
        perms={hubPerms}
        opsMetrics={opsMetrics}
        crmMetrics={crmMetrics}
        financeMetrics={financeMetrics}
      />

      {opsMetrics && hubPerms.hasOps && (
        <HubEstadoOperacional opsMetrics={opsMetrics} />
      )}

      {crmMetrics && hubPerms.hasCrm && (
        <HubCrmSection
          perms={hubPerms}
          crmMetrics={crmMetrics}
          docsSignals={docsSignals}
          financeMetrics={financeMetrics}
        />
      )}

      {financeMetrics && hubPerms.hasFinance && (
        <HubFinanceSection financeMetrics={financeMetrics} />
      )}

      {docsSignals && hubPerms.hasDocs && !hubPerms.hasCrm && (
        <HubDocsSection docsSignals={docsSignals} />
      )}

      {!crmMetrics && !docsSignals && !opsMetrics && !financeMetrics && (
        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">Sin datos disponibles</CardTitle>
            <CardDescription>
              No hay acceso a módulos de Inicio para este rol.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <HubActividadReciente activities={activities} />
    </div>
  );
}
