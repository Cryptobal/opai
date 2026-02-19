/**
 * Hub OPAI — ERP Command Center
 *
 * Dashboard multi-módulo adaptivo por rol:
 * - Greeting con resumen contextual
 * - Quick actions adaptativas
 * - Executive snapshot (KPIs adaptativos)
 * - Alertas críticas (exception-driven)
 * - Acciones prioritarias
 * - Estado operacional del día (si tiene ops)
 * - Sección CRM (si tiene crm)
 * - Sección Finanzas (si tiene finance)
 * - Sección Docs (si tiene docs, sin crm)
 * - Actividad reciente
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDefaultTenantId } from '@/lib/tenant';
import {
  resolvePagePerms,
  canView,
  canEdit,
  hasModuleAccess,
  hasCapability,
} from '@/lib/permissions-server';

import {
  getCommercialMetrics,
  getDocsSignals,
  getFinanceMetrics,
  getOpsMetrics,
  getAlerts,
  getRecentActivity,
} from './_lib/hub-queries';
import type { HubPerms } from './_lib/hub-types';

import { HubClientWrapper } from './_components/HubClientWrapper';
import { SupervisorHub } from './_components/SupervisorHub';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function HubPage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/opai/login?callbackUrl=/hub');
  }

  const perms = await resolvePagePerms(session.user);
  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Resolve module access and capabilities
  const hubPerms: HubPerms = {
    hasCrm: hasModuleAccess(perms, 'crm'),
    hasDocs: hasModuleAccess(perms, 'docs'),
    hasFinance: hasModuleAccess(perms, 'finance'),
    hasOps: hasModuleAccess(perms, 'ops'),
    canOpenLeads: canView(perms, 'crm', 'leads'),
    canOpenDeals: canView(perms, 'crm', 'deals'),
    canOpenQuotes: canView(perms, 'crm', 'quotes'),
    canCreateProposal: canView(perms, 'docs', 'gestion'),
    canConfigureCrm: canView(perms, 'config', 'crm'),
    canApproveTE: hasCapability(perms, 'te_approve'),
    canApproveRendicion: hasCapability(perms, 'rendicion_approve'),
    canMarkAttendance: canEdit(perms, 'ops', 'pauta_diaria'),
  };

  // Fetch data in parallel — only for modules user has access to
  const [crmMetrics, docsSignals, financeMetrics, opsMetrics, activities] =
    await Promise.all([
      hubPerms.hasCrm
        ? getCommercialMetrics(tenantId, thirtyDaysAgo, now)
        : null,
      hubPerms.hasDocs
        ? getDocsSignals(tenantId, thirtyDaysAgo)
        : null,
      hubPerms.hasFinance
        ? getFinanceMetrics(tenantId)
        : null,
      hubPerms.hasOps
        ? getOpsMetrics(tenantId)
        : null,
      getRecentActivity(tenantId),
    ]);

  // Derive alerts from all metrics
  const alerts = getAlerts(opsMetrics, crmMetrics, financeMetrics);

  const firstName = session.user.name?.split(' ')[0] || 'Usuario';

  if (perms.hubLayout === "supervisor") {
    return <SupervisorHub tenantId={tenantId} userId={session.user.id} firstName={firstName} />;
  }

  return (
    <HubClientWrapper
      firstName={firstName}
      hubPerms={hubPerms}
      opsMetrics={opsMetrics}
      crmMetrics={crmMetrics}
      financeMetrics={financeMetrics}
      docsSignals={docsSignals}
      alerts={alerts}
      activities={activities}
    />
  );
}
