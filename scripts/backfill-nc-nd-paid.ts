/**
 * Backfill: corrige NCs y NDs emitidas históricas que quedaron con
 * paymentStatus=UNPAID/PARTIAL/OVERDUE debido al bug en
 * rcv-ventas-sync. Las lleva a PAID con amountPaid=total.
 *
 * Solo afecta direction=ISSUED y dteType IN (56, 61). Idempotente:
 * skipea las que ya están PAID.
 *
 * Uso:
 *   npx ts-node -r tsconfig-paths/register --compiler-options '{"module":"CommonJS"}' \
 *     scripts/backfill-nc-nd-paid.ts
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const tenant = await prisma.tenant.findFirst({
    where: { OR: [{ slug: "gard" }, { name: { contains: "Gard", mode: "insensitive" } }] },
    select: { id: true },
  });
  if (!tenant) {
    console.error("Tenant gard no encontrado");
    process.exit(1);
  }

  const targets = await prisma.financeDte.findMany({
    where: {
      tenantId: tenant.id,
      direction: "ISSUED",
      dteType: { in: [56, 61] },
      paymentStatus: { in: ["UNPAID", "OVERDUE", "PARTIAL"] },
    },
    select: { id: true, folio: true, dteType: true, totalAmount: true, paymentStatus: true },
  });

  console.log(`Targets: ${targets.length}`);
  let updated = 0;
  for (const d of targets) {
    await prisma.financeDte.update({
      where: { id: d.id },
      data: {
        paymentStatus: "PAID",
        amountPaid: d.totalAmount,
        amountPending: 0,
      },
    });
    updated++;
    const tipo = d.dteType === 61 ? "NC" : "ND";
    console.log(`  ${tipo} F#${d.folio} · ${d.paymentStatus} → PAID`);
  }
  console.log(`\nActualizadas: ${updated}/${targets.length}`);
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
