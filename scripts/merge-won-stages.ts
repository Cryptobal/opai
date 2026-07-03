/**
 * Une las etapas de pipeline "ganadoras" duplicadas en una sola.
 *
 * Contexto: el seed histórico creaba la etapa ganadora como "Ganado"
 * (isClosedWon). Más tarde se agregó a mano "Adjudicado" (isAccepted) para la
 * función de proyectos adjudicados. El negocio las trata como lo mismo, así que
 * quedaron dos etapas equivalentes. No se pueden fusionar desde la UI:
 *   - renombrar choca con el índice único (tenant, nombre);
 *   - borrar solo desactiva la etapa (isActive:false) sin reasignar negocios.
 *
 * Este script, por tenant:
 *   1. Detecta las etapas "ganadoras" (isClosedWon || isAccepted || nombre
 *      "Ganad*"/"Adjudicad*").
 *   2. Elige una sobreviviente (la de más negocios; a igualdad, la más antigua),
 *      la deja con nombre "Adjudicado" e isClosedWon:true.
 *   3. Repunta negocios, historial (from/to) y config de follow-ups de las
 *      redundantes a la sobreviviente.
 *   4. Elimina las etapas redundantes.
 *
 * Idempotente: si ya hay una sola etapa "Adjudicado" ganadora, no hace nada.
 *
 * Uso:
 *   npx tsx scripts/merge-won-stages.ts            # dry-run (no escribe)
 *   npx tsx scripts/merge-won-stages.ts --commit   # aplica los cambios
 *   npx tsx scripts/merge-won-stages.ts --commit --tenant <tenantId>
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const COMMIT = process.argv.includes("--commit");
const TARGET_NAME = "Adjudicado";
const tenantArgIdx = process.argv.indexOf("--tenant");
const ONLY_TENANT = tenantArgIdx >= 0 ? process.argv[tenantArgIdx + 1] : null;

function isWonName(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("ganad") || n.includes("adjudicad");
}

async function main() {
  const tenants = ONLY_TENANT
    ? [{ id: ONLY_TENANT }]
    : await prisma.tenant.findMany({ select: { id: true } });

  console.log(
    `Modo: ${COMMIT ? "COMMIT (escribe)" : "DRY-RUN (no escribe)"} · tenants: ${tenants.length}\n`,
  );

  let mergedTenants = 0;

  for (const { id: tenantId } of tenants) {
    const stages = await prisma.crmPipelineStage.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        order: true,
        color: true,
        isClosedWon: true,
        isAccepted: true,
        createdAt: true,
        _count: { select: { deals: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const wonStages = stages.filter(
      (s) => s.isClosedWon || s.isAccepted || isWonName(s.name),
    );
    if (wonStages.length <= 1) continue; // nada que fusionar

    // Sobreviviente: más negocios; a igualdad, la más antigua (ya ordenadas asc).
    const survivor = [...wonStages].sort(
      (a, b) => b._count.deals - a._count.deals,
    )[0];
    const redundant = wonStages.filter((s) => s.id !== survivor.id);

    mergedTenants++;
    console.log(`\n▸ Tenant ${tenantId}`);
    console.log(
      `  Sobreviviente: "${survivor.name}" (${survivor._count.deals} negocios) → nombre "${TARGET_NAME}", isClosedWon:true`,
    );
    for (const r of redundant) {
      console.log(
        `  Fusiona: "${r.name}" (${r._count.deals} negocios) → sobreviviente`,
      );
    }

    if (!COMMIT) continue;

    const redundantIds = redundant.map((r) => r.id);

    await prisma.$transaction(async (tx) => {
      // 1. Repuntar negocios.
      await tx.crmDeal.updateMany({
        where: { tenantId, stageId: { in: redundantIds } },
        data: { stageId: survivor.id },
      });
      // 2. Repuntar historial (destino y origen).
      await tx.crmDealStageHistory.updateMany({
        where: { tenantId, toStageId: { in: redundantIds } },
        data: { toStageId: survivor.id },
      });
      await tx.crmDealStageHistory.updateMany({
        where: { tenantId, fromStageId: { in: redundantIds } },
        data: { fromStageId: survivor.id },
      });
      // 3. Repuntar config de follow-ups (relación 1:1 por tenant).
      await tx.crmFollowUpConfig.updateMany({
        where: { tenantId, firstFollowUpStageId: { in: redundantIds } },
        data: { firstFollowUpStageId: survivor.id },
      });
      await tx.crmFollowUpConfig.updateMany({
        where: { tenantId, secondFollowUpStageId: { in: redundantIds } },
        data: { secondFollowUpStageId: survivor.id },
      });
      // 4. Eliminar redundantes (ya sin referencias).
      await tx.crmPipelineStage.deleteMany({
        where: { id: { in: redundantIds } },
      });
      // 5. Normalizar la sobreviviente: nombre canónico + flag ganador.
      await tx.crmPipelineStage.update({
        where: { id: survivor.id },
        data: { name: TARGET_NAME, isClosedWon: true, isActive: true },
      });
    });

    console.log(`  ✔ Fusionado.`);
  }

  console.log(
    `\n${COMMIT ? "Aplicado" : "Detectado"} en ${mergedTenants} tenant(s) con duplicados.`,
  );
  if (!COMMIT && mergedTenants > 0) {
    console.log("Vuelve a correr con --commit para aplicar.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
