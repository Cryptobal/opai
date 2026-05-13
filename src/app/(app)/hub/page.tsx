/**
 * Hub OPAI — ERP Command Center (unified)
 *
 * Mobile-first accordion layout with collapsible sections for ALL roles
 * (supervisor included). One unified hub: visibility is governed entirely
 * by the permissions system.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  resolvePagePerms,
  canView,
  canEdit,
  hasModuleAccess,
  hasCapability,
} from '@/lib/permissions-server';

import {
  getClosingHubData,
  getFinanceMetrics,
  getOpsMetrics,
  getRecentActivity,
  getNotifications,
  getTicketMetrics,
  getSupervisionMetrics,
  getUpcomingProjects,
  getAtsMetrics,
  getPayrollMetrics,
  getPersonasMetrics,
  getAlerts,
} from './_lib/hub-queries';
import type { HubPerms } from './_lib/hub-types';

import { HubClientWrapper } from './_components/HubClientWrapper';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function HubPage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/opai/login?callbackUrl=/hub');
  }

  const perms = await resolvePagePerms(session.user);
  const tenantId = session.user.tenantId;
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Capabilities granulares de finanzas — gobiernan qué KPIs financieros se
  // calculan en el server component y qué cards renderiza el cliente. Si el
  // usuario no tiene la capability, la query subyacente no se ejecuta y el
  // server jamás envía ese dato al cliente.
  const financeCaps = {
    banking_view: hasCapability(perms, 'banking_view'),
    cashflow_view: hasCapability(perms, 'cashflow_view'),
    purchases_view: hasCapability(perms, 'purchases_view'),
  };

  // Resolve module access and capabilities
  const hubPerms: HubPerms = {
    hasCrm: hasModuleAccess(perms, 'crm'),
    hasDocs: hasModuleAccess(perms, 'docs'),
    hasFinance: hasModuleAccess(perms, 'finance'),
    hasOps: hasModuleAccess(perms, 'ops'),
    hasAts: canView(perms, 'ops', 'ats') || hasModuleAccess(perms, 'ops'),
    hasPayroll: hasModuleAccess(perms, 'payroll'),
    hasPersonas: canView(perms, 'ops', 'guardias') || hasModuleAccess(perms, 'ops'),
    canOpenLeads: canView(perms, 'crm', 'leads'),
    canOpenDeals: canView(perms, 'crm', 'deals'),
    canOpenQuotes: canView(perms, 'crm', 'quotes'),
    canCreateProposal: canView(perms, 'docs', 'gestion'),
    canConfigureCrm: canView(perms, 'config', 'crm'),
    canApproveTE: hasCapability(perms, 'te_approve'),
    canManageRefuerzos: canEdit(perms, 'ops', 'turnos_extra'),
    canApproveRendicion: hasCapability(perms, 'rendicion_approve'),
    canMarkAttendance: canEdit(perms, 'ops', 'pauta_diaria'),
    hasSupervision: canView(perms, 'ops', 'supervision'),
    hasSupervisionCheckin: hasCapability(perms, 'supervision_checkin'),
    hasFinanceRendiciones: canEdit(perms, 'finance', 'rendiciones'),
  };

  // Fetch data in parallel — only for modules user has access to
  const [
    closingData,
    financeMetrics,
    opsMetrics,
    activities,
    notifications,
    ticketMetrics,
    supervisionMetrics,
    upcomingProjects,
    atsMetrics,
    payrollMetrics,
    personasMetrics,
  ] = await Promise.all([
    hubPerms.hasCrm ? getClosingHubData(tenantId, thirtyDaysAgo, now) : null,
    hubPerms.hasFinance ? getFinanceMetrics(tenantId, financeCaps) : null,
    hubPerms.hasOps ? getOpsMetrics(tenantId) : null,
    getRecentActivity(tenantId),
    getNotifications(tenantId, session.user.id, perms),
    getTicketMetrics(tenantId, session.user.id),
    hubPerms.hasSupervision ? getSupervisionMetrics(tenantId) : null,
    hubPerms.hasCrm ? getUpcomingProjects(tenantId) : [],
    hubPerms.hasAts ? getAtsMetrics(tenantId) : null,
    hubPerms.hasPayroll ? getPayrollMetrics(tenantId) : null,
    hubPerms.hasPersonas ? getPersonasMetrics(tenantId) : null,
  ]);

  const alerts = getAlerts(opsMetrics, null, financeMetrics);

  const firstName = session.user.name?.split(' ')[0] || 'Usuario';

  // Nuevo: contar instalaciones activas (KPI ejecutivo)
  const installationsActivas = await prisma.crmInstallation.count({
    where: { tenantId, status: 'active' },
  });

  return (
    <HubClientWrapper
      firstName={firstName}
      hubPerms={hubPerms}
      opsMetrics={opsMetrics}
      closingData={closingData}
      financeMetrics={financeMetrics}
      financeCaps={financeCaps}
      notifications={notifications}
      ticketMetrics={ticketMetrics}
      activities={activities}
      supervisionMetrics={supervisionMetrics}
      upcomingProjects={upcomingProjects}
      alerts={alerts}
      atsMetrics={atsMetrics}
      payrollMetrics={payrollMetrics}
      personasMetrics={personasMetrics}
      installationsActivas={installationsActivas}
    />
  );
}
