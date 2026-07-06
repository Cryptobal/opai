/**
 * Mueve UN negocio perdido/cerrado a la etapa "Adjudicado" (isAccepted, status
 * open). Réplica EXACTA de lo que hace changeDealStage para una etapa aceptada
 * (sin propagación, que solo corre en won/lost): update de etapa+status +
 * CrmDealStageHistory + CrmHistoryLog. Idempotente. Dry-run por defecto.
 *
 *   npx tsx scripts/fix-deal-to-adjudicado.ts <dealId>            # dry-run
 *   npx tsx scripts/fix-deal-to-adjudicado.ts <dealId> --commit
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const COMMIT = process.argv.includes("--commit");
const DEAL = process.argv.find((a) => /^[0-9a-f-]{36}$/i.test(a));

async function main() {
  if (!DEAL) { console.error("Falta <dealId> (uuid)."); process.exit(1); }
  const deal = await prisma.crmDeal.findUnique({
    where: { id: DEAL },
    select: { id: true, title: true, tenantId: true, status: true, stageId: true },
  });
  if (!deal) { console.error("Negocio no encontrado."); process.exit(1); }

  const adjudicado = await prisma.crmPipelineStage.findFirst({
    where: { tenantId: deal.tenantId, isActive: true, isAccepted: true },
    select: { id: true, name: true },
  });
  if (!adjudicado) { console.error("No hay etapa isAccepted (Adjudicado) en el tenant."); process.exit(1); }

  if (deal.stageId === adjudicado.id) {
    console.log(`✔ El negocio ya está en "${adjudicado.name}". Nada que hacer.`);
    return;
  }

  // changedBy: un admin del tenant (preferir el dueño de la cuenta / Carlos).
  const admin = await prisma.admin.findFirst({
    where: { tenantId: deal.tenantId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (!admin) { console.error("No hay admin en el tenant para registrar el cambio."); process.exit(1); }

  console.log(`Negocio: "${deal.title}" · status ${deal.status} · stage ${deal.stageId}`);
  console.log(`Plan: → "${adjudicado.name}" (isAccepted, status open) · changedBy ${admin.name} (${admin.id})`);
  if (!COMMIT) { console.log("\nDRY-RUN: no se escribió. Corre con --commit para aplicar."); return; }

  await prisma.$transaction(async (tx) => {
    await tx.crmDeal.update({ where: { id: deal.id }, data: { stageId: adjudicado.id, status: "open" } });
    await tx.crmDealStageHistory.create({ data: { tenantId: deal.tenantId, dealId: deal.id, fromStageId: deal.stageId, toStageId: adjudicado.id, changedBy: admin.id } });
    await tx.crmHistoryLog.create({ data: { tenantId: deal.tenantId, entityType: "deal", entityId: deal.id, action: "deal_stage_changed", details: { fromStageId: deal.stageId, toStageId: adjudicado.id, note: "reapertura manual: perdido → adjudicado (script)" }, createdBy: admin.id } });
  });
  console.log(`\n✔ Movido a "${adjudicado.name}". Recuerda fijar la fecha de inicio en la ficha (✏️ Inicio del servicio).`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
