/**
 * Flujo v3 — Import único FC Gard: filas iniciales + plan desde JSON local.
 * IDEMPOTENTE: se puede correr N veces sin duplicar (filas por clave natural,
 * celdas por unique(rowId, weekStart)). NO conecta a Google Sheets.
 *
 * 1. Filas automáticas:
 *    - INGRESOS: una fila ACCOUNT_INSTALLATION por cada programación ACTIVA
 *      (1 FinanceDteRecurringTemplate = 1 fila; nombre = template.name).
 *    - Canónicas: REMUNERACIONES / IMPUESTOS / GAV / FINANCIAMIENTO según
 *      CANONICAL_ROWS (mapea a categorías del módulo viejo si existen) +
 *      fallbacks "Otros clientes" / "Otros gastos".
 * 2. Plan inicial: lee scripts/flow-v3-seed-plan.json (lo entrega Carlos;
 *    shape [{ rowName, weekStart, amount }]) y upsertea FlowPlanCells.
 *    weekStart debe ser lunes ISO YYYY-MM-DD.
 *
 * Uso:
 *   TENANT_SLUG=gard npx tsx scripts/flow-v3-import.ts
 */
import { PrismaClient, type FlowSection } from "@prisma/client";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

/** Fila canónica → sección + categoría del módulo viejo (si el tenant la tiene). */
const CANONICAL_ROWS: Array<{ section: FlowSection; name: string; categoryCode: string | null }> = [
  { section: "INGRESOS", name: "Otros clientes", categoryCode: null },
  { section: "REMUNERACIONES", name: "Sueldos líquidos", categoryCode: "EGR_SUELDO" },
  { section: "REMUNERACIONES", name: "Quincena (anticipos)", categoryCode: "EGR_QUINCENA" },
  { section: "REMUNERACIONES", name: "Imposiciones (Previred)", categoryCode: "EGR_PREVIRED" },
  { section: "REMUNERACIONES", name: "Turnos extra", categoryCode: "EGR_TURNO_EXTRA" },
  { section: "IMPUESTOS", name: "IVA F29", categoryCode: "EGR_IVA_F29" },
  { section: "GAV", name: "Otros gastos", categoryCode: null },
  { section: "FINANCIAMIENTO", name: "Créditos / financiamiento", categoryCode: null },
];

function isMondayYmd(ymd: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCDay() === 1;
}

async function ensureRow(args: {
  tenantId: string;
  section: FlowSection;
  name: string;
  mapping: "ACCOUNT_INSTALLATION" | "CATEGORY" | "MANUAL";
  crmAccountId?: string | null;
  installationId?: string | null;
  recurringTemplateId?: string | null;
  categoryId?: string | null;
}): Promise<{ id: string; created: boolean }> {
  const where =
    args.mapping === "ACCOUNT_INSTALLATION" && args.recurringTemplateId
      ? {
          tenantId: args.tenantId,
          recurringTemplateId: args.recurringTemplateId,
        }
      : args.mapping === "ACCOUNT_INSTALLATION"
        ? {
            tenantId: args.tenantId,
            mapping: args.mapping,
            crmAccountId: args.crmAccountId,
            installationId: args.installationId ?? null,
            recurringTemplateId: null,
          }
        : { tenantId: args.tenantId, section: args.section, name: args.name };
  const existing = await prisma.financeFlowRow.findFirst({ where });
  if (existing) return { id: existing.id, created: false };

  const last = await prisma.financeFlowRow.findFirst({
    where: { tenantId: args.tenantId, section: args.section },
    orderBy: { orderIndex: "desc" },
    select: { orderIndex: true },
  });
  const row = await prisma.financeFlowRow.create({
    data: {
      tenantId: args.tenantId,
      section: args.section,
      name: args.name,
      mapping: args.mapping,
      orderIndex: (last?.orderIndex ?? -1) + 1,
      crmAccountId: args.crmAccountId ?? null,
      installationId: args.installationId ?? null,
      recurringTemplateId: args.recurringTemplateId ?? null,
      categoryId: args.categoryId ?? null,
    },
  });
  return { id: row.id, created: true };
}

