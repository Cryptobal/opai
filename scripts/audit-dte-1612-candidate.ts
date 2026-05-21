/**
 * Audita por qué la factura 1612 de gard no aparece como candidata
 * para conciliar con movimientos del 30 abril.
 *
 * Uso:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' \
 *     scripts/audit-dte-1612-candidate.ts
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

  // Estado actual del DTE 1612
  const dte = await prisma.financeDte.findFirst({
    where: { tenantId: tenant.id, folio: 1612, direction: "ISSUED" },
    select: {
      id: true,
      folio: true,
      receiverName: true,
      date: true,
      dueDate: true,
      totalAmount: true,
      amountPaid: true,
      amountPending: true,
      paymentStatus: true,
      reconciledAt: true,
      voidedByCreditNoteId: true,
      creditedNetAmount: true,
    },
  });
  if (!dte) {
    console.log("⚠️  Factura 1612 NO existe en BD (puede ser otra cuenta)");
    await prisma.$disconnect();
    return;
  }
  console.log("Factura 1612:");
  console.log(JSON.stringify(dte, null, 2));

  // Buscar links existentes a esta factura
  const links = await prisma.financeBankTransactionLink.findMany({
    where: {
      tenantId: tenant.id,
      targetType: { in: ["DTE_ISSUED", "DTE_RECEIVED"] },
      targetId: dte.id,
    },
    select: {
      id: true,
      bankTransactionId: true,
      amount: true,
      createdAt: true,
    },
  });
  console.log(`\nLinks bancarios existentes: ${links.length}`);
  for (const l of links) {
    console.log(`  - link ${l.id} → tx ${l.bankTransactionId} · $${l.amount}`);
  }

  // Diagnóstico
  console.log("\nDiagnóstico:");
  console.log(`  paymentStatus = ${dte.paymentStatus}`);
  console.log(`  amountPending = ${dte.amountPending}`);
  console.log(`  reconciledAt  = ${dte.reconciledAt}`);
  console.log(`  voidedByCreditNoteId = ${dte.voidedByCreditNoteId}`);
  console.log(`  links existentes activos = ${links.length}`);

  if (dte.voidedByCreditNoteId) {
    console.log("\n❌ Excluida por estar ANULADA (CodRef=1)");
  } else if (links.length > 0) {
    console.log("\n❌ Excluida por tener link bancario activo (`filteredByExistingLink`)");
  } else if (
    Number(dte.amountPending) <= 0 &&
    dte.paymentStatus !== "PAID"
  ) {
    console.log("\n❌ Excluida porque amountPending = 0 y status no es PAID");
  } else if (
    dte.paymentStatus === "PAID" &&
    dte.reconciledAt !== null
  ) {
    console.log("\n❌ Excluida porque ya está PAID y conciliada (reconciledAt no nulo)");
  } else {
    console.log("\n✅ Debería aparecer — chequear ventana de fecha del mov bancario (±90 días)");
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
