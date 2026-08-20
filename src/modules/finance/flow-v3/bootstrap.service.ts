import "server-only";
import { Prisma, type FlowSection } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CANONICAL_FLOW_ROWS } from "./canonical-rows";
import { linkPayrollSubrows } from "./link-payroll-subrows";
import { linkPayrollSubrows } from "./link-payroll-subrows";

type Tx = Prisma.TransactionClient;

/**
 * Auto-bootstrap de la planilla: si el tenant NO tiene ninguna fila, las crea
 * en la primera carga del matrix — nadie corre scripts:
 *  1. Una fila INGRESOS por cada programación activa (1 template = 1 fila).
 *  2. Filas canónicas de egresos (CATEGORY si la categoría del viejo existe).
 *  3. Backfill de término de pago POR CONTRATO: copia diasCobroDesdeFactura
 *     de los items del módulo viejo (source CONTRACT/OTHER, donde Carlos ya
 *     configuró términos por contrato) a la programación equivalente —
 *     SOLO cuando el template aún no tiene término propio (null).
 *
 * ATOMICIDAD: como FinanceFlowRow no tiene unique en sus claves naturales, dos
 * primeras cargas concurrentes podrían duplicar filas. Se serializa con un
 * advisory lock transaccional por tenant + doble chequeo del rowCount dentro
 * de la transacción (el segundo request encuentra filas y sale sin escribir).
 *
 * Programaciones NUEVAS después del bootstrap las adopta/crea
 * `reconcileIncomeRows` en cada carga con permiso de gestión.
 */
export async function ensureFlowBootstrap(tenantId: string): Promise<void> {
  // Fast path sin lock: la enorme mayoría de las cargas ya tienen filas.
  const rowCount = await prisma.financeFlowRow.count({ where: { tenantId } });
  if (rowCount > 0) return;

  await prisma.$transaction(async (tx) => {
    // Lock por tenant: serializa el primerísimo bootstrap concurrente. Se
    // libera solo al terminar la transacción. La key combina un namespace fijo
    // con el tenant para no chocar con otros advisory locks del sistema.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`flow-v3-bootstrap:${tenantId}`})::int8)`;

    // Doble chequeo: si otra request ya sembró, salir sin duplicar.
    const recount = await tx.financeFlowRow.count({ where: { tenantId } });
    if (recount > 0) return;

    await runBootstrap(tx, tenantId);
  });
}

async function runBootstrap(tx: Tx, tenantId: string): Promise<void> {
  const [templates, categories, oldItems] = await Promise.all([
    tx.financeDteRecurringTemplate.findMany({
      where: { tenantId, isActive: true, crmAccountId: { not: null } },
      select: {
        id: true, name: true, crmAccountId: true, installationId: true,
        diasCobroDesdeFactura: true,
      },
    }),
    tx.financeCashflowCategory.findMany({
      where: { tenantId },
      select: { id: true, code: true },
    }),
    tx.financeCashflowItem.findMany({
      where: {
        tenantId,
        source: { in: ["CONTRACT", "OTHER"] },
        isActive: true,
        diasCobroDesdeFactura: { gt: 0 },
        crmAccountId: { not: null },
      },
      select: { crmAccountId: true, installationId: true, diasCobroDesdeFactura: true },
    }),
  ]);

  let orderIndex = 0;
  const createdByKey = new Map<string, string>();
  const createRow = async (data: {
    section: FlowSection;
    name: string;
    mapping: "ACCOUNT_INSTALLATION" | "CATEGORY" | "ACCOUNTS" | "MANUAL";
    crmAccountId?: string | null;
    installationId?: string | null;
    recurringTemplateId?: string | null;
    categoryId?: string | null;
    canonicalKey?: import("@prisma/client").FlowRowKey | null;
    parentId?: string | null;
  }) => {
    const row = await tx.financeFlowRow.create({
      data: {
        tenantId, section: data.section, name: data.name, mapping: data.mapping,
        orderIndex: orderIndex++,
        crmAccountId: data.crmAccountId ?? null,
        installationId: data.installationId ?? null,
        recurringTemplateId: data.recurringTemplateId ?? null,
        categoryId: data.categoryId ?? null,
        canonicalKey: data.canonicalKey ?? null,
        parentId: data.parentId ?? null,
      },
      select: { id: true, canonicalKey: true },
    });
    if (row.canonicalKey) createdByKey.set(row.canonicalKey, row.id);
    return row;
  };

  // 1. Una fila por programación activa (nombre = template.name).
  const seenTpl = new Set<string>();
  for (const t of templates) {
    if (seenTpl.has(t.id)) continue;
    seenTpl.add(t.id);
    const account = await tx.crmAccount.findFirst({
      where: { id: t.crmAccountId!, tenantId },
      select: { name: true },
    });
    if (!account) continue;
    const name = (t.name || account.name).trim() || account.name;
    await createRow({
      section: "INGRESOS",
      name,
      mapping: "ACCOUNT_INSTALLATION",
      crmAccountId: t.crmAccountId,
      installationId: t.installationId,
      recurringTemplateId: t.id,
    });
  }

  // 2. Filas canónicas: padres primero, luego hijos con parentId.
  const catByCode = new Map(categories.map((c) => [c.code, c.id]));
  const parents = CANONICAL_FLOW_ROWS.filter((c) => !c.parentCanonicalKey);
  const children = CANONICAL_FLOW_ROWS.filter((c) => c.parentCanonicalKey);
  for (const c of [...parents, ...children]) {
    const categoryId = c.categoryCode ? (catByCode.get(c.categoryCode) ?? null) : null;
    const parentId = c.parentCanonicalKey
      ? (createdByKey.get(c.parentCanonicalKey) ?? null)
      : null;
    await createRow({
      section: c.section, name: c.name,
      mapping: c.canonicalKey || categoryId ? "ACCOUNTS" : "MANUAL",
      categoryId,
      canonicalKey: c.canonicalKey,
      parentId,
    });
  }

  // 3. Backfill término de pago por contrato desde el módulo viejo.
  const termByKey = new Map<string, number>();
  for (const it of oldItems) {
    const exact = `${it.crmAccountId}::${it.installationId ?? ""}`;
    if (!termByKey.has(exact)) termByKey.set(exact, it.diasCobroDesdeFactura);
    const generic = `${it.crmAccountId}::`;
    if (!termByKey.has(generic)) termByKey.set(generic, it.diasCobroDesdeFactura);
  }
  for (const t of templates) {
    if (t.diasCobroDesdeFactura != null) continue; // término propio ya fijado: no pisar
    const dias =
      termByKey.get(`${t.crmAccountId}::${t.installationId ?? ""}`) ??
      termByKey.get(`${t.crmAccountId}::`);
    if (dias != null) {
      await tx.financeDteRecurringTemplate.update({
        where: { id: t.id },
        data: { diasCobroDesdeFactura: dias },
      });
    }
  }

  await linkPayrollSubrows(tx, tenantId);
}
