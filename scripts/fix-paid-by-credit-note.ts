/**
 * Corrige DTEs sospechosos identificados por audit-paid-by-credit-note.ts.
 * Lleva PAID -> OVERDUE/UNPAID según dueDate, sólo para los casos donde
 * amountPaid=0 y creditedNetAmount>0 (NC parcial sin pago real).
 *
 * Uso:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' \
 *     scripts/fix-paid-by-credit-note.ts
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

  const today = new Date();
  const suspects = await prisma.financeDte.findMany({
    where: {
      tenantId: tenant.id,
      direction: "ISSUED",
      paymentStatus: "PAID",
      amountPaid: 0,
      creditedNetAmount: { gt: 0 },
      reconciledAt: null,
    },
    select: { id: true, folio: true, dueDate: true, receiverName: true },
  });

  console.log(`Fixing ${suspects.length} DTEs…`);
  for (const d of suspects) {
    const isOverdue = d.dueDate ? d.dueDate.getTime() < today.getTime() : false;
    await prisma.financeDte.update({
      where: { id: d.id },
      data: { paymentStatus: isOverdue ? "OVERDUE" : "UNPAID" },
    });
    console.log(
      `  F#${d.folio} ${d.receiverName?.substring(0, 30)} → ${isOverdue ? "OVERDUE" : "UNPAID"}`,
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
