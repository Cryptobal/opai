/**
 * Audit pre-fix de los 4 bugs críticos reportados por Carlos.
 *
 * Uso:
 *   npx ts-node -r tsconfig-paths/register --compiler-options '{"module":"CommonJS"}' \
 *     scripts/audit-finanzas-bugs-v2.ts
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const tenant = await prisma.tenant.findFirst({
    where: { OR: [{ slug: "gard" }, { name: { contains: "Gard", mode: "insensitive" } }] },
    select: { id: true, slug: true, name: true },
  });
  if (!tenant) {
    console.error("Tenant gard no encontrado");
    process.exit(1);
  }
  console.log(`Tenant: ${tenant.name} (${tenant.id})`);
  console.log("=".repeat(72));

  // ── BUG #1: NCs/NDs emitidas con paymentStatus=UNPAID ──────────────
  // Causa raíz: rcv-ventas-sync.service.ts:442 setea UNPAID para todos
  // los DTEs, incluyendo NCs (61) y NDs (56). Las NCs no se "pagan" —
  // son ajustes al DTE original. Las NDs en práctica tampoco.
  const ncNdMislabeled = await prisma.financeDte.findMany({
    where: {
      tenantId: tenant.id,
      direction: "ISSUED",
      dteType: { in: [56, 61] },
      paymentStatus: { in: ["UNPAID", "OVERDUE", "PARTIAL"] },
    },
    select: {
      id: true,
      folio: true,
      dteType: true,
      paymentStatus: true,
      totalAmount: true,
      date: true,
      receiverName: true,
    },
    orderBy: { date: "desc" },
    take: 20,
  });
  console.log(`\nBUG #1 · NCs/NDs con paymentStatus≠PAID: ${ncNdMislabeled.length}+ (top 20)`);
  for (const d of ncNdMislabeled) {
    const tipo = d.dteType === 61 ? "NC" : "ND";
    console.log(
      `  ${tipo} F#${d.folio} · ${d.receiverName?.substring(0, 32)} · ` +
        `status=${d.paymentStatus} · $${d.totalAmount}`,
    );
  }
  const ncNdMislabeledTotal = await prisma.financeDte.count({
    where: {
      tenantId: tenant.id,
      direction: "ISSUED",
      dteType: { in: [56, 61] },
      paymentStatus: { in: ["UNPAID", "OVERDUE", "PARTIAL"] },
    },
  });
  console.log(`  TOTAL afectados: ${ncNdMislabeledTotal}`);

  // ── BUG #3: Cuotas PAID con DTE asociado que está UNPAID/OVERDUE ──
  // Causa raíz: projection.service.ts:1845-1849 fuerza cellStatus=PAID
  // basado en occ.status + bankTransactionId, sin validar que el DTE
  // tenga paymentStatus consistente.
  const inconsistentOccs = await prisma.$queryRaw<
    Array<{
      occ_id: string;
      occ_date: Date;
      occ_status: string;
      dte_folio: number | null;
      dte_payment_status: string;
      dte_date: Date;
      receiver_name: string | null;
    }>
  >`
    SELECT
      o.id AS occ_id,
      o."scheduledDate" AS occ_date,
      o.status AS occ_status,
      d.folio AS dte_folio,
      d."paymentStatus" AS dte_payment_status,
      d.date AS dte_date,
      d."receiverName" AS receiver_name
    FROM "FinanceCashflowOccurrence" o
    JOIN "FinanceDte" d ON d.id = o."dteId"
    WHERE o."tenantId" = ${tenant.id}::uuid
      AND o.status = 'PAID'
      AND o."bankTransactionId" IS NOT NULL
      AND d."paymentStatus" IN ('UNPAID', 'OVERDUE')
    ORDER BY d.folio DESC
    LIMIT 20
  `;
  console.log(
    `\nBUG #3 · Occurrences PAID con DTE UNPAID/OVERDUE: ${inconsistentOccs.length}+ (top 20)`,
  );
  for (const o of inconsistentOccs) {
    console.log(
      `  occ ${o.occ_date.toISOString().slice(0, 10)} · F#${o.dte_folio} ` +
        `(${o.dte_date.toISOString().slice(0, 10)}) · ` +
        `${o.receiver_name?.substring(0, 28)} · DTE=${o.dte_payment_status}`,
    );
  }

  // ── BUG #4: Cuotas movidas que dejan slot virtual fantasma ────────
  // Detección: ocurrencias materializadas cuyo scheduledDate cae >15
  // días respecto a cualquier date que expandRecurrence generaría para
  // su item (proxy: occurrencias materializadas con effectiveDate ≠
  // scheduledDate + 15 días de delta).
  const movedFar = await prisma.$queryRaw<
    Array<{
      occ_id: string;
      item_name: string;
      recurrence: string;
      scheduled_date: Date;
      day_of_month: number | null;
      delta_days: number;
    }>
  >`
    SELECT
      o.id AS occ_id,
      i.name AS item_name,
      i.recurrence AS recurrence,
      o."scheduledDate" AS scheduled_date,
      i."dayOfMonth" AS day_of_month,
      ABS(EXTRACT(DAY FROM o."scheduledDate") - COALESCE(i."dayOfMonth", EXTRACT(DAY FROM o."scheduledDate")))::int AS delta_days
    FROM "FinanceCashflowOccurrence" o
    JOIN "FinanceCashflowItem" i ON i.id = o."itemId"
    WHERE o."tenantId" = ${tenant.id}::uuid
      AND o.status IN ('PROJECTED', 'PAID')
      AND i.recurrence = 'MONTHLY'
      AND i."dayOfMonth" IS NOT NULL
      AND ABS(EXTRACT(DAY FROM o."scheduledDate") - i."dayOfMonth") > 15
    ORDER BY delta_days DESC
    LIMIT 20
  `;
  console.log(
    `\nBUG #4 · Cuotas MONTHLY movidas >15 días del dayOfMonth: ${movedFar.length}+ (top 20)`,
  );
  for (const o of movedFar) {
    console.log(
      `  ${o.item_name?.substring(0, 40)} · ` +
        `sched=${o.scheduled_date.toISOString().slice(0, 10)} · ` +
        `dom=${o.day_of_month} · Δ${o.delta_days}d`,
    );
  }

  // ── Caso específico: factura 1701 ─────────────────────────────────
  const f1701 = await prisma.financeDte.findFirst({
    where: { tenantId: tenant.id, folio: 1701, direction: "ISSUED" },
    select: {
      id: true,
      folio: true,
      paymentStatus: true,
      amountPaid: true,
      amountPending: true,
      reconciledAt: true,
      totalAmount: true,
      date: true,
    },
  });
  console.log("\nFACTURA 1701 (estado actual en BD):");
  console.log(JSON.stringify(f1701, null, 2));
  if (f1701) {
    const linksTo1701 = await prisma.financeBankTransactionLink.findMany({
      where: { tenantId: tenant.id, targetType: "DTE_ISSUED", targetId: f1701.id },
      select: { id: true, bankTransactionId: true, amount: true },
    });
    const occsTo1701 = await prisma.financeCashflowOccurrence.findMany({
      where: { tenantId: tenant.id, dteId: f1701.id },
      select: { id: true, scheduledDate: true, status: true, bankTransactionId: true, amountClp: true },
    });
    const allocsTo1701 = await prisma.financePaymentAllocation.findMany({
      where: { dteId: f1701.id },
      select: { id: true, amount: true, bankTransactionId: true },
    });
    console.log(`Links bancarios apuntando a 1701: ${linksTo1701.length}`);
    for (const l of linksTo1701)
      console.log(`  link ${l.id.slice(0, 8)} · tx ${l.bankTransactionId.slice(0, 8)} · $${l.amount}`);
    console.log(`Occurrences asociadas a 1701: ${occsTo1701.length}`);
    for (const o of occsTo1701)
      console.log(
        `  occ ${o.id.slice(0, 8)} · ${o.scheduledDate.toISOString().slice(0, 10)} · ` +
          `${o.status} · bankTx=${o.bankTransactionId?.slice(0, 8) ?? "—"} · $${o.amountClp}`,
      );
    console.log(`Allocations: ${allocsTo1701.length}`);
    for (const a of allocsTo1701)
      console.log(`  alloc ${a.id.slice(0, 8)} · $${a.amount} · tx ${a.bankTransactionId?.slice(0, 8)}`);
  }

  // ── Caso específico: factura 1612 (faltante en candidatos) ─────────
  const f1612 = await prisma.financeDte.findFirst({
    where: { tenantId: tenant.id, folio: 1612, direction: "ISSUED" },
    select: {
      id: true,
      folio: true,
      dteType: true,
      paymentStatus: true,
      amountPaid: true,
      amountPending: true,
      reconciledAt: true,
      voidedByCreditNoteId: true,
      date: true,
    },
  });
  console.log("\nFACTURA 1612 (por qué no aparece en candidatos):");
  console.log(JSON.stringify(f1612, null, 2));

  console.log("\n" + "=".repeat(72));
  console.log("RESUMEN:");
  console.log(`  Bug #1 (NCs/NDs UNPAID): ${ncNdMislabeledTotal} DTEs`);
  console.log(`  Bug #3 (occ PAID, DTE UNPAID): ${inconsistentOccs.length}+ occs`);
  console.log(`  Bug #4 (MONTHLY movidas >15d): ${movedFar.length}+ occs`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
