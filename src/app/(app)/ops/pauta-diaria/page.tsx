import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/opai";
import { OpsPautaDiariaClient, PautasSubnav } from "@/components/ops";
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

  const tenantId = session.user.tenantId;

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
          where: { status: "active" },
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
        lifecycleStatus: { in: ["contratado", "te"] },
      },
      select: {
        id: true,
        code: true,
        lifecycleStatus: true,
        persona: {
          select: { firstName: true, lastName: true, rut: true },
        },
      },
      orderBy: [{ persona: { lastName: "asc" } }],
    }),
  ]);

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Asistencia diaria"
        description="Control diario de asistencia, reemplazos y generación de turnos extra."
      />
      <PautasSubnav />
      <OpsGlobalSearch className="w-full sm:max-w-xs" />
      <OpsPautaDiariaClient
        initialClients={JSON.parse(JSON.stringify(clients))}
        guardias={JSON.parse(JSON.stringify(guardias))}
        userRole={role}
      />
    </div>
  );
}
