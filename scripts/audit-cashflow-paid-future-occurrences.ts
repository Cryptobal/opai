/**
 * Detecta ocurrencias de cashflow marcadas PAID asociadas a un DTE
 * cuya scheduledDate es POSTERIOR al periodo del DTE (potencial bug
 * de matching que asocia un pago real a una cuota futura distinta).
 *
 * Caso de prueba: factura 1701 de mayo asociada a cuota de junio.
 *
 * Uso:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' \
 *     scripts/audit-cashflow-paid-future-occurrences.ts
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

  // Ocurrencias PAID con dteId, donde scheduledDate cae en un mes
  // distinto al month de dte.date.
  const occs = await prisma.financeCashflowOccurrence.findMany({
    where: {
      tenantId: tenant.id,
      status: "PAID",
      dteId: { not: null },
    },
    select: {
      id: true,
      scheduledDate: true,
      effectiveDate: true,
      amountClp: true,
      itemId: true,
      dteId: true,
      dte: {
        select: {
          folio: true,
          date: true,
          receiverName: true,
          paymentStatus: true,
        },
      },
    },
    take: 200,
  });

  const mismatches = occs.filter((o) => {
    if (!o.dte) return false;
    const occMonth = o.scheduledDate.getFullYear() * 12 + o.scheduledDate.getMonth();
    const dteMonth = o.dte.date.getFullYear() * 12 + o.dte.date.getMonth();
    return Math.abs(occMonth - dteMonth) >= 1;
  });

  console.log(`Total occurrences PAID con DTE: ${occs.length}`);
  console.log(`Mismatches (mes occ ≠ mes DTE): ${mismatches.length}`);
  console.log("--------------------------------------------------------------------");
  for (const m of mismatches.slice(0, 30)) {
    console.log(
      `  occ ${m.scheduledDate.toISOString().slice(0, 10)} → DTE F#${m.dte!.folio} ` +
        `(${m.dte!.date.toISOString().slice(0, 10)}) · ` +
        `${m.dte!.receiverName?.substring(0, 30)} · $${m.amountClp}`,
    );
  }

  // Caso específico 1701
  const f1701 = mismatches.find((m) => m.dte?.folio === 1701);
  if (f1701) {
    console.log("\n⚠️  Factura 1701 confirma el bug:");
    console.log(JSON.stringify(f1701, null, 2));
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
