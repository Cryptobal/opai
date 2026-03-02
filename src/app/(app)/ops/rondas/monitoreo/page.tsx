import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { getDefaultTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { RondasMonitoreoClient } from "@/components/ops/rondas";

export default async function RondasMonitoreoPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/ops/rondas/monitoreo");

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "rondas")) redirect("/hub");

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());

  const [activeRows, installations, alerts] = await Promise.all([
    prisma.opsRondaEjecucion.findMany({
      where: { tenantId, status: "en_curso" },
      include: {
        rondaTemplate: {
          include: {
            installation: { select: { id: true, name: true, lat: true, lng: true } },
            checkpoints: {
              include: { checkpoint: { select: { id: true, name: true, lat: true, lng: true, geoRadiusM: true, verificationType: true } } },
              orderBy: { orderIndex: "asc" },
            },
          },
        },
        guardia: { include: { persona: { select: { firstName: true, lastName: true, phoneMobile: true } } } },
        marcaciones: { orderBy: { timestamp: "desc" }, take: 20 },
        alertasRows: { where: { resuelta: false }, orderBy: { createdAt: "desc" }, take: 3 },
      },
      orderBy: { scheduledAt: "asc" },
      take: 50,
    }),
    prisma.crmInstallation.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.opsAlertaRonda.count({
      where: { tenantId, resuelta: false },
    }),
  ]);

  return (
    <div className="space-y-6 min-w-0">
      <RondasMonitoreoClient
      initialRows={JSON.parse(JSON.stringify(activeRows))}
      installations={JSON.parse(JSON.stringify(installations))}
      alertCount={alerts}
      userId={session.user.id ?? ""}
      userName={session.user.name ?? ""}
    />
    </div>
  );
}
