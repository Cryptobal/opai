/**
 * Refresh guards for the active turno's control nocturno.
 * Run with: npx tsx scripts/refresh-guards.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const activeTurno = await prisma.opsMonitoreoTurno.findFirst({
    where: { status: "active" },
    select: { id: true, controlNocturnoId: true },
  });

  if (!activeTurno?.controlNocturnoId) {
    console.log("No active turno with CN found");
    return;
  }

  console.log(`Active turno: ${activeTurno.id}, CN: ${activeTurno.controlNocturnoId}`);

  const cn = await prisma.opsControlNocturno.findUnique({
    where: { id: activeTurno.controlNocturnoId },
    select: { tenantId: true, shiftStart: true, shiftEnd: true },
  });

  if (!cn) {
    console.log("CN not found");
    return;
  }

  console.log("Regenerating grid slots (including guard refresh)...");

  const { generateGridSlots } = await import("../src/lib/rondas/generate-grid");
  await generateGridSlots({
    controlNocturnoId: activeTurno.controlNocturnoId,
    tenantId: cn.tenantId,
    shiftStart: cn.shiftStart,
    shiftEnd: cn.shiftEnd,
  });

  // Verify results
  const instalaciones = await prisma.opsControlNocturnoInstalacion.findMany({
    where: { controlNocturnoId: activeTurno.controlNocturnoId },
    include: { guardias: true },
    orderBy: { orderIndex: "asc" },
  });

  console.log(`\nGuard summary for ${instalaciones.length} installations:`);
  for (const inst of instalaciones) {
    const nocturnos = inst.guardias.filter((g) => g.turno === "nocturno");
    const diurnos = inst.guardias.filter((g) => g.turno === "diurno");
    console.log(
      `  ${inst.installationName}: ${nocturnos.length} nocturno(s), ${diurnos.length} diurno(s)`,
      nocturnos.length === 0 && diurnos.length === 0 ? "⚠️ SIN GUARDIAS" : "",
    );
  }

  console.log("\n✅ Guard refresh complete!");
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
