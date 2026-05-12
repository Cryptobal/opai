/**
 * Re-seed de categorías sistema del flujo de caja para todos los tenants
 * activos. Idempotente: upsert por (tenantId, code).
 *
 * Duplica el catálogo de category.service.ts inline para evitar la
 * dependencia de `server-only` en CLI.
 *
 * Uso:
 *   npx tsx scripts/seed-cashflow-categories.ts
 *   TENANT_SLUG=gard npx tsx scripts/seed-cashflow-categories.ts
 */

import { PrismaClient, FinanceCashflowItemKind } from "@prisma/client";

const prisma = new PrismaClient();

const SYSTEM_CATEGORIES: Array<{
  code: string;
  name: string;
  kind: FinanceCashflowItemKind;
  sortOrder: number;
  color: string;
}> = [
  { code: "ING_VENTA_CONTRATO", name: "Ventas por contrato", kind: "INCOME", sortOrder: 10, color: "#10B981" },
  { code: "ING_TURNO_EXTRA", name: "Cobro turnos extra", kind: "INCOME", sortOrder: 20, color: "#22C55E" },
  { code: "ING_INSTALACION", name: "Cobro instalaciones", kind: "INCOME", sortOrder: 30, color: "#34D399" },
  { code: "ING_OTRO", name: "Otros ingresos", kind: "INCOME", sortOrder: 90, color: "#86EFAC" },
  { code: "EGR_SUELDO", name: "Sueldos líquidos", kind: "EXPENSE", sortOrder: 110, color: "#EF4444" },
  { code: "EGR_QUINCENA", name: "Quincenas / anticipos", kind: "EXPENSE", sortOrder: 115, color: "#F87171" },
  { code: "EGR_PREVIRED", name: "Previred (cotizaciones)", kind: "EXPENSE", sortOrder: 120, color: "#DC2626" },
  { code: "EGR_TURNO_EXTRA", name: "Pago turnos extra", kind: "EXPENSE", sortOrder: 130, color: "#F97316" },
  { code: "EGR_TELEFONIA", name: "Telefonía", kind: "EXPENSE", sortOrder: 200, color: "#8B5CF6" },
  { code: "EGR_ARRIENDO", name: "Arriendos", kind: "EXPENSE", sortOrder: 210, color: "#A78BFA" },
  { code: "EGR_SERVICIOS", name: "Servicios básicos", kind: "EXPENSE", sortOrder: 220, color: "#C4B5FD" },
  { code: "EGR_PROVEEDOR", name: "Proveedores varios", kind: "EXPENSE", sortOrder: 230, color: "#6366F1" },
  { code: "EGR_IVA_F29", name: "IVA F29", kind: "EXPENSE", sortOrder: 300, color: "#F59E0B" },
  { code: "EGR_IMPUESTO", name: "Otros impuestos", kind: "EXPENSE", sortOrder: 310, color: "#FBBF24" },
  { code: "EGR_RETIRO_SOCIO", name: "Retiros socios / dividendos", kind: "EXPENSE", sortOrder: 400, color: "#0EA5E9" },
  { code: "EGR_OTRO", name: "Otros egresos", kind: "EXPENSE", sortOrder: 990, color: "#94A3B8" },
  // Ajustes de conciliación: se usan al cerrar drift entre saldo proyectado
  // y saldo real del banco. La UI muestra estas líneas en el flujo como
  // ajustes explícitos del usuario para mantener la cuadratura.
  { code: "ING_AJUSTE_CONCILIACION", name: "Ajuste de conciliación (ingreso)", kind: "INCOME", sortOrder: 990, color: "#64748B" },
  { code: "EGR_AJUSTE_CONCILIACION", name: "Ajuste de conciliación (egreso)", kind: "EXPENSE", sortOrder: 995, color: "#64748B" },
];

async function seedForTenant(tenantId: string) {
  let created = 0;
  let updated = 0;
  for (const c of SYSTEM_CATEGORIES) {
    const before = await prisma.financeCashflowCategory.findUnique({
      where: { tenantId_code: { tenantId, code: c.code } },
      select: { id: true },
    });
    await prisma.financeCashflowCategory.upsert({
      where: { tenantId_code: { tenantId, code: c.code } },
      update: {
        name: c.name,
        sortOrder: c.sortOrder,
        color: c.color,
        isSystem: true,
        kind: c.kind,
      },
      create: { tenantId, ...c, isSystem: true, isActive: true },
    });
    if (before) updated++;
    else created++;
  }
  return { created, updated };
}

async function main() {
  const slug = process.env.TENANT_SLUG;
  const tenants = await prisma.tenant.findMany({
    where: { active: true, ...(slug ? { slug } : {}) },
    select: { id: true, slug: true, name: true },
  });
  if (tenants.length === 0) {
    console.error(`❌ No tenants${slug ? ` para "${slug}"` : ""}`);
    process.exit(1);
  }
  console.log(`🌱 Sembrando categorías en ${tenants.length} tenant(s)…\n`);
  for (const t of tenants) {
    const r = await seedForTenant(t.id);
    console.log(`📦 ${t.slug} → ${r.created} nuevas · ${r.updated} actualizadas`);
  }
  console.log("\n✅ Done");
}

main()
  .catch((err) => {
    console.error("❌", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
