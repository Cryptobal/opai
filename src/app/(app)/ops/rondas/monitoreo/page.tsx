import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { RondasMonitoreoClient } from "@/components/ops/rondas";

export default async function RondasMonitoreoPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/ops/rondas/monitoreo");

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "rondas")) redirect("/hub");

  const tenantId = session.user.tenantId;

  const now = new Date();
  const sixHoursFromNow = new Date(now.getTime() + 6 * 60 * 60 * 1000);

  // Use active turno start time as lower bound; fallback to 12h window
  let lookbackStart = new Date(now.getTime() - 12 * 60 * 60 * 1000);
  try {
    const activeTurno = await prisma.opsMonitoreoTurno.findFirst({
      where: { tenantId, status: "active" },
      select: { startedAt: true },
    });
    if (activeTurno?.startedAt) lookbackStart = activeTurno.startedAt;
  } catch (err) {
    console.error("[RONDAS_ERROR] Failed to fetch active turno:", err);
  }

  // Each query wrapped individually so a single failure doesn't crash the page
  let activeRows: Awaited<ReturnType<typeof prisma.opsRondaEjecucion.findMany>> = [];
  let upcomingRows: Awaited<ReturnType<typeof prisma.opsRondaEjecucion.findMany>> = [];
  let completedRows: Awaited<ReturnType<typeof prisma.opsRondaEjecucion.findMany>> = [];
  let installations: { id: string; name: string; lat: number | null; lng: number | null }[] = [];
  let alertCount = 0;

  try {
    activeRows = await prisma.opsRondaEjecucion.findMany({
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
        installation: { select: { id: true, name: true, lat: true, lng: true } },
        guardia: { include: { persona: { select: { firstName: true, lastName: true, phoneMobile: true } } } },
        marcaciones: {
          select: {
            id: true,
            timestamp: true,
            status: true,
            lat: true,
            lng: true,
            geoValidada: true,
            geoDistanciaM: true,
            fotoEvidenciaUrl: true,
            checkpointId: true,
            verificationMethod: true,
            checkpoint: { select: { name: true } },
          },
          orderBy: { timestamp: "desc" },
          take: 20,
        },
        alertasRows: {
          where: { resuelta: false, archivedAt: null },
          orderBy: { createdAt: "desc" },
          take: 3,
        },
      },
      orderBy: { scheduledAt: "asc" },
      take: 50,
    });
  } catch (err) {
    console.error("[RONDAS_ERROR] Failed to fetch active rows:", err);
  }

  try {
    upcomingRows = await prisma.opsRondaEjecucion.findMany({
      where: {
        tenantId,
        OR: [
          { status: "pendiente", scheduledAt: { gte: now, lte: sixHoursFromNow } },
          { status: "pendiente", scheduledAt: { lt: now, gte: lookbackStart } },
          { status: "no_realizada", scheduledAt: { gte: lookbackStart } },
          { status: "cerrada_auto", scheduledAt: { gte: lookbackStart } },
          { status: "cerrada_admin", scheduledAt: { gte: lookbackStart } },
        ],
      },
      include: {
        rondaTemplate: {
          include: {
            installation: { select: { id: true, name: true } },
          },
        },
        installation: { select: { id: true, name: true } },
        guardia: { include: { persona: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { scheduledAt: "asc" },
      take: 30,
    });
  } catch (err) {
    console.error("[RONDAS_ERROR] Failed to fetch upcoming rows:", err);
  }

  try {
    completedRows = await prisma.opsRondaEjecucion.findMany({
      where: {
        tenantId,
        status: { in: ["completada", "incompleta"] },
        completedAt: { gte: lookbackStart },
      },
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
        installation: { select: { id: true, name: true, lat: true, lng: true } },
        guardia: { include: { persona: { select: { firstName: true, lastName: true, phoneMobile: true } } } },
        marcaciones: {
          select: {
            id: true,
            timestamp: true,
            status: true,
            lat: true,
            lng: true,
            geoValidada: true,
            geoDistanciaM: true,
            fotoEvidenciaUrl: true,
            checkpointId: true,
            verificationMethod: true,
            checkpoint: { select: { name: true } },
          },
          orderBy: { timestamp: "desc" },
        },
        alertasRows: {
          where: { resuelta: false, archivedAt: null },
          orderBy: { createdAt: "desc" },
          take: 3,
        },
        incidentes: {
          select: { id: true, tipo: true, descripcion: true, fotoUrl: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { completedAt: "desc" },
      take: 30,
    });
  } catch (err) {
    console.error("[RONDAS_ERROR] Failed to fetch completed rows:", err);
  }

  try {
    installations = await prisma.crmInstallation.findMany({
      where: { tenantId, status: "active", nocturnoEnabled: true },
      select: { id: true, name: true, lat: true, lng: true },
      orderBy: { name: "asc" },
    });
  } catch (err) {
    console.error("[RONDAS_ERROR] Failed to fetch installations:", err);
  }

  try {
    alertCount = await prisma.opsAlertaRonda.count({
      where: { tenantId, resuelta: false, archivedAt: null },
    });
  } catch (err) {
    console.error("[RONDAS_ERROR] Failed to fetch alert count:", err);
  }

  return (
    <div className="min-w-0">
      <RondasMonitoreoClient
        initialRows={JSON.parse(JSON.stringify(activeRows))}
        upcomingRows={JSON.parse(JSON.stringify(upcomingRows))}
        completedRows={JSON.parse(JSON.stringify(completedRows))}
        installations={JSON.parse(JSON.stringify(installations))}
        alertCount={alertCount}
        userId={session.user.id ?? ""}
        userName={session.user.name ?? ""}
        tenantId={tenantId}
        userRole={session.user.role}
      />
    </div>
  );
}
