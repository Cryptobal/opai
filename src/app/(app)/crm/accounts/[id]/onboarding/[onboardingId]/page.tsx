/**
 * Onboarding Hub Page — vista de seguimiento del onboarding del cliente.
 */

import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { OnboardingHub } from "@/components/crm/onboarding/OnboardingHub";

export default async function OnboardingHubPage({
  params,
}: {
  params: Promise<{ id: string; onboardingId: string }>;
}) {
  const { id, onboardingId } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect(`/opai/login?callbackUrl=/crm/accounts/${id}/onboarding/${onboardingId}`);
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "crm")) redirect("/crm");
  const tenantId = session.user.tenantId;

  const onboarding = await prisma.clientOnboarding.findFirst({
    where: { id: onboardingId, tenantId, accountId: id },
    select: { id: true, accountId: true },
  });
  if (!onboarding) notFound();

  return (
    <OnboardingHub onboardingId={onboardingId} accountId={id} />
  );
}
