/**
 * Diagnóstico del item de Cabrero (o cualquier source=CONTRACT) que muestre
 * monto absurdo en flujo de caja. Solo lectura.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Todos los items de Cabrero o similares con source=CONTRACT.
  const items = await prisma.financeCashflowItem.findMany({
    where: { source: "CONTRACT" },
    select: {
      id: true,
      tenantId: true,
      name: true,
      amount: true,
      currency: true,
      sourceRefId: true,
      isActive: true,
      startDate: true,
      endDate: true,
      dayOfMonth: true,
    },
  });

  console.log(`Items source=CONTRACT (total): ${items.length}\n`);
  for (const it of items) {
    console.log(
      `· [${it.isActive ? "ON " : "OFF"}] ${it.name}`,
    );
    console.log(
      `    id=${it.id} amount=${it.amount} ${it.currency} day=${it.dayOfMonth} ${it.startDate?.toISOString().slice(0, 10)} → ${it.endDate?.toISOString().slice(0, 10) ?? "∞"}`,
    );
    if (it.sourceRefId) {
      const quote = await prisma.cpqQuote.findFirst({
        where: { id: it.sourceRefId },
        select: { code: true, monthlyCost: true, currency: true, status: true },
      });
      console.log(
        `    quote: ${quote?.code} status=${quote?.status} monthlyCost=${quote?.monthlyCost} ${quote?.currency}`,
      );
    }
    // Occurrences materializadas con amountClp absurdo
    const occs = await prisma.financeCashflowOccurrence.findMany({
      where: { itemId: it.id },
      select: {
        id: true,
        scheduledDate: true,
        amountClp: true,
        status: true,
        amountOverride: true,
        ufValueUsed: true,
      },
      orderBy: { scheduledDate: "asc" },
    });
    console.log(`    ocurrencias materializadas: ${occs.length}`);
    for (const o of occs) {
      const flag = Number(o.amountClp) > 100_000_000 ? "⚠️ ABSURDO" : "";
      console.log(
        `      · ${o.scheduledDate.toISOString().slice(0, 10)} amountClp=${o.amountClp} status=${o.status} override=${o.amountOverride ?? "—"} uf=${o.ufValueUsed ?? "—"} ${flag}`,
      );
    }
    console.log();
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect().finally(() => process.exit(1));
});
