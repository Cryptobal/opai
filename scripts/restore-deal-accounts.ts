/**
 * Restaura la cuenta correcta de negocios que fueron reasignados por error a una
 * cuenta contigua en el dropdown del editor (mis-click). Mantiene el título y el
 * resto. Registra un CrmHistoryLog `deal_updated` documentando la corrección.
 * Idempotente (no-op si ya está en la cuenta correcta). Dry-run por defecto.
 *
 *   npx tsx scripts/restore-deal-accounts.ts            # dry-run
 *   npx tsx scripts/restore-deal-accounts.ts --commit
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");

// dealId → cuenta correcta (verificado contra historial + contacto/correos).
const FIXES: Array<{ dealId: string; correctAccountId: string; label: string }> = [
  { dealId: "1beb9cf6-8e29-4691-8c75-442c7aa78da3", correctAccountId: "6d0ff1c3-eebc-4100-84b1-c14de0276eca", label: "Agua Verde → Angloamerican" },
  { dealId: "6b325eca-6cd1-44e5-bed3-4492937196be", correctAccountId: "a0ce7a87-8709-454c-881d-1840d9f814f5", label: "Asap - Lampa → ASAP Soluciones Integrales" },
];

async function main() {
  console.log(`Modo: ${COMMIT ? "COMMIT (escribe)" : "DRY-RUN (no escribe)"}\n`);
  for (const f of FIXES) {
    const deal = await prisma.crmDeal.findUnique({
      where: { id: f.dealId },
      select: { id: true, title: true, tenantId: true, accountId: true, account: { select: { name: true } } },
    });
    if (!deal) { console.log(`⚠️  ${f.label}: negocio no encontrado, se omite.`); continue; }
    const correct = await prisma.crmAccount.findUnique({ where: { id: f.correctAccountId }, select: { id: true, name: true, tenantId: true } });
    if (!correct || correct.tenantId !== deal.tenantId) { console.log(`⚠️  ${f.label}: cuenta destino inválida, se omite.`); continue; }

    if (deal.accountId === f.correctAccountId) {
      console.log(`✔ ${f.label}: ya está en "${correct.name}". Nada que hacer.`);
      continue;
    }
    console.log(`• "${deal.title}": cuenta "${deal.account?.name}" (${deal.accountId}) → "${correct.name}" (${f.correctAccountId})`);
    if (!COMMIT) continue;

    await prisma.$transaction(async (tx) => {
      const from = deal.accountId;
      await tx.crmDeal.update({ where: { id: deal.id }, data: { accountId: f.correctAccountId } });
      await tx.crmHistoryLog.create({
        data: {
          tenantId: deal.tenantId, entityType: "deal", entityId: deal.id, action: "deal_updated",
          details: { changes: { accountId: { from, to: f.correctAccountId } }, changedFields: ["accountId"], note: "corrección: reasignación de cuenta por error (script restore-deal-accounts)" },
          createdBy: "cml901fw40001yx56x7ral6ym",
        },
      });
    });
    console.log(`  ✔ Restaurado a "${correct.name}".`);
  }
  if (!COMMIT) console.log(`\nDRY-RUN: no se escribió. Corre con --commit para aplicar.`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
