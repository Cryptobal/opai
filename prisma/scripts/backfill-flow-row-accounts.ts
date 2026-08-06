/**
 * Backfill idempotente: copia cuentas de categoría → renglón, asigna
 * canonicalKey y marca isDefaultTarget.
 *
 * NUNCA se ejecuta automáticamente. Runbook:
 *   npx tsx prisma/scripts/backfill-flow-row-accounts.ts --dry-run
 *   npx tsx prisma/scripts/backfill-flow-row-accounts.ts
 *   npx tsx prisma/scripts/backfill-flow-row-accounts.ts --tenant=<id>
 */
import {
  PrismaClient,
  type FlowRowKey,
  type FlowSection,
} from "@prisma/client";

const prisma = new PrismaClient();

const CATEGORY_CODE_TO_ROW_KEY: Record<string, FlowRowKey> = {
  EGR_SUELDO: "SUELDO",
  EGR_QUINCENA: "QUINCENA",
  EGR_PREVIRED: "PREVIRED",
  EGR_TURNO_EXTRA: "TURNO_EXTRA",
  EGR_FINIQUITO: "FINIQUITO",
  EGR_IVA_F29: "IVA_F29",
  EGR_IMPUESTO: "OTRO_IMPUESTO",
  EGR_FACTORING: "FACTORING",
  EGR_RETIRO_SOCIO: "RETIRO_SOCIO",
  EGR_DEVOL_PRESTAMO_SOCIO: "DEVOL_PRESTAMO_SOCIO",
};

const FLOW_SECTION_ORDER: FlowSection[] = [
  "INGRESOS",
  "REMUNERACIONES",
  "IMPUESTOS",
  "GAV",
  "FINANCIAMIENTO",
  "OTROS",
];

function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function keyFromName(name: string, section: FlowSection): FlowRowKey | null {
  const n = normalizeName(name);
  if (
    section === "INGRESOS" &&
    (n === "otros ingresos" || n === "otros clientes")
  ) {
    return "BANDEJA_INGRESO";
  }
  if (
    section === "GAV" &&
    (n === "otros egresos" || n === "otros gastos")
  ) {
    return "BANDEJA_EGRESO";
  }
  if (n === "aporte socios" || n === "aporte socio") return "APORTE_SOCIO";
  if (
    n === "creditos / financiamiento" ||
    n === "credito / financiamiento" ||
    n === "creditos" ||
    n === "credito"
  ) {
    return "CREDITO";
  }
  return null;
}

type Summary = {
  tenants: number;
  rowsProcessed: number;
  accountsCopied: number;
  keysAssigned: number;
  mappingUpdated: number;
  defaultTargetsSet: number;
  keyConflicts: Array<{ tenantId: string; key: FlowRowKey; keptRowId: string; skippedRowIds: string[] }>;
};

