/**
 * Reinserta las transferencias SCF del 07/09/2026 descartadas por huella
 * de contenido (misma glosa/monto/referencia, distinct externalId Fintoc).
 *
 * Idempotente por `apiTransactionId = web4leads:<externalId>`. Resuelve
 * `tenantId` desde la cuenta. No toca la fila MATCHED existente.
 *
 * FinanceBankTransaction no tiene `currency` ni `rawPayload` (el import
 * Web4Leads tampoco los persiste). Las filas nuevas copian ese createMany:
 * source API, UNMATCHED, hiddenAt null.
 *
 *   npx tsx scripts/restore-scf-20260907.ts
 *   npx tsx scripts/restore-scf-20260907.ts --apply
 *
 * Dry-run por defecto. --apply escribe en una transacción y luego corre
 * auto-match + sync de saldo (mismo post-proceso que el webhook).
 * No crea snapshots ni corre hideContentDuplicate contra prod.
 */
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import {
  resolveAccountBalanceFromMovements,
  syncCurrentBalanceFromMovements,
} from "../src/modules/finance/banking/bank-balance.service";
import { contentDuplicateGroupKey } from "../src/modules/finance/banking/bank-tx-content-key";

/** Auto-match arrastra `server-only`; tsx no lo resuelve. Stub vacío. */
const stubServerOnly = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "stub-server-only.cjs",
);
const nodeModule = Module as unknown as {
  _resolveFilename: (
    request: string,
    parent: NodeModule | undefined,
    isMain: boolean,
    options?: unknown,
  ) => string;
};
const origResolveFilename = nodeModule._resolveFilename;
nodeModule._resolveFilename = function resolveWithServerOnlyStub(
  request: string,
  parent: NodeModule | undefined,
  isMain: boolean,
  options?: unknown,
) {
  if (request === "server-only") return stubServerOnly;
  return origResolveFilename.call(this, request, parent, isMain, options);
};
createRequire(import.meta.url)(stubServerOnly);

const DEFAULT_BANK_ACCOUNT_ID = "211bf91a-3572-44eb-af04-4205cee5221d";
const KEEP_ROW_ID = "73ddbb5a-70db-4907-9b12-c1bfc30e2e04";
const TX_DATE = "2026-09-07";
const AMOUNT = 7_000_000;
const DESCRIPTION = "0774602593 Transf. SCF SERVICIOS F";
const REFERENCE = "77460259-3";
const ORIGIN = "restore-scf-20260907";

const FINTOC_IDS = [
  "mov_grK8G4HDP2ryje51",
  "mov_BqDe3AHDg0nKQNWE",
  "mov_j4yeaPHzkorO08XO",
  "mov_EG3Y1gHgzqyQa80W",
  "mov_0lD8bQHnAz7L2NQA",
  "mov_APl8W5HaG5Vb2Y9g",
] as const;

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/** Fintoc `mov_…` sin prefijos `web4leads:` / `w4l-`. */
function fintocCore(raw: string): string {
  let id = raw.trim();
  if (id.startsWith("web4leads:")) id = id.slice("web4leads:".length);
  if (id.startsWith("w4l-")) id = id.slice(4);
  return id;
}

/**
 * En prod Web4Leads guarda `web4leads:w4l-<fintocId>` (la fila MATCHED
 * es `web4leads:w4l-mov_j4yeaPHzkorO08XO`). El export del brief lista
 * el id Fintoc crudo; ambas formas se consideran el mismo movimiento.
 */
function toApiId(raw: string): string {
  const core = fintocCore(raw);
  if (!core) return "";
  return `web4leads:w4l-${core}`;
}

function apiIdLookupKeys(raw: string): string[] {
  const core = fintocCore(raw);
  if (!core) return [];
  return [`web4leads:${core}`, `web4leads:w4l-${core}`];
}

function redactDatabaseUrl(url: string | undefined): string {
  if (!url) return "(unset)";
  try {
    const u = new URL(url);
    return `${u.protocol}//***@${u.hostname}${u.pathname}`;
  } catch {
    return "(unparseable)";
  }
}

