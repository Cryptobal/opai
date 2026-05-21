/**
 * Audita occurrences de cashflow zombi en tenant gard:
 * - status=PAID
 * - bankTransactionId apunta a un tx (a) borrado o (b) oculto
 *   o (c) sin link DTE↔tx activo
 *
 * Estos zombis hacen que el flujo de caja muestre "Pagada" en
 * celdas cuyo DTE está UNPAID/OVERDUE. Causa raíz del bug 1701.
 *
 * Uso:
 *   npx ts-node -r tsconfig-paths/register --compiler-options '{"module":"CommonJS"}' \
 *     scripts/audit-occurrence-zombies.ts
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const tenant = await prisma.tenant.findFirst({
    where: { OR: [{ slug: "gard" }, { name: { contains: "Gard", mode: "insensitive" } }] },
    select: { id: true, slug: true, name: true },
  });
  if (!tenant) { console.error("Tenant gard no encontrado"); process.exit(1); }
  console.log(`Tenant: ${tenant.name} (${tenant.id})`);
  console.log("=".repeat(72));

  // Zombies tipo A: bankTransactionId apunta a tx OCULTO (hiddenAt no null)
  const zombiesHidden = await prisma.$queryRaw<
    Array<{
      occ_id: string;
      occ_date: Date;
      dte_folio: number | null;
      dte_payment_status: string | null;
      tx_hidden_at: Date | null;
      tx_amount: string;
    }>
  >`
    SELECT
      o.id AS occ_id,
      o."scheduled_date" AS occ_date,
      d.folio AS dte_folio,
      d."payment_status"::text AS dte_payment_status,
      bt."hidden_at" AS tx_hidden_at,
      bt.amount::text AS tx_amount
    FROM finance.finance_cashflow_occurrences o
    LEFT JOIN finance.finance_dtes d ON d.id = o."dte_id"
    JOIN finance.finance_bank_transactions bt ON bt.id = o."bank_transaction_id"
    WHERE o."tenant_id" = ${tenant.id}
      AND o.status = 'PAID'
      AND bt."hidden_at" IS NOT NULL
    ORDER BY o."scheduled_date" DESC
    LIMIT 30
  `;
  console.log(`\nZOMBIES tipo A · status=PAID + tx OCULTO: ${zombiesHidden.length}+`);
  for (const z of zombiesHidden) {
    console.log(
      `  occ ${z.occ_date.toISOString().slice(0, 10)} · F#${z.dte_folio ?? "—"} ` +
        `(DTE=${z.dte_payment_status ?? "—"}) · tx oculto el ${z.tx_hidden_at?.toISOString().slice(0, 10)} · $${z.tx_amount}`,
    );
  }

  // Zombies tipo B: occ PAID + DTE UNPAID/OVERDUE (sin importar tx)
  const zombiesDteMismatch = await prisma.$queryRaw<
    Array<{
      occ_id: string;
      occ_date: Date;
      dte_folio: number | null;
      dte_payment_status: string;
      receiver_name: string | null;
    }>
  >`
    SELECT
      o.id AS occ_id,
      o."scheduled_date" AS occ_date,
      d.folio AS dte_folio,
      d."payment_status"::text AS dte_payment_status,
      d."receiver_name" AS receiver_name
    FROM finance.finance_cashflow_occurrences o
    JOIN finance.finance_dtes d ON d.id = o."dte_id"
    WHERE o."tenant_id" = ${tenant.id}
      AND o.status = 'PAID'
      AND o."bank_transaction_id" IS NOT NULL
      AND d."payment_status" IN ('UNPAID', 'OVERDUE')
    ORDER BY d.folio DESC
    LIMIT 30
  `;
  console.log(`\nZOMBIES tipo B · occ PAID + DTE UNPAID/OVERDUE: ${zombiesDteMismatch.length}+`);
  for (const z of zombiesDteMismatch) {
    console.log(
      `  occ ${z.occ_date.toISOString().slice(0, 10)} · F#${z.dte_folio} ` +
        `(${z.dte_payment_status}) · ${z.receiver_name?.substring(0, 32)}`,
    );
  }

  // Zombies tipo C: bankTransactionId NO existe en la tabla (FK rota)
  const zombiesOrphan = await prisma.$queryRaw<
    Array<{ occ_id: string; occ_date: Date; bank_tx_id: string }>
  >`
    SELECT o.id AS occ_id, o."scheduled_date" AS occ_date, o."bank_transaction_id" AS bank_tx_id
    FROM finance.finance_cashflow_occurrences o
    WHERE o."tenant_id" = ${tenant.id}
      AND o.status = 'PAID'
      AND o."bank_transaction_id" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM finance.finance_bank_transactions bt
        WHERE bt.id = o."bank_transaction_id"
      )
    ORDER BY o."scheduled_date" DESC
    LIMIT 30
  `;
  console.log(`\nZOMBIES tipo C · bankTransactionId apunta a tx INEXISTENTE: ${zombiesOrphan.length}+`);
  for (const z of zombiesOrphan) {
    console.log(`  occ ${z.occ_date.toISOString().slice(0, 10)} · tx ${z.bank_tx_id.slice(0, 8)} no existe`);
  }

  const totalCount = await prisma.$queryRaw<Array<{ total: bigint }>>`
    SELECT COUNT(*)::bigint AS total
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
  console.log("\n" + "=".repeat(72));
  console.log(`TOTAL zombies a limpiar: ${totalCount[0]?.total ?? 0}`);

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
