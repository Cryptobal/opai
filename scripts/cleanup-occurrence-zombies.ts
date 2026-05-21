/**
 * Limpia occurrences zombi en tenant gard. Las baja a PROJECTED y
 * limpia bankTransactionId/matchedAt/matchedBy. El próximo build
 * de proyección las volverá a vincular si corresponde.
 *
 * Cubre 3 tipos:
 *   A. bankTransactionId apunta a tx oculto (hiddenAt no null)
 *   B. occ PAID + DTE UNPAID/OVERDUE
 *   C. bankTransactionId apunta a tx inexistente (FK rota pre-A4)
 *
 * Uso:
 *   npx ts-node -r tsconfig-paths/register --compiler-options '{"module":"CommonJS"}' \
 *     scripts/cleanup-occurrence-zombies.ts
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const tenant = await prisma.tenant.findFirst({
    where: { OR: [{ slug: "gard" }, { name: { contains: "Gard", mode: "insensitive" } }] },
    select: { id: true },
  });
  if (!tenant) { console.error("Tenant gard no encontrado"); process.exit(1); }

  // Levantar ids de los 3 tipos en una sola query
  const zombies = await prisma.$queryRaw<
    Array<{ occ_id: string; reason: string }>
  >`
    SELECT
      o.id AS occ_id,
      CASE
        WHEN bt."hidden_at" IS NOT NULL THEN 'tx_hidden'
        WHEN bt.id IS NULL THEN 'tx_missing'
        WHEN d."payment_status" IN ('UNPAID', 'OVERDUE') THEN 'dte_unpaid'
        ELSE 'unknown'
      END AS reason
    FROM finance.finance_cashflow_occurrences o
    LEFT JOIN finance.finance_dtes d ON d.id = o."dte_id"
    LEFT JOIN finance.finance_bank_transactions bt ON bt.id = o."bank_transaction_id"
    WHERE o."tenant_id" = ${tenant.id}
      AND o.status = 'PAID'
      AND o."bank_transaction_id" IS NOT NULL
      AND (
        bt."hidden_at" IS NOT NULL
        OR bt.id IS NULL
        OR d."payment_status" IN ('UNPAID', 'OVERDUE')
      )
  `;

  const byReason: Record<string, number> = {};
  for (const z of zombies) byReason[z.reason] = (byReason[z.reason] ?? 0) + 1;
  console.log(`Total zombies: ${zombies.length}`);
  console.log("Por razón:", byReason);

  if (zombies.length === 0) {
    console.log("Nada que limpiar.");
    await prisma.$disconnect();
    return;
  }

  const result = await prisma.financeCashflowOccurrence.updateMany({
    where: { id: { in: zombies.map((z) => z.occ_id) } },
    data: {
      status: "PROJECTED",
      bankTransactionId: null,
      matchedAt: null,
      matchedBy: null,
    },
  });
  console.log(`Limpiadas: ${result.count}/${zombies.length}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