function groupKeyFor(apiTransactionId: string): string {
  return contentDuplicateGroupKey({
    transactionDate: TX_DATE,
    amount: AMOUNT,
    description: DESCRIPTION,
    reference: REFERENCE,
    apiTransactionId,
  });
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

function rowPayload(apiTransactionId: string, tenantId: string, bankAccountId: string) {
  return {
    tenantId,
    bankAccountId,
    transactionDate: new Date(`${TX_DATE}T00:00:00.000Z`),
    description: DESCRIPTION,
    reference: REFERENCE,
    amount: new Prisma.Decimal(AMOUNT),
    source: "API" as const,
    reconciliationStatus: "UNMATCHED" as const,
    hiddenAt: null,
    apiTransactionId,
  };
}

async function main() {
  const bankAccountId = arg("bankAccountId") ?? DEFAULT_BANK_ACCOUNT_ID;
  const apply = hasFlag("apply") || hasFlag("commit");
  const apiIds = FINTOC_IDS.map(toApiId);
  const lookupKeys = [...new Set(FINTOC_IDS.flatMap(apiIdLookupKeys))];

  console.log(
    [
      `Modo: ${apply ? "APPLY" : "DRY-RUN"}`,
      `DATABASE_URL: ${redactDatabaseUrl(process.env.DATABASE_URL)}`,
      `DIRECT_DATABASE_URL: ${redactDatabaseUrl(process.env.DIRECT_DATABASE_URL)}`,
      `origin: ${ORIGIN}`,
    ].join("\n"),
  );

  const account = await prisma.financeBankAccount.findFirst({
    where: { id: bankAccountId },
    select: {
      id: true,
      tenantId: true,
      bankName: true,
      bankCode: true,
      accountNumber: true,
      isActive: true,
      currentBalance: true,
    },
  });
  if (!account) {
    console.error(`Cuenta ${bankAccountId} no encontrada.`);
    process.exit(1);
  }
  const tenantId = account.tenantId;
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, slug: true, name: true },
  });

  const keepRow = await prisma.financeBankTransaction.findFirst({
    where: { id: KEEP_ROW_ID, tenantId, bankAccountId },
    select: {
      id: true,
      apiTransactionId: true,
      reconciliationStatus: true,
      amount: true,
      transactionDate: true,
      description: true,
      hiddenAt: true,
    },
  });

  const existingByApi = await prisma.financeBankTransaction.findMany({
    where: { tenantId, bankAccountId, apiTransactionId: { in: lookupKeys } },
    select: { id: true, apiTransactionId: true, reconciliationStatus: true },
  });
  const alreadyCores = new Set<string>();
  for (const r of existingByApi) {
    if (r.apiTransactionId) alreadyCores.add(fintocCore(r.apiTransactionId));
  }
  if (keepRow?.apiTransactionId) {
    alreadyCores.add(fintocCore(keepRow.apiTransactionId));
  }
  const toInsert = apiIds.filter((id) => !alreadyCores.has(fintocCore(id)));

  const visibleScf = await prisma.financeBankTransaction.findMany({
    where: {
      tenantId,
      bankAccountId,
      hiddenAt: null,
      transactionDate: new Date(`${TX_DATE}T00:00:00.000Z`),
      amount: new Prisma.Decimal(AMOUNT),
    },
    select: { id: true, apiTransactionId: true, reconciliationStatus: true },
  });

  const before = await resolveAccountBalanceFromMovements(tenantId, bankAccountId);

  const keys = new Set(toInsert.map(groupKeyFor));
  if (keepRow) {
    keys.add(
      contentDuplicateGroupKey({
        transactionDate: keepRow.transactionDate,
        amount: keepRow.amount,
        description: keepRow.description,
        reference: REFERENCE,
        apiTransactionId: keepRow.apiTransactionId,
      }),
    );
  }
  const hideWouldCollapse = keys.size < toInsert.length + (keepRow ? 1 : 0);

  console.log(
    [
      `Tenant: ${tenant?.slug ?? tenantId} (${tenant?.name ?? "—"})`,
      `Cuenta: ${account.bankName} ${account.accountNumber} (${account.id})${account.isActive ? "" : " INACTIVA"}`,
      `currentBalance persistido: ${account.currentBalance ?? "(null)"}`,
      `Fila existente (no tocar): ${KEEP_ROW_ID}`,
      keepRow
        ? `  apiTransactionId=${keepRow.apiTransactionId ?? "(null)"} status=${keepRow.reconciliationStatus} hidden=${keepRow.hiddenAt ? "sí" : "no"}`
        : "  (no encontrada en esta cuenta/tenant)",
      `Ids Fintoc: ${apiIds.length}`,
      `Ya en BD (core Fintoc, incluye prefijo w4l-): ${alreadyCores.size}`,
      `A insertar: ${toInsert.length} (esperado 5)`,
      `Saldo esperado DESPUÉS (ANTES + ${toInsert.length}×${AMOUNT}): ${before.resolvedBalanceClp + toInsert.length * AMOUNT}`,
      `SCF $7.000.000 visibles el ${TX_DATE}: ${visibleScf.length}`,
      `Saldo resuelto ANTES: ${before.resolvedBalanceClp} (ancla ${before.anchorSource ?? "—"} ${before.anchorSnapshotDate?.toISOString().slice(0, 10) ?? "—"} + ${before.txCount} mov. ${before.txDeltaClp})`,
      `hideContentDuplicate agrupa por huella+apiTransactionId: ${hideWouldCollapse ? "ALERTA colapsaría" : "OK no ocultaría estas filas"}`,
    ].join("\n"),
  );

  if (existingByApi.length > 0) {
    console.log("Ya persistidos (se saltan):");
    for (const r of existingByApi) {
      console.log(`  ${r.apiTransactionId} → ${r.id} ${r.reconciliationStatus}`);
    }
  }

  if (toInsert.length === 0) {
    console.log("Nada que insertar (idempotente).");
    return;
  }

  console.log("Filas que se crearían:");
  for (const id of toInsert) {
    console.log(`  ${id} | ${TX_DATE} | +${AMOUNT} | ${DESCRIPTION} | ${REFERENCE} | API UNMATCHED`);
  }

  if (!apply) {
    console.log(
      [
        "Notas de schema: FinanceBankTransaction no tiene currency ni rawPayload;",
        `  el import Web4Leads tampoco los persiste. origin=${ORIGIN} queda en este log.`,
        "DRY-RUN: no se escribió. Confirmar y correr con --apply para persistir.",
      ].join("\n"),
    );
    return;
  }

  const inserted = await prisma.$transaction(async (tx) => {
    await tx.financeBankTransaction.createMany({
      data: toInsert.map((apiTransactionId) =>
        rowPayload(apiTransactionId, tenantId, bankAccountId),
      ),
      skipDuplicates: true,
    });
    return tx.financeBankTransaction.findMany({
      where: { tenantId, bankAccountId, apiTransactionId: { in: toInsert } },
      select: { id: true, apiTransactionId: true },
    });
  });

  console.log(`Insertadas: ${inserted.length}`);
  for (const r of inserted) {
    console.log(`  ${r.apiTransactionId} → ${r.id}`);
  }

  const actorId = await resolveActorId(tenantId);
  if (actorId && inserted.length > 0) {
    const { bulkAutoMatchBankTransactions } = await import(
      "../src/modules/finance/banking/auto-match-payment.service"
    );
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

  const after = await syncCurrentBalanceFromMovements(tenantId, bankAccountId);
  console.log(
    [
      `Saldo resuelto ANTES: ${before.resolvedBalanceClp}`,
      `Saldo resuelto DESPUÉS: ${after.resolvedBalanceClp} (ancla ${after.anchorSource ?? "—"} ${after.anchorSnapshotDate?.toISOString().slice(0, 10) ?? "—"} + ${after.txCount} mov. ${after.txDeltaClp})`,
    ].join("\n"),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
