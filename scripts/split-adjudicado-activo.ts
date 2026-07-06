/**
 * Separa la etapa de cierre ganado en DOS etapas distintas, por tenant:
 *
 *   … → Negociación → [Adjudicado] (isAccepted, "por iniciar", pide fecha) → [Activo] (isClosedWon, "corriendo") → [Perdido]
 *
 * Contexto: `merge-won-stages.ts` había fusionado "Ganado"+"Adjudicado" en UNA
 * etapa llamada "Adjudicado" (isClosedWon). Ahora se quiere el modelo fino:
 *   - "Adjudicado" = ganamos, aún no arranca → isAccepted (status del deal: open),
 *     al entrar pide `serviceStartDate` (dialog ya existente en el deal detail).
 *   - "Activo" = servicio corriendo → isClosedWon (status del deal: won).
 *
 * Qué hace (idempotente):
 *   1. Toma la ÚNICA etapa isClosedWon actual (la sobreviviente del merge).
 *   2. La RENOMBRA a "Activo" (conserva isClosedWon:true y TODOS sus negocios).
 *   3. CREA una etapa nueva "Adjudicado" (isAccepted:true), vacía, justo antes.
 *   4. Reordena para dejar: Adjudicado < Activo < Perdido.
 *
 * NO reasigna negocios: los históricos ganados quedan en "Activo" (ya operan).
 * Los futuros ganados-por-iniciar se moverán a "Adjudicado" a mano/desde el flujo.
 * Reversible: `merge-won-stages.ts` vuelve a fusionar ambas en una.
 *
 * Uso:
 *   npx tsx scripts/split-adjudicado-activo.ts --tenant <id>            # dry-run
 *   npx tsx scripts/split-adjudicado-activo.ts --tenant <id> --commit   # aplica
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const COMMIT = process.argv.includes("--commit");
const tenantArgIdx = process.argv.indexOf("--tenant");
const TENANT = tenantArgIdx >= 0 ? process.argv[tenantArgIdx + 1] : null;

const ADJUDICADO = "Adjudicado";
const ACTIVO = "Activo";
const ADJUDICADO_COLOR = "#f59e0b"; // ámbar: "por iniciar"

async function main() {
  if (!TENANT) {
    console.error("Falta --tenant <id>. Este script opera sobre un tenant específico.");
    process.exit(1);
  }
  console.log(`Modo: ${COMMIT ? "COMMIT (escribe)" : "DRY-RUN (no escribe)"} · tenant: ${TENANT}\n`);

  const stages = await prisma.crmPipelineStage.findMany({
    where: { tenantId: TENANT },
    select: { id: true, name: true, order: true, color: true, isActive: true, isAccepted: true, isClosedWon: true, isClosedLost: true, _count: { select: { deals: true } } },
    orderBy: { order: "asc" },
  });
  if (!stages.length) {
    console.error("El tenant no tiene etapas de pipeline. Aborta.");
    process.exit(1);
  }

  console.log("Estado actual:");
  for (const s of stages) {
    const flags = [s.isAccepted && "isAccepted", s.isClosedWon && "isClosedWon", s.isClosedLost && "isClosedLost", !s.isActive && "INACTIVE"].filter(Boolean).join(", ") || "—";
    console.log(`  [ord ${String(s.order).padStart(2)}] ${s.name.padEnd(22)} negocios:${String(s._count.deals).padStart(4)}  {${flags}}`);
  }

  const acceptedStages = stages.filter((s) => s.isAccepted);
  const wonStages = stages.filter((s) => s.isClosedWon);
  const lostStage = stages.find((s) => s.isClosedLost);

  // Idempotencia: ya separado (existe Adjudicado isAccepted + Activo isClosedWon).
  const hasAdjudicadoAccepted = acceptedStages.some((s) => s.name === ADJUDICADO);
  const hasActivoWon = wonStages.some((s) => s.name === ACTIVO);
  if (hasAdjudicadoAccepted && hasActivoWon) {
    console.log(`\n✔ Ya está separado ("${ADJUDICADO}" isAccepted + "${ACTIVO}" isClosedWon). Nada que hacer.`);
    return;
  }

  // Precondiciones seguras: exactamente UNA etapa isClosedWon y NINGUNA isAccepted.
  if (wonStages.length !== 1) {
    console.error(`\n⚠️ Se esperaba exactamente 1 etapa isClosedWon; hay ${wonStages.length}. Aborta (revisa manualmente / corre merge-won-stages.ts primero).`);
    process.exit(1);
  }
  if (acceptedStages.length > 0) {
    console.error(`\n⚠️ Ya existe(n) ${acceptedStages.length} etapa(s) isAccepted: ${acceptedStages.map((s) => `"${s.name}"`).join(", ")}. Aborta (estado inesperado).`);
    process.exit(1);
  }
  if (stages.some((s) => s.name === ACTIVO)) {
    console.error(`\n⚠️ Ya existe una etapa llamada "${ACTIVO}" (colisión de nombre). Aborta.`);
    process.exit(1);
  }

  const won = wonStages[0];
  const wonOrder = won.order;

  console.log(`\nPlan:`);
  console.log(`  • Renombrar "${won.name}" (isClosedWon, ${won._count.deals} negocios) → "${ACTIVO}" · orden ${wonOrder} → ${wonOrder + 1}`);
  console.log(`  • Crear "${ADJUDICADO}" (isAccepted, vacía) · orden ${wonOrder}`);
  if (lostStage) console.log(`  • Reordenar "${lostStage.name}" (isClosedLost) · orden ${lostStage.order} → ${wonOrder + 2}`);

  if (!COMMIT) {
    console.log(`\nDRY-RUN: no se escribió nada. Vuelve a correr con --commit para aplicar.`);
    return;
  }

  await prisma.$transaction(async (tx) => {
    // 1. Correr "Perdido" al final para dejar sitio a Activo.
    if (lostStage) {
      await tx.crmPipelineStage.update({ where: { id: lostStage.id }, data: { order: wonOrder + 2 } });
    }
    // 2. Renombrar la ganadora existente → "Activo" (libera el nombre "Adjudicado").
    await tx.crmPipelineStage.update({
      where: { id: won.id },
      data: { name: ACTIVO, order: wonOrder + 1, isClosedWon: true, isAccepted: false, isActive: true },
    });
    // 3. Crear la nueva "Adjudicado" (por iniciar).
    await tx.crmPipelineStage.create({
      data: { tenantId: TENANT, name: ADJUDICADO, order: wonOrder, color: ADJUDICADO_COLOR, isActive: true, isAccepted: true, isClosedWon: false, isClosedLost: false },
    });
  });

  console.log(`\n✔ Separado. Ahora: "${ADJUDICADO}" (isAccepted) → "${ACTIVO}" (isClosedWon).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
