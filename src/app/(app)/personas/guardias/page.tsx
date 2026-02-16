import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { PageHeader } from "@/components/opai";
import { GuardiasClient } from "@/components/ops";
import { PersonasSubnav } from "@/components/ops/PersonasSubnav";

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
  const guardias = await prisma.opsGuardia.findMany({
    where: { tenantId },
    include: {
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
      bankAccounts: {
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        take: 1,
      },
    },
    orderBy: [{ isBlacklisted: "asc" }, { createdAt: "desc" }],
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Personas · Guardias"
        description="Alta de guardias y control de elegibilidad operativa."
      />
      <PersonasSubnav />
      <GuardiasClient
        initialGuardias={JSON.parse(JSON.stringify(guardias))}
        userRole={session.user.role}
      />
    </div>
  );
}
