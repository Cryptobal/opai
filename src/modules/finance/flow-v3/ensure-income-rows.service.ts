import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cleanRut } from "@/lib/chile-rut";
import { buildIncomeMatcher } from "./row-match";
import { UNMATCHED_INCOME_KEY, type FlowRowRef } from "./types";

type Tx = Prisma.TransactionClient;

/**
 * Sync continuo de filas de INGRESOS (idempotente):
 *  1. Una fila ACCOUNT_INSTALLATION por cada programación activa
 *     (`recurringTemplateId`) — 1 template = 1 fila (nombre = template.name).
 *  2. Una fila genérica de cuenta por cada cliente con factura emitida
 *     pendiente (o borrador) que aún no matchea a ninguna fila.
 *
 * Se llama en cada carga del matrix con permiso de gestión. Sin esto, el
 * bootstrap solo corre cuando rowCount=0 y clientes/programaciones nuevos
 * caen en "Otros clientes".
 */
export async function ensureIncomeRows(tenantId: string): Promise<void> {
  const needed = await collectMissingKeys(tenantId);
  if (needed.templates.length === 0 && needed.accounts.length === 0) return;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`flow-v3-income-rows:${tenantId}`})::int8)`;
    // Re-evaluar bajo lock (otra request pudo crear las filas).
    const still = await collectMissingKeys(tenantId, tx);
    if (still.templates.length === 0 && still.accounts.length === 0) return;

    const last = await tx.financeFlowRow.findFirst({
      where: { tenantId, section: "INGRESOS" },
      orderBy: { orderIndex: "desc" },
      select: { orderIndex: true },
    });
    let orderIndex = (last?.orderIndex ?? -1) + 1;

    for (const t of still.templates) {
      // Unique (tenant, recurringTemplateId): create puede chocar si race;
      // findFirst bajo lock ya filtró, pero por seguridad catch P2002.
      try {
        await tx.financeFlowRow.create({
          data: {
            tenantId,
            section: "INGRESOS",
            name: t.name,
            mapping: "ACCOUNT_INSTALLATION",
            orderIndex: orderIndex++,
            crmAccountId: t.crmAccountId,
            installationId: t.installationId,
            recurringTemplateId: t.id,
          },
        });
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
      }
    }

    for (const a of still.accounts) {
      const exists = await tx.financeFlowRow.findFirst({
        where: {
          tenantId,
          mapping: "ACCOUNT_INSTALLATION",
          crmAccountId: a.crmAccountId,
          installationId: null,
          recurringTemplateId: null,
          archivedAt: null,
        },
        select: { id: true },
      });
      if (exists) continue;
      await tx.financeFlowRow.create({
        data: {
          tenantId,
          section: "INGRESOS",
          name: a.name,
          mapping: "ACCOUNT_INSTALLATION",
          orderIndex: orderIndex++,
          crmAccountId: a.crmAccountId,
          installationId: null,
          recurringTemplateId: null,
        },
      });
    }
  });
}

interface MissingTemplate {
  id: string;
  name: string;
  crmAccountId: string;
  installationId: string | null;
}

interface MissingAccount {
  crmAccountId: string;
  name: string;
}

async function collectMissingKeys(
  tenantId: string,
  db: Tx | typeof prisma = prisma,
): Promise<{ templates: MissingTemplate[]; accounts: MissingAccount[] }> {
  const [rows, templates, dtes, drafts, accounts] = await Promise.all([
    db.financeFlowRow.findMany({
      where: { tenantId, archivedAt: null },
      select: {
        id: true, name: true, crmAccountId: true, installationId: true,
        recurringTemplateId: true, categoryId: true, supplierId: true,
      },
    }),
    db.financeDteRecurringTemplate.findMany({
      where: { tenantId, isActive: true, dteType: { in: [33, 34] } },
      select: {
        id: true, name: true, crmAccountId: true, installationId: true,
        receiverRut: true,
      },
    }),
    db.financeDte.findMany({
      where: {
        tenantId,
        direction: "ISSUED",
        dteType: { in: [33, 34] },
        siiStatus: { in: ["ACCEPTED", "PENDING", "SENT"] },
        voidedByCreditNoteId: null,
        creditedNetAmount: 0,
        paymentStatus: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
      },
      select: {
        crmAccountId: true, installationId: true, receiverRut: true,
        recurringTemplateId: true,
      },
    }),
    db.financeDte.findMany({
      where: {
        tenantId,
        direction: "ISSUED",
        siiStatus: "DRAFT",
        recurringTemplateId: { not: null },
        voidedByCreditNoteId: null,
      },
      select: {
        crmAccountId: true, installationId: true, receiverRut: true,
        recurringTemplateId: true,
      },
    }),
    db.crmAccount.findMany({
      where: { tenantId },
      select: { id: true, name: true, rut: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const accountByRut = new Map<string, string>();
  for (const a of accounts) {
    if (!a.rut) continue;
    const key = cleanRut(a.rut);
    if (key && !accountByRut.has(key)) accountByRut.set(key, a.id);
  }
  const resolveAccount = (
    crmAccountId: string | null,
    receiverRut: string | null | undefined,
  ): string | null => {
    if (crmAccountId) return crmAccountId;
    if (!receiverRut) return null;
    const key = cleanRut(receiverRut);
    return key ? (accountByRut.get(key) ?? null) : null;
  };

  const refs: FlowRowRef[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    crmAccountId: r.crmAccountId,
    installationId: r.installationId,
    recurringTemplateId: r.recurringTemplateId,
    categoryId: r.categoryId,
    supplierId: r.supplierId,
  }));
  const linkedTemplates = new Set(
    rows.map((r) => r.recurringTemplateId).filter((x): x is string => !!x),
  );

  const missingTemplates: MissingTemplate[] = [];
  for (const t of templates) {
    if (linkedTemplates.has(t.id)) continue;
    const accId = resolveAccount(t.crmAccountId, t.receiverRut);
    if (!accId) continue;
    const acc = accountById.get(accId);
    if (!acc) continue;
    missingTemplates.push({
      id: t.id,
      name: (t.name || acc.name).trim() || acc.name,
      crmAccountId: accId,
      installationId: t.installationId,
    });
  }

  // Tras "imaginar" las filas de template que vamos a crear, detectar cuentas
  // con facturas/borradores que siguen sin fila (one-shot / sin programación).
  const pendingRefs: FlowRowRef[] = [
    ...refs,
    ...missingTemplates.map((t) => ({
      id: `pending:${t.id}`,
      name: t.name,
      crmAccountId: t.crmAccountId,
      installationId: t.installationId,
      recurringTemplateId: t.id,
      categoryId: null,
    })),
  ];
  const matchAfter = buildIncomeMatcher(pendingRefs);
  const missingAccountIds = new Set<string>();
  for (const d of [...dtes, ...drafts]) {
    const accId = resolveAccount(d.crmAccountId, d.receiverRut);
    if (!accId) continue;
    if (matchAfter(accId, d.installationId, d.recurringTemplateId) === UNMATCHED_INCOME_KEY) {
      missingAccountIds.add(accId);
    }
  }

  const missingAccounts: MissingAccount[] = [];
  for (const id of missingAccountIds) {
    const acc = accountById.get(id);
    if (!acc) continue;
    missingAccounts.push({ crmAccountId: id, name: acc.name });
  }

  return { templates: missingTemplates, accounts: missingAccounts };
}
