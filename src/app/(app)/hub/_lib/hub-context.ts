import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  canEdit,
  canView,
  hasCapability,
  hasModuleAccess,
  resolvePagePerms,
} from "@/lib/permissions-server";
import type { FinanceCaps, HubPerms } from "./hub-types";

/**
 * Contexto server compartido por el layout y las vistas del Hub.
 *
 * React.cache evita repetir auth + resolución de permisos cuando layout y page
 * se renderizan dentro de la misma request.
 */
export const getHubRequestContext = cache(async () => {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/hub");
  }

  const perms = await resolvePagePerms(session.user);
  const financeCaps: FinanceCaps = {
    banking_view: hasCapability(perms, "banking_view"),
    cashflow_view: hasCapability(perms, "cashflow_view"),
    purchases_view: hasCapability(perms, "purchases_view"),
  };

  const hubPerms: HubPerms = {
    hasCrm: hasModuleAccess(perms, "crm"),
    hasDocs: hasModuleAccess(perms, "docs"),
    hasFinance: hasModuleAccess(perms, "finance"),
    hasOps: hasModuleAccess(perms, "ops"),
    hasAts: canView(perms, "ops", "ats") || hasModuleAccess(perms, "ops"),
    hasPayroll: hasModuleAccess(perms, "payroll"),
    hasPersonas:
      canView(perms, "ops", "guardias") || hasModuleAccess(perms, "ops"),
    canOpenLeads: canView(perms, "crm", "leads"),
    canOpenDeals: canView(perms, "crm", "deals"),
    canEditDeals: canEdit(perms, "crm", "deals"),
    canOpenQuotes: canView(perms, "crm", "quotes"),
    canCreateProposal: canView(perms, "docs", "gestion"),
    canConfigureCrm: canView(perms, "config", "crm"),
    canApproveTE: hasCapability(perms, "te_approve"),
    canManageRefuerzos: canEdit(perms, "ops", "turnos_extra"),
    canApproveRendicion: hasCapability(perms, "rendicion_approve"),
    canMarkAttendance: canEdit(perms, "ops", "pauta_diaria"),
    hasSupervision: canView(perms, "ops", "supervision"),
    hasSupervisionCheckin: hasCapability(perms, "supervision_checkin"),
    hasFinanceRendiciones: canEdit(perms, "finance", "rendiciones"),
  };

  return {
    session,
    perms,
    tenantId: session.user.tenantId,
    userId: session.user.id,
    firstName: session.user.name?.split(" ")[0] || "Usuario",
    hubPerms,
    financeCaps,
  };
});

export interface HubIntegrationStatus {
  gmail: { connected: boolean; email: string | null };
  calendar: { connected: boolean; email: string | null };
  drive: { connected: boolean; email: string | null };
}

export async function getHubIntegrationStatus(
  tenantId: string,
  userId: string,
): Promise<HubIntegrationStatus> {
  const [gmail, calendar, drive] = await Promise.all([
    prisma.crmEmailAccount.findFirst({
      where: { tenantId, userId, provider: "gmail", status: "active" },
      orderBy: { updatedAt: "desc" },
      select: { email: true },
    }),
    prisma.googleCalendarAccount.findFirst({
      where: { tenantId, userId },
      select: { googleEmail: true, status: true },
    }),
    prisma.googleDriveWorkspace.findUnique({
      where: { tenantId },
      select: { googleEmail: true, status: true },
    }),
  ]);

  return {
    gmail: { connected: Boolean(gmail), email: gmail?.email ?? null },
    calendar: {
      connected: calendar?.status === "ACTIVE",
      email: calendar?.googleEmail ?? null,
    },
    drive: {
      connected: drive?.status === "ACTIVE",
      email: drive?.googleEmail ?? null,
    },
  };
}