async function backfillTenant(
  tenantId: string,
  dryRun: boolean,
  summary: Summary,
): Promise<void> {
  const categories = await prisma.financeCashflowCategory.findMany({
    where: { tenantId },
    select: {
      id: true,
      code: true,
      accountMappings: {
        select: {
          accountPlanId: true,
          isPrimary: true,
          createdAt: true,
        },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      },
    },
  });
  const catById = new Map(categories.map((c) => [c.id, c]));

  const rows = await prisma.financeFlowRow.findMany({
    where: { tenantId },
    select: {
      id: true,
      name: true,
      section: true,
      orderIndex: true,
      mapping: true,
      categoryId: true,
      canonicalKey: true,
      archivedAt: true,
      accountMappings: {
        select: { accountPlanId: true, isPrimary: true, isDefaultTarget: true },
      },
    },
    orderBy: [{ section: "asc" }, { orderIndex: "asc" }],
  });

  const keyClaims = new Map<FlowRowKey, { rowId: string; orderIndex: number }>();
  const conflicts = new Map<FlowRowKey, string[]>();

  for (const row of rows) {
    summary.rowsProcessed += 1;

    // 1) Copiar cuentas desde categoría
    if (row.categoryId) {
      const cat = catById.get(row.categoryId);
      if (cat && cat.accountMappings.length > 0) {
        const existing = new Set(row.accountMappings.map((a) => a.accountPlanId));
        for (let i = 0; i < cat.accountMappings.length; i++) {
          const m = cat.accountMappings[i];
          if (existing.has(m.accountPlanId)) continue;
          if (!dryRun) {
            await prisma.financeFlowRowAccount.upsert({
              where: {
                rowId_accountPlanId: {
                  rowId: row.id,
                  accountPlanId: m.accountPlanId,
                },
              },
              create: {
                tenantId,
                rowId: row.id,
                accountPlanId: m.accountPlanId,
                isPrimary: m.isPrimary || (i === 0 && row.accountMappings.length === 0),
                isDefaultTarget: false,
              },
              update: {},
            });
          }
          summary.accountsCopied += 1;
          existing.add(m.accountPlanId);
        }
      }
    }

    // 2) Derivar canonicalKey
    if (!row.canonicalKey && !row.archivedAt) {
      let key: FlowRowKey | null = null;
      if (row.categoryId) {
        const cat = catById.get(row.categoryId);
        if (cat) key = CATEGORY_CODE_TO_ROW_KEY[cat.code] ?? null;
      }
      if (!key) key = keyFromName(row.name, row.section);

      if (key) {
        const claim = keyClaims.get(key);
        if (!claim) {
          keyClaims.set(key, { rowId: row.id, orderIndex: row.orderIndex });
          if (!dryRun) {
            await prisma.financeFlowRow.update({
              where: { id: row.id },
              data: { canonicalKey: key },
            });
          }
          summary.keysAssigned += 1;
        } else if (row.orderIndex < claim.orderIndex) {
          // Reasignar al de menor orderIndex
          const prev = conflicts.get(key) ?? [];
          prev.push(claim.rowId);
          conflicts.set(key, prev);
          keyClaims.set(key, { rowId: row.id, orderIndex: row.orderIndex });
          if (!dryRun) {
            await prisma.financeFlowRow.update({
              where: { id: claim.rowId },
              data: { canonicalKey: null },
            });
            await prisma.financeFlowRow.update({
              where: { id: row.id },
              data: { canonicalKey: key },
            });
          }
          summary.keysAssigned += 1;
        } else {
          const prev = conflicts.get(key) ?? [];
          prev.push(row.id);
          conflicts.set(key, prev);
        }
      }
    } else if (row.canonicalKey && !row.archivedAt) {
      keyClaims.set(row.canonicalKey, {
        rowId: row.id,
        orderIndex: row.orderIndex,
      });
    }

    // 3) mapping CATEGORY → ACCOUNTS
    if (row.mapping === "CATEGORY") {
      if (!dryRun) {
        await prisma.financeFlowRow.update({
          where: { id: row.id },
          data: { mapping: "ACCOUNTS" },
        });
      }
      summary.mappingUpdated += 1;
    }
  }

  for (const [key, skipped] of conflicts) {
    const kept = keyClaims.get(key)!;
    summary.keyConflicts.push({
      tenantId,
      key,
      keptRowId: kept.rowId,
      skippedRowIds: skipped,
    });
  }

  // 4) isDefaultTarget por (tenant, accountPlanId)
  const allMappings = await prisma.financeFlowRowAccount.findMany({
    where: { tenantId, row: { archivedAt: null } },
    select: {
      id: true,
      accountPlanId: true,
      rowId: true,
      isDefaultTarget: true,
      isPrimary: true,
      createdAt: true,
      row: { select: { section: true, orderIndex: true } },
    },
  });

  const byAccount = new Map<string, typeof allMappings>();
  for (const m of allMappings) {
    const list = byAccount.get(m.accountPlanId) ?? [];
    list.push(m);
    byAccount.set(m.accountPlanId, list);
  }

  const sectionRank = new Map(FLOW_SECTION_ORDER.map((s, i) => [s, i]));

  for (const [, list] of byAccount) {
    if (list.length === 0) continue;
    const already = list.find((m) => m.isDefaultTarget);
    if (already) continue;

    // Replica el ganador actual del mapeo de categorías:
    // menor sección + menor orderIndex (determinista; alineado a first-wins
    // del seed cuando isPrimary/createdAt coinciden con order de filas).
    list.sort((a, b) => {
      const sa = sectionRank.get(a.row.section) ?? 99;
      const sb = sectionRank.get(b.row.section) ?? 99;
      if (sa !== sb) return sa - sb;
      if (a.row.orderIndex !== b.row.orderIndex) {
        return a.row.orderIndex - b.row.orderIndex;
      }
      // Desempate: isPrimary desc, createdAt asc (ganador categoryAccount)
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    const winner = list[0];
    if (!dryRun) {
      await prisma.financeFlowRowAccount.update({
        where: { id: winner.id },
        data: { isDefaultTarget: true },
      });
    }
    summary.defaultTargetsSet += 1;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const tenantArg = args.find((a) => a.startsWith("--tenant="));
  const tenantFilter = tenantArg?.slice("--tenant=".length);

  const tenants = tenantFilter
    ? [{ id: tenantFilter }]
    : await prisma.tenant.findMany({ select: { id: true } });

  const summary: Summary = {
    tenants: 0,
    rowsProcessed: 0,
    accountsCopied: 0,
    keysAssigned: 0,
    mappingUpdated: 0,
    defaultTargetsSet: 0,
    keyConflicts: [],
  };

  for (const t of tenants) {
    summary.tenants += 1;
    await backfillTenant(t.id, dryRun, summary);
  }

  console.log(JSON.stringify({ dryRun, ...summary }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
