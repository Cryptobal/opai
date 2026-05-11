/**
 * Re-sync standalone (sin importar el módulo server-only): aplica la lógica
 * nueva del cashflow sync directamente con Prisma.
 *
 *   - Usa `salePriceMonthly` (CpqQuoteParameters) en lugar de
 *     `monthlyCost` para que el item refleje el precio cobrado al cliente.
 *   - Si `quote.currency === "UF"`: guarda amount en UF y currency=UF.
 *   - Si `quote.currency === "CLP"` (o sin UF disponible): guarda amount
 *     en CLP y currency=CLP.
 *   - Limpia occurrences PROJECTED del item para que el proyector las
 *     re-materialice con el monto correcto.
 */

import { PrismaClient } from "@prisma/client";
import { addMonths } from "date-fns";

const prisma = new PrismaClient();

async function getUfAt(date: Date): Promise<number> {
  const exact = await prisma.fxUfRate.findUnique({ where: { date } });
  if (exact) return Number(exact.value);
  const before = await prisma.fxUfRate.findFirst({
    where: { date: { lte: date } },
    orderBy: { date: "desc" },
  });
  if (before) return Number(before.value);
  return 38000; // fallback razonable
}

async function main() {
  const items = await prisma.financeCashflowItem.findMany({
    where: { source: "CONTRACT" },
    select: { id: true, tenantId: true, name: true, sourceRefId: true, amount: true, currency: true },
  });

  console.log(`Re-syncing ${items.length} contract items…\n`);

  for (const it of items) {
    if (!it.sourceRefId) continue;
    const quote = await prisma.cpqQuote.findFirst({
      where: { id: it.sourceRefId, tenantId: it.tenantId },
      select: {
        id: true,
        currency: true,
        monthlyCost: true,
        contractStartDate: true,
        contractDuration: true,
        paymentTerms: true,
        parameters: { select: { salePriceMonthly: true } },
      },
    });
    if (!quote) {
      console.log(`  · ${it.name}: quote no encontrado, skip`);
      continue;
    }

    const salePrice =
      Number(quote.parameters?.salePriceMonthly ?? 0) ||
      Number(quote.monthlyCost ?? 0);
    if (!quote.contractStartDate || salePrice <= 0) {
      console.log(`  · ${it.name}: sin datos suficientes, skip`);
      continue;
    }

    let amount: number;
    let currency: "CLP" | "UF";
    if (quote.currency === "UF") {
      const ufAtStart = await getUfAt(quote.contractStartDate);
      amount = ufAtStart > 0 ? salePrice / ufAtStart : salePrice;
      currency = "UF";
    } else {
      amount = salePrice;
      currency = "CLP";
    }

    console.log(
      `  · ${it.name}: ${it.amount} ${it.currency} → ${amount.toFixed(2)} ${currency}`,
    );

    // Postpago = se factura el mes siguiente al servicio prestado.
    const isPostpago =
      (quote.paymentTerms ?? "").toLowerCase().includes("contrafactura") ||
      (quote.paymentTerms ?? "").toLowerCase().includes("post");
    const startDate = isPostpago
      ? addMonths(quote.contractStartDate, 1)
      : quote.contractStartDate;
    const endDate = addMonths(quote.contractStartDate, quote.contractDuration ?? 12);

    // Limpia occurrences PROJECTED para forzar re-materialización.
    await prisma.financeCashflowOccurrence.deleteMany({
      where: {
        tenantId: it.tenantId,
        itemId: it.id,
        status: "PROJECTED",
      },
    });
    await prisma.financeCashflowItem.update({
      where: { id: it.id },
      data: {
        amount,
        currency,
        ufFixingPolicy: currency === "UF" ? "LAST_DAY_PREV_MONTH" : null,
        startDate,
        endDate,
      },
    });
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect().finally(() => process.exit(1));
});
