/**
 * Flujo v3 — Comparación módulo viejo vs derivadores nuevos (READ ONLY).
 *
 * Para las últimas 4 semanas CERRADAS (lunes a domingo, sin la actual):
 *   - VIEJO: FinanceCashflowOccurrence del rango, separando PAID (real del
 *     viejo) y PROJECTED (proyección que quedó en el pasado). PROJECTED de
 *     categoría afecta se multiplica ×1.19 (así lo muestra la proyección
 *     vieja; los items se guardan en NETO).
 *   - NUEVO: capa REAL derivada de movimientos bancarios (misma query del
 *     loader v3 + deriveReal puro, sin server-only).
 * Vuelca una tabla markdown por semana × sección para pegar en QA.md.
 *
 * Diferencias ESPERADAS (documentar, no "corregir" el nuevo):
 *   - el viejo arrastra drift de occurrences (montos proyectados congelados,
 *     matches manuales, ajustes de cierre);
 *   - el nuevo suma TODO movimiento visible (sin conciliar → "Otros"), el
 *     viejo solo lo que alcanzó a matchear;
 *   - IVA: viejo PROYECTADO bruto estimado ×1.19 vs banco real.
 *
 * Uso: TENANT_SLUG=gard npx tsx scripts/flow-v3-compare.ts
 */
import { PrismaClient } from "@prisma/client";
import { deriveReal, type DteRefInput, type RealTxInput } from "../src/modules/finance/flow-v3/derive-real";
import { UNMATCHED_EXPENSE_KEY, UNMATCHED_INCOME_KEY, type FlowRowRef } from "../src/modules/finance/flow-v3/types";
import { enumerateWeeks, startOfIsoWeekUTC, addWeeksUTC, toYmd } from "../src/modules/finance/flow-v3/weeks";

const prisma = new PrismaClient();

const CODE_TO_SECTION: Record<string, string> = {
  EGR_SUELDO: "REMUNERACIONES", EGR_QUINCENA: "REMUNERACIONES",
  EGR_PREVIRED: "REMUNERACIONES", EGR_TURNO_EXTRA: "REMUNERACIONES",
  EGR_IVA_F29: "IMPUESTOS",
};
const sectionOfCategory = (code: string | null, kind: string): string =>
  kind === "INCOME" ? "INGRESOS" : (code && CODE_TO_SECTION[code]) || "GAV";

const clp = (n: number) => Math.round(n).toLocaleString("es-CL");

