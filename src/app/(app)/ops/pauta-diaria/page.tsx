import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasAppAccess } from "@/lib/app-access";
import { getDefaultTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/opai";
import { OpsPautaDiariaClient, OpsSubnav } from "@/components/ops";

export default async function OpsAsistenciaDiariaPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/pauta-diaria");
  }
  const role = session.user.role;
  if (!hasAppAccess(role, "ops")) {
    redirect("/hub");
  }

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());

  const [clients, guardias] = await Promise.all([
    prisma.crmAccount.findMany({
      where: {
        tenantId,
        type: "client",
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        installations: {
          where: { isActive: true },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.opsGuardia.findMany({
      where: {
        tenantId,
        status: "active",
        isBlacklisted: false,
      },
      select: {
        id: true,
        code: true,
        persona: {
          select: { firstName: true, lastName: true, rut: true },
        },
      },
      orderBy: [{ persona: { lastName: "asc" } }],
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Asistencia diaria"
        description="Control diario de asistencia, reemplazos y generación de turnos extra."
      />
      <OpsSubnav />
      <OpsPautaDiariaClient
        initialClients={JSON.parse(JSON.stringify(clients))}
        guardias={JSON.parse(JSON.stringify(guardias))}
        userRole={role}
      />
    </div>
  );
}