async function importTenant(tenantId: string, slug: string) {
  let created = 0;

  // 1a. Filas INGRESOS: 1 programación activa = 1 fila.
  const templates = await prisma.financeDteRecurringTemplate.findMany({
    where: { tenantId, isActive: true, crmAccountId: { not: null } },
    select: { id: true, name: true, crmAccountId: true, installationId: true },
  });
  const seenTpl = new Set<string>();
  for (const t of templates) {
    if (seenTpl.has(t.id)) continue;
    seenTpl.add(t.id);
    const account = await prisma.crmAccount.findFirst({
      where: { id: t.crmAccountId!, tenantId },
      select: { name: true },
    });
    if (!account) continue;
    const name = (t.name || account.name).trim() || account.name;
    const r = await ensureRow({
      tenantId, section: "INGRESOS", name, mapping: "ACCOUNT_INSTALLATION",
      crmAccountId: t.crmAccountId, installationId: t.installationId,
      recurringTemplateId: t.id,
    });
    if (r.created) created++;
  }

  // 1b. Filas canónicas (CATEGORY si la categoría existe; MANUAL si no).
  const categories = await prisma.financeCashflowCategory.findMany({
    where: { tenantId },
    select: { id: true, code: true },
  });
  const catByCode = new Map(categories.map((c) => [c.code, c.id]));
  for (const c of CANONICAL_ROWS) {
    const categoryId = c.categoryCode ? (catByCode.get(c.categoryCode) ?? null) : null;
    const r = await ensureRow({
      tenantId, section: c.section, name: c.name,
      mapping: categoryId ? "CATEGORY" : "MANUAL", categoryId,
    });
    if (r.created) created++;
  }

  // 2. Plan inicial desde JSON local (opcional).
  const seedPath = join(__dirname, "flow-v3-seed-plan.json");
  let cells = 0;
  let skipped = 0;
  if (existsSync(seedPath)) {
    const seed = JSON.parse(readFileSync(seedPath, "utf8")) as Array<{
      rowName: string; weekStart: string; amount: number;
    }>;
    const rows = await prisma.financeFlowRow.findMany({
      where: { tenantId },
      select: { id: true, name: true },
    });
    const rowByName = new Map(rows.map((r) => [r.name.trim().toLowerCase(), r.id]));
    for (const s of seed) {
      const rowId = rowByName.get(s.rowName.trim().toLowerCase());
      if (!rowId || !isMondayYmd(s.weekStart) || !Number.isFinite(s.amount)) {
        skipped++;
        console.warn(`   ⚠ seed saltado: ${JSON.stringify(s)}`);
        continue;
      }
      const weekStart = new Date(`${s.weekStart}T00:00:00.000Z`);
      if (s.amount === 0) {
        await prisma.financeFlowPlanCell.deleteMany({ where: { tenantId, rowId, weekStart } });
      } else {
        await prisma.financeFlowPlanCell.upsert({
          where: { tenantId_rowId_weekStart: { tenantId, rowId, weekStart } },
          create: { tenantId, rowId, weekStart, amount: s.amount, updatedBy: "flow-v3-import" },
          update: { amount: s.amount, updatedBy: "flow-v3-import" },
        });
      }
      cells++;
    }
  } else {
    console.log("   (sin scripts/flow-v3-seed-plan.json — solo filas)");
  }

  console.log(`   ✔ ${slug}: ${created} filas nuevas · ${cells} celdas plan · ${skipped} seeds saltados`);
}

async function main() {
  const slug = process.env.TENANT_SLUG;
  const tenants = await prisma.tenant.findMany({
    where: { active: true, ...(slug ? { slug } : {}) },
    select: { id: true, slug: true, name: true },
  });
  if (tenants.length === 0) {
    console.error(`❌ No se encontró tenant${slug ? ` con slug "${slug}"` : ""}`);
    process.exit(1);
  }
  if (!slug && tenants.length > 1) {
    console.error("❌ Hay varios tenants: especifica TENANT_SLUG=<slug>");
    process.exit(1);
  }
  for (const t of tenants) {
    console.log(`📦 ${t.slug} (${t.name})`);
    await importTenant(t.id, t.slug);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