async function compareTenant(tenantId: string) {
  const currentMonday = startOfIsoWeekUTC(new Date());
  const from = addWeeksUTC(currentMonday, -4);
  const toExclusive = currentMonday;
  const weeks = enumerateWeeks(from, addWeeksUTC(currentMonday, -1));
  const rangeEnd = new Date(toExclusive.getTime() - 1);

  // ── NUEVO: real derivado del banco (mismas queries del loader v3) ──
  const rows = await prisma.financeFlowRow.findMany({ where: { tenantId } });
  const refs: FlowRowRef[] = rows.map((r) => ({
    id: r.id, name: r.name, section: r.section, mapping: r.mapping,
    crmAccountId: r.crmAccountId, installationId: r.installationId,
    categoryId: r.categoryId, supplierId: r.supplierId,
  }));
  const sectionByRowId = new Map(rows.map((r) => [r.id, r.section as string]));

  const txs = await prisma.financeBankTransaction.findMany({
    where: { tenantId, transactionDate: { gte: from, lte: rangeEnd }, hiddenAt: null, excludedReason: null },
    select: {
      id: true, transactionDate: true, amount: true, description: true,
      links: { select: { targetType: true, targetId: true, amount: true, accountPlanId: true } },
    },
  });
  const dteIds = [...new Set(txs.flatMap((t) => t.links.filter((l) => l.targetType.startsWith("DTE") && l.targetId).map((l) => l.targetId!)))];
  const dtes = dteIds.length
    ? await prisma.financeDte.findMany({
        where: { tenantId, id: { in: dteIds } },
        select: { id: true, folio: true, direction: true, crmAccountId: true, installationId: true, supplierId: true, receiverName: true, issuerName: true, lines: { select: { accountId: true } } },
      })
    : [];
  const accountPlanIds = [...new Set([
    ...txs.flatMap((t) => t.links.map((l) => l.accountPlanId).filter((x): x is string => !!x)),
    ...dtes.flatMap((d) => d.lines.map((l) => l.accountId).filter((x): x is string => !!x)),
  ])];
  const mappings = accountPlanIds.length
    ? await prisma.financeCashflowCategoryAccount.findMany({
        where: { tenantId, accountPlanId: { in: accountPlanIds } },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        select: { accountPlanId: true, categoryId: true },
      })
    : [];
  const categoryIdByPlan = new Map<string, string>();
  for (const m of mappings) if (!categoryIdByPlan.has(m.accountPlanId)) categoryIdByPlan.set(m.accountPlanId, m.categoryId);
  const categories = await prisma.financeCashflowCategory.findMany({ where: { tenantId }, select: { id: true, code: true, kind: true, isTaxExempt: true } });
  const codeById = new Map(categories.map((c) => [c.id, c.code]));

  const dteById = new Map<string, DteRefInput>(dtes.map((d) => {
    let categoryId: string | null = null;
    if (d.direction === "RECEIVED") {
      for (const l of d.lines) {
        const cid = l.accountId ? categoryIdByPlan.get(l.accountId) : undefined;
        if (cid) { categoryId = cid; break; }
      }
    }
    return [d.id, {
      folio: d.folio, direction: d.direction as "ISSUED" | "RECEIVED",
      crmAccountId: d.crmAccountId, installationId: d.installationId,
      supplierId: d.supplierId, categoryId,
      name: d.direction === "ISSUED" ? (d.receiverName ?? "") : (d.issuerName ?? ""),
    }];
  }));
  const txInputs: RealTxInput[] = txs.map((t) => ({
    id: t.id, dateYmd: t.transactionDate.toISOString().slice(0, 10),
    amountClp: Number(t.amount), description: t.description,
    links: t.links.map((l) => ({ targetType: l.targetType, targetId: l.targetId, amountClp: Number(l.amount), accountPlanId: l.accountPlanId })),
  }));
  const real = deriveReal({ rows: refs, weeks, txs: txInputs, dteById, categoryIdByAccountPlanId: categoryIdByPlan, categoryCodeById: codeById });

  // nuevo: semana → sección → total cash-signed
  const nuevo = new Map<string, Map<string, number>>();
  for (const [rowKey, byWeek] of real) {
    const section =
      rowKey === UNMATCHED_INCOME_KEY ? "INGRESOS" :
      rowKey === UNMATCHED_EXPENSE_KEY ? "GAV" :
      (sectionByRowId.get(rowKey) ?? "GAV");
    for (const [w, cell] of byWeek) {
      const m = nuevo.get(w) ?? new Map<string, number>();
      m.set(section, (m.get(section) ?? 0) + cell.total);
      nuevo.set(w, m);
    }
  }

  // ── VIEJO: occurrences del rango ──
  const occs = await prisma.financeCashflowOccurrence.findMany({
    where: { tenantId, scheduledDate: { gte: from, lte: rangeEnd } },
    select: {
      scheduledDate: true, effectiveDate: true, amountClp: true, status: true,
      item: { select: { kind: true, categoryId: true, category: { select: { code: true, isTaxExempt: true } } } },
    },
  });
  const viejoPaid = new Map<string, Map<string, number>>();
  const viejoProj = new Map<string, Map<string, number>>();
  for (const o of occs) {
    if (o.status === "CANCELLED") continue;
    const d = o.effectiveDate ?? o.scheduledDate;
    const w = toYmd(startOfIsoWeekUTC(d));
    if (!weeks.includes(w)) continue;
    const section = sectionOfCategory(o.item.category?.code ?? null, o.item.kind);
    const sign = o.item.kind === "INCOME" ? 1 : -1;
    let amount = Number(o.amountClp);
    const target = o.status === "PAID" ? viejoPaid : viejoProj;
    if (o.status !== "PAID" && !o.item.category?.isTaxExempt) amount *= 1.19;
    const m = target.get(w) ?? new Map<string, number>();
    m.set(section, (m.get(section) ?? 0) + sign * amount);
    target.set(w, m);
  }

  // ── Reporte markdown ──
  const SECTIONS = ["INGRESOS", "REMUNERACIONES", "IMPUESTOS", "GAV", "FINANCIAMIENTO", "OTROS"];
  console.log(`\n## Comparación viejo vs v3 — últimas 4 semanas cerradas (${weeks[0]} → ${weeks[weeks.length - 1]})\n`);
  console.log("| Semana | Sección | Viejo PAID | Viejo PROYECTADO (bruto) | v3 REAL (banco) | Δ v3−PAID |");
  console.log("|---|---|---:|---:|---:|---:|");
  for (const w of weeks) {
    for (const s of SECTIONS) {
      const p = viejoPaid.get(w)?.get(s) ?? 0;
      const pr = viejoProj.get(w)?.get(s) ?? 0;
      const n = nuevo.get(w)?.get(s) ?? 0;
      if (p === 0 && pr === 0 && n === 0) continue;
      console.log(`| ${w} | ${s} | ${clp(p)} | ${clp(pr)} | ${clp(n)} | ${clp(n - p)} |`);
    }
  }
  console.log("\n(Δ esperado ≠ 0: el viejo solo suma lo matcheado a occurrences; v3 suma todo movimiento bancario visible. Documentar, no corregir.)");
}

async function main() {
  const slug = process.env.TENANT_SLUG;
  const tenants = await prisma.tenant.findMany({
    where: { active: true, ...(slug ? { slug } : {}) },
    select: { id: true, slug: true },
  });
  if (tenants.length === 0 || (!slug && tenants.length > 1)) {
    console.error("❌ Especifica TENANT_SLUG=<slug>");
    process.exit(1);
  }
  for (const t of tenants) {
    console.log(`📊 Tenant ${t.slug}`);
    await compareTenant(t.id);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
