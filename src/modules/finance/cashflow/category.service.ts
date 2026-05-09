import "server-only";
import { prisma } from "@/lib/prisma";
import type { FinanceCashflowCategory, FinanceCashflowItemKind } from "@prisma/client";

export const SYSTEM_CATEGORIES: Array<{
  code: string;
  name: string;
  kind: FinanceCashflowItemKind;
  sortOrder: number;
  color: string;
}> = [
  // Ingresos
  { code: "ING_VENTA_CONTRATO", name: "Ventas por contrato", kind: "INCOME", sortOrder: 10, color: "#10B981" },
  { code: "ING_TURNO_EXTRA", name: "Cobro turnos extra", kind: "INCOME", sortOrder: 20, color: "#22C55E" },
  { code: "ING_INSTALACION", name: "Cobro instalaciones", kind: "INCOME", sortOrder: 30, color: "#34D399" },
  { code: "ING_OTRO", name: "Otros ingresos", kind: "INCOME", sortOrder: 90, color: "#86EFAC" },
  // Egresos operativos
  { code: "EGR_SUELDO", name: "Sueldos", kind: "EXPENSE", sortOrder: 110, color: "#EF4444" },
  { code: "EGR_QUINCENA", name: "Quincenas / anticipos", kind: "EXPENSE", sortOrder: 115, color: "#F87171" },
  { code: "EGR_PREVIRED", name: "Previred (cotizaciones)", kind: "EXPENSE", sortOrder: 120, color: "#DC2626" },
  { code: "EGR_TURNO_EXTRA", name: "Pago turnos extra", kind: "EXPENSE", sortOrder: 130, color: "#F97316" },
  // Egresos administrativos
  { code: "EGR_TELEFONIA", name: "Telefonía", kind: "EXPENSE", sortOrder: 200, color: "#8B5CF6" },
  { code: "EGR_ARRIENDO", name: "Arriendos", kind: "EXPENSE", sortOrder: 210, color: "#A78BFA" },
  { code: "EGR_SERVICIOS", name: "Servicios básicos", kind: "EXPENSE", sortOrder: 220, color: "#C4B5FD" },
  { code: "EGR_PROVEEDOR", name: "Proveedores varios", kind: "EXPENSE", sortOrder: 230, color: "#6366F1" },
  // Tributarios
  { code: "EGR_IVA_F29", name: "IVA F29", kind: "EXPENSE", sortOrder: 300, color: "#F59E0B" },
  { code: "EGR_IMPUESTO", name: "Otros impuestos", kind: "EXPENSE", sortOrder: 310, color: "#FBBF24" },
  // Financieros / socios
  { code: "EGR_RETIRO_SOCIO", name: "Retiros socios / dividendos", kind: "EXPENSE", sortOrder: 400, color: "#0EA5E9" },
  { code: "EGR_OTRO", name: "Otros egresos", kind: "EXPENSE", sortOrder: 990, color: "#94A3B8" },
];

export async function seedSystemCategoriesForTenant(tenantId: string): Promise<void> {
  for (const c of SYSTEM_CATEGORIES) {
    await prisma.financeCashflowCategory.upsert({
      where: { tenantId_code: { tenantId, code: c.code } },
      update: { name: c.name, sortOrder: c.sortOrder, color: c.color, isSystem: true, kind: c.kind },
      create: { tenantId, ...c, isSystem: true, isActive: true },
    });
  }
}

export async function listCategories(tenantId: string): Promise<FinanceCashflowCategory[]> {
  const count = await prisma.financeCashflowCategory.count({ where: { tenantId } });
  if (count === 0) await seedSystemCategoriesForTenant(tenantId);
  return prisma.financeCashflowCategory.findMany({
    where: { tenantId },
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function createCategory(
  tenantId: string,
  data: { code: string; name: string; kind: FinanceCashflowItemKind; color?: string; accountPlanId?: string; sortOrder?: number },
): Promise<FinanceCashflowCategory> {
  return prisma.financeCashflowCategory.create({
    data: { tenantId, ...data, isSystem: false, isActive: true },
  });
}

export async function updateCategory(
  tenantId: string,
  id: string,
  patch: Partial<{ name: string; color: string; sortOrder: number; accountPlanId: string | null; isActive: boolean }>,
): Promise<FinanceCashflowCategory> {
  const existing = await prisma.financeCashflowCategory.findFirst({ where: { id, tenantId } });
  if (!existing) throw new Error("Categoría no encontrada");
  return prisma.financeCashflowCategory.update({ where: { id }, data: patch });
}

export async function deleteCategory(tenantId: string, id: string): Promise<void> {
  const existing = await prisma.financeCashflowCategory.findFirst({ where: { id, tenantId } });
  if (!existing) throw new Error("Categoría no encontrada");
  if (existing.isSystem) throw new Error("No se puede eliminar una categoría del sistema");
  const inUse = await prisma.financeCashflowItem.count({ where: { tenantId, categoryId: id, isActive: true } });
  if (inUse > 0) throw new Error(`Categoría tiene ${inUse} items activos. Desactiva los items primero.`);
  await prisma.financeCashflowCategory.delete({ where: { id } });
}
