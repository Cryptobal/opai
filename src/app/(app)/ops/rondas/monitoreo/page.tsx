import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { getDefaultTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/opai";
import { RondasMonitoreoClient } from "@/components/ops/rondas";
import { RondasSubnav } from "@/components/ops/RondasSubnav";

export default async function RondasMonitoreoPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/ops/rondas/monitoreo");

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "rondas")) redirect("/hub");

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());

  const now = new Date();
  const sixHoursFromNow = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);

  const [activeRows, upcomingRows, installations, alerts] = await Promise.all([
    prisma.opsRondaEjecucion.findMany({
      where: { tenantId, status: "en_curso" },
      include: {
        rondaTemplate: {
          include: {
            installation: { select: { id: true, name: true, lat: true, lng: true } },
            checkpoints: {
              include: { checkpoint: { select: { id: true, name: true, lat: true, lng: true, geoRadiusM: true } } },
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
    // Upcoming (next 6h) + missed (pendiente past due or no_realizada in last 12h)
    prisma.opsRondaEjecucion.findMany({
      where: {
        tenantId,
        OR: [
          { status: "pendiente", scheduledAt: { gte: now, lte: sixHoursFromNow } },
          { status: "pendiente", scheduledAt: { lt: now, gte: twelveHoursAgo } },
          { status: "no_realizada", scheduledAt: { gte: twelveHoursAgo } },
        ],
      },
      include: {
        rondaTemplate: {
          include: {
            installation: { select: { id: true, name: true } },
          },
        },
        guardia: { include: { persona: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { scheduledAt: "asc" },
      take: 30,
    }),
    prisma.crmInstallation.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true, lat: true, lng: true },
      orderBy: { name: "asc" },
    }),
    prisma.opsAlertaRonda.count({
      where: { tenantId, resuelta: false },
    }),
  ]);

  return (
    <div className="space-y-6 min-w-0">
      <div className="hidden md:block">
        <PageHeader
          title="Monitoreo en tiempo real"
          description="Rondas activas y posición de guardias."
        />
      </div>
      <div className="hidden md:block">
        <RondasSubnav />
      </div>
      <RondasMonitoreoClient
        initialRows={JSON.parse(JSON.stringify(activeRows))}
        upcomingRows={JSON.parse(JSON.stringify(upcomingRows))}
        installations={JSON.parse(JSON.stringify(installations))}
        alertCount={alerts}
        userId={session.user.id ?? ""}
        userName={session.user.name ?? ""}
        tenantId={tenantId}
      />
    </div>
  );
}
