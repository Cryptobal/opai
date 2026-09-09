/**
 * Reinserta las transferencias SCF del 07/09/2026 descartadas por huella
 * de contenido (misma glosa/monto/referencia, distinct externalId Fintoc).
 *
 * Idempotente por `apiTransactionId = web4leads:<id>`. No toca la fila
 * existente. Máximo 6 filas nuevas. Dry-run por defecto.
 *
 *   npx tsx scripts/restore-scf-20260907.ts \
 *     --tenantId=<uuid> --bankAccountId=<uuid> \
 *     --ids=mov_aaa,mov_bbb,mov_ccc,mov_ddd,mov_eee,mov_fff
 *
 *   npx tsx scripts/restore-scf-20260907.ts ... --apply
 *
 * No ejecutar contra producción sin instrucción explícita.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { syncCurrentBalanceFromMovements } from "../src/modules/finance/banking/bank-balance.service";
import { bulkAutoMatchBankTransactions } from "../src/modules/finance/banking/auto-match-payment.service";

const TX_DATE = "2026-09-07";
const AMOUNT = 7_000_000;
const DESCRIPTION = "0774602593 Transf. SCF SERVICIOS F";
const REFERENCE = "77460259-3";
const MAX_NEW = 6;

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function toApiId(raw: string): string {
  const id = raw.trim();
  if (!id) return "";
  return id.startsWith("web4leads:") ? id : `web4leads:${id}`;
}

async function resolveActorId(tenantId: string): Promise<string | null> {
  const owner = await prisma.admin.findFirst({
    where: { tenantId, status: "active", role: "owner" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (owner) return owner.id;
  const admin = await prisma.admin.findFirst({
    where: { tenantId, status: "active" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return admin?.id ?? null;
}

async function main() {
  const tenantId = arg("tenantId");
  const bankAccountId = arg("bankAccountId");
  const idsRaw = arg("ids") ?? "";
  const apply = hasFlag("apply") || hasFlag("commit");

  if (!tenantId || !bankAccountId) {
    console.error(
      "Uso: npx tsx scripts/restore-scf-20260907.ts --tenantId=<uuid> --bankAccountId=<uuid> --ids=mov_a,mov_b,... [--apply]",
    );
    process.exit(1);
  }

  const apiIds = [...new Set(idsRaw.split(",").map(toApiId).filter(Boolean))];
  if (apiIds.length === 0) {
    console.error("Falta --ids=mov_… (ids Fintoc de las 6 transferencias descartadas).");
    process.exit(1);
  }
  if (apiIds.length > MAX_NEW) {
    console.error(`Máximo ${MAX_NEW} ids nuevos. Recibidos: ${apiIds.length}`);
    process.exit(1);
  }

  const account = await prisma.financeBankAccount.findFirst({
    where: { id: bankAccountId, tenantId },
    select: { id: true, bankName: true, accountNumber: true },
  });
  if (!account) {
    console.error("Cuenta no encontrada para ese tenantId/bankAccountId.");
    process.exit(1);
  }

  const existing = await prisma.financeBankTransaction.findMany({
    where: {
      tenantId,
      bankAccountId,
      apiTransactionId: { in: apiIds },
    },
    select: { id: true, apiTransactionId: true },
  });
  const already = new Set(
    existing.map((r) => r.apiTransactionId).filter((id): id is string => !!id),
  );
  const toInsert = apiIds.filter((id) => !already.has(id));

  const visibleScf = await prisma.financeBankTransaction.count({
    where: {
      tenantId,
      bankAccountId,
      hiddenAt: null,
      transactionDate: new Date(`${TX_DATE}T00:00:00.000Z`),
      amount: new Prisma.Decimal(AMOUNT),
    },
  });

  console.log(
    [
      `Modo: ${apply ? "APPLY" : "DRY-RUN"}`,
      `Cuenta: ${account.bankName} ${account.accountNumber}`,
      `Ids pedidos: ${apiIds.length}`,
      `Ya existentes: ${already.size}`,
      `A insertar: ${toInsert.length}`,
      `SCF $7.000.000 visibles el ${TX_DATE}: ${visibleScf}`,
    ].join("\n"),
  );

  if (toInsert.length === 0) {
    console.log("Nada que insertar (idempotente).");
    return;
  }

  if (!apply) {
    console.log("Filas que se crearían:");
    for (const id of toInsert) console.log(`  ${id}`);
    console.log("DRY-RUN: no se escribió. Corre con --apply para persistir.");
    return;
  }

  await prisma.financeBankTransaction.createMany({
    data: toInsert.map((apiTransactionId) => ({
      tenantId,
      bankAccountId,
      transactionDate: new Date(`${TX_DATE}T00:00:00.000Z`),
      description: DESCRIPTION,
      reference: REFERENCE,
      amount: new Prisma.Decimal(AMOUNT),
      source: "API" as const,
      reconciliationStatus: "UNMATCHED" as const,
      apiTransactionId,
    })),
    skipDuplicates: true,
  });

  const inserted = await prisma.financeBankTransaction.findMany({
    where: { tenantId, bankAccountId, apiTransactionId: { in: toInsert } },
    select: { id: true, apiTransactionId: true },
  });
  console.log(`Insertadas: ${inserted.length}`);

  const resolved = await syncCurrentBalanceFromMovements(tenantId, bankAccountId);
  console.log(
    `Saldo resuelto post-recalc: ${resolved.resolvedBalanceClp} (ancla ${resolved.anchorSnapshotDate?.toISOString().slice(0, 10) ?? "—"} + ${resolved.txCount} mov.)`,
  );

  const actorId = await resolveActorId(tenantId);
  if (actorId && inserted.length > 0) {
    const am = await bulkAutoMatchBankTransactions(
      tenantId,
      inserted.map((r) => r.id),
      actorId,
    );
    console.log(
      `auto-match scanned=${am.total} dte=${am.matched} te=${am.turnoExtraMatched} rules=${am.ruleMatched}`,
    );
  } else if (!actorId) {
    console.log("auto-match omitido: sin admin activo en el tenant.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
