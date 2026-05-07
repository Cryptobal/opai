import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/opai-ds";
import { Users } from "lucide-react";
import { GuardiasClient } from "@/components/ops";
import { computeProfileCompleteness } from "@/lib/postulacion-completeness";

export default async function GuardiasPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/personas/guardias");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "guardias")) {
    redirect("/hub");
  }

  const tenantId = session.user.tenantId;
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
          birthDate: true,
          sex: true,
          afp: true,
          healthSystem: true,
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
      documents: {
        select: { id: true, type: true },
      },
    },
    orderBy: [{ isBlacklisted: "asc" }, { createdAt: "desc" }],
  });

  const guardias = guardiasRaw.map(({ marcacionPin, documents, ...g }) => {
    const completeness = computeProfileCompleteness({
      persona: g.persona,
      hasBankAccount: (g.bankAccounts?.length ?? 0) > 0,
      hasAnyDocument: documents.length > 0,
    });
    return {
      ...g,
      marcacionPinVisible: g.marcacionPinVisible,
      marcacionPin: marcacionPin ? "[configurado]" : null,
      hasHistorialPenal: documents.some((d) => d.type === "historial_penal"),
      profileComplete: completeness.complete,
      profileMissing: completeness.missing,
    };
  });

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden">
      <PageHero
        icon={<Users />}
        iconTone="sky"
        title="Personas"
        subtitle="alta y control de elegibilidad"
        description="Alta de personas y control de elegibilidad operativa."
      />
      <GuardiasClient
        initialGuardias={JSON.parse(JSON.stringify(guardias))}
        userRole={session.user.role}
      />
    </div>
  );
}
