import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { getDefaultTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/opai";
import { OpsPautaDiariaClient } from "@/components/ops";
import { OpsGlobalSearch } from "@/components/ops/OpsGlobalSearch";

export default async function OpsAsistenciaDiariaPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/pauta-diaria");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "pauta_diaria")) {
    redirect("/hub");
  }

  const role = session.user.role;

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
      <OpsGlobalSearch className="w-full sm:max-w-xs" />
      <OpsPautaDiariaClient
        initialClients={JSON.parse(JSON.stringify(clients))}
        guardias={JSON.parse(JSON.stringify(guardias))}
        userRole={role}
      />
    </div>
  );
}
