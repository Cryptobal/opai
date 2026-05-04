/**
 * Notificación digest por equipo cuando se inicia un onboarding.
 * Una sola notificación por equipo con el conteo de tickets.
 */

import { prisma } from "@/lib/prisma";

export type NotifyDigestInput = {
  tenantId: string;
  onboardingId: string;
  ticketsByTeam: Record<string, string[]>;
};

export async function notifyOnboardingTeamDigests(
  input: NotifyDigestInput,
): Promise<void> {
  const { tenantId, onboardingId, ticketsByTeam } = input;
  if (Object.keys(ticketsByTeam).length === 0) return;

  const onboarding = await prisma.clientOnboarding.findFirst({
    where: { id: onboardingId, tenantId },
    select: { accountId: true, dealId: true },
  });
  if (!onboarding) return;

  const account = await prisma.crmAccount.findUnique({
    where: { id: onboarding.accountId },
    select: { name: true },
  });
  const accountName = account?.name ?? "Cliente";
  const link = `/crm/accounts/${onboarding.accountId}/onboarding/${onboardingId}`;

  const { notify } = await import("@/lib/notifications/notify");

  for (const [team, ticketIds] of Object.entries(ticketsByTeam)) {
    const group = await prisma.adminGroup.findFirst({
      where: { tenantId, slug: team, isActive: true },
      select: { id: true },
    });
    if (!group) {
      console.warn("[onboarding] team group not found:", team);
      continue;
    }
    const memberships = await prisma.adminGroupMembership.findMany({
      where: { groupId: group.id },
      select: { adminId: true },
    });
    const userIds = memberships.map((m) => m.adminId);
    if (userIds.length === 0) continue;

    try {
      await notify({
        tenantId,
        type: "onboarding_started",
        audience: "admin",
        targetType: "ADMIN",
        targetIds: userIds,
        title: `Onboarding iniciado: ${accountName}`,
        body: `Tienes ${ticketIds.length} tickets nuevos para el onboarding de ${accountName}.`,
        data: {
          onboardingId,
          accountId: onboarding.accountId,
          dealId: onboarding.dealId,
          team,
          ticketIds,
        },
        link,
      });
    } catch (e) {
      console.error("[onboarding] notify team failed:", team, e);
    }
  }
}
