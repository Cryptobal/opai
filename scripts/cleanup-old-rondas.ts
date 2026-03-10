/**
 * Cleanup script: Delete all old ronda execution data.
 * Safe for pre-production environments.
 *
 * Run with: npx tsx scripts/cleanup-old-rondas.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🧹 Starting rondas data cleanup...\n");

  // 1. Find active turno (if any) — preserve it
  const activeTurno = await prisma.opsMonitoreoTurno.findFirst({
    where: { status: "active" },
    select: { id: true, controlNocturnoId: true, startedAt: true },
  });
  console.log(activeTurno
    ? `Active turno found: ${activeTurno.id} (started ${activeTurno.startedAt.toISOString()})`
    : "No active turno found",
  );

  // 2. Delete all ronda ejecuciones that are NOT currently en_curso
  //    Cascade deletes: marcaciones, tracking, incidentes
  //    SetNull: controlNocturnoRondas.ejecucionRondaId
  const deletedEjecuciones = await prisma.opsRondaEjecucion.deleteMany({
    where: { status: { not: "en_curso" } },
  });
  console.log(`Deleted ${deletedEjecuciones.count} ronda ejecuciones (non en_curso)`);

  // 3. Archive all open alerts
  const archivedAlerts = await prisma.opsAlertaRonda.updateMany({
    where: { archivedAt: null },
    data: { archivedAt: new Date(), resuelta: true },
  });
  console.log(`Archived ${archivedAlerts.count} open alerts`);

  // 4. Delete completed turnos (keep active)
  const deletedTurnos = await prisma.opsMonitoreoTurno.deleteMany({
    where: { status: "completed" },
  });
  console.log(`Deleted ${deletedTurnos.count} completed turnos`);

  // 5. Delete old control nocturno records (keep the one linked to active turno)
  const deletedCN = await prisma.opsControlNocturno.deleteMany({
    where: {
      id: activeTurno?.controlNocturnoId
        ? { not: activeTurno.controlNocturnoId }
        : undefined,
    },
  });
  console.log(`Deleted ${deletedCN.count} old control nocturno records`);

  // 6. Reset the control nocturno rondas that lost their ejecucion link
  if (activeTurno?.controlNocturnoId) {
    const resetRondas = await prisma.opsControlNocturnoRonda.updateMany({
      where: {
        controlInstalacion: { controlNocturnoId: activeTurno.controlNocturnoId },
        ejecucionRondaId: null,
        autoPopulated: true,
      },
      data: {
        autoPopulated: false,
        status: "pendiente",
        horaMarcada: null,
        trustScore: null,
        trustColor: null,
      },
    });
    console.log(`Reset ${resetRondas.count} orphaned CN ronda slots back to pendiente`);
  }

  console.log("\n✅ Cleanup complete!");
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
