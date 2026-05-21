/**
 * Limpia occurrences con status=PAID + bankTransactionId apuntando a
 * un bank tx que YA NO TIENE un link a ese DTE (inconsistencia stale).
 *
 * Las baja a PROJECTED y limpia bankTransactionId — el matcher las
 * volverá a vincular en el próximo buildProjection si corresponde.
 *
 * NO afecta occurrences cuyo DTE está PAID o PARTIAL (esas son legítimas).
 *
 * Uso:
 *   npx ts-node -r tsconfig-paths/register --compiler-options '{"module":"CommonJS"}' \
 *     scripts/cleanup-orphan-paid-occurrences.ts
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

  const orphans = await prisma.financeCashflowOccurrence.findMany({
    where: {
      tenantId: tenant.id,
      status: "PAID",
      bankTransactionId: { not: null },
      dte: {
        paymentStatus: { in: ["UNPAID", "OVERDUE"] },
      },
    },
    select: {
      id: true,
      scheduledDate: true,
      bankTransactionId: true,
      dte: { select: { folio: true, paymentStatus: true } },
    },
  });

  console.log(`Occurrences huérfanas (PAID con DTE UNPAID/OVERDUE): ${orphans.length}`);
  for (const o of orphans) {
    console.log(
      `  occ ${o.id.slice(0, 8)} · ${o.scheduledDate.toISOString().slice(0, 10)} · ` +
        `F#${o.dte?.folio} (${o.dte?.paymentStatus})`,
    );
    await prisma.financeCashflowOccurrence.update({
      where: { id: o.id },
      data: { status: "PROJECTED", bankTransactionId: null },
    });
  }
  console.log(`\nLimpiadas: ${orphans.length}`);
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
