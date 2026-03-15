import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { getDefaultTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { getActiveTurnoId } from "@/lib/rondas/get-active-turno";
import { PageHeader } from "@/components/opai";
import { RondasAlertasClient } from "@/components/ops/rondas";
import { RondasSubnav } from "@/components/ops/RondasSubnav";

export default async function RondasAlertasPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/ops/rondas/alertas");

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "rondas")) redirect("/hub");

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());
  const activeTurnoId = await getActiveTurnoId(tenantId);

  const [rows, installations] = await Promise.all([
    activeTurnoId
        ? prisma.opsAlertaRonda.findMany({
            where: {
              tenantId,
              archivedAt: null,
              turnoId: activeTurnoId,
            },
          include: {
            installation: { select: { id: true, name: true } },
            ejecucion: {
              select: {
                id: true,
                status: true,
                rondaTemplate: { select: { name: true } },
                guardia: { select: { persona: { select: { firstName: true, lastName: true } } } },
              },
            },
          },
          orderBy: [{ resuelta: "asc" }, { createdAt: "desc" }],
          take: 500,
        })
      : [],
    prisma.crmInstallation.findMany({
      where: { tenantId, status: "active" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Alertas de rondas"
        description="Alertas y anomalías detectadas en las rondas."
      />
      <RondasSubnav />
      <RondasAlertasClient
        initialRows={JSON.parse(JSON.stringify(rows))}
        installations={JSON.parse(JSON.stringify(installations))}
        requiresActiveTurno={!activeTurnoId}
      />
    </div>
  );
}
