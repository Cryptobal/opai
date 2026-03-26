import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { PageHeader } from "@/components/opai";
import { GuardiasClient } from "@/components/ops";

export default async function GuardiasPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/personas/guardias");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "guardias")) {
    redirect("/hub");
  }

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());
  const guardiasRaw = await prisma.opsGuardia.findMany({
    where: { tenantId },
    select: {
      id: true,
      code: true,
      status: true,
      lifecycleStatus: true,
      isBlacklisted: true,
      blacklistReason: true,
      availableExtraShifts: true,
      faceIdPhotoUrl: true,
      marcacionPin: true,
      marcacionPinVisible: true,
      persona: {
        select: {
          firstName: true,
          lastName: true,
          rut: true,
          email: true,
          phone: true,
          phoneMobile: true,
          addressFormatted: true,
          city: true,
          commune: true,
          lat: true,
          lng: true,
        },
      },
      currentInstallation: {
        select: {
          id: true,
          name: true,
        },
      },
      intendedInstallationId: true,
      intendedContractDate: true,
      intendedPlanUpdatedAt: true,
      intendedPlanUpdatedBy: { select: { id: true, name: true } },
      intendedInstallation: {
        select: {
          id: true,
          name: true,
          account: { select: { name: true } },
        },
      },
      bankAccounts: {
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        take: 1,
      },
    },
    orderBy: [{ isBlacklisted: "asc" }, { createdAt: "desc" }],
  });

  const guardias = guardiasRaw.map(({ marcacionPin, ...g }) => ({
    ...g,
    marcacionPinVisible: g.marcacionPinVisible,
    marcacionPin: marcacionPin ? "[configurado]" : null,
  }));

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden">
      <PageHeader
        title="Personas"
        description="Alta de personas y control de elegibilidad operativa."
      />
      <GuardiasClient
        initialGuardias={JSON.parse(JSON.stringify(guardias))}
        userRole={session.user.role}
      />
    </div>
  );
}
