import "server-only";
import { prisma } from "@/lib/prisma";
import type { FinanceFlowRow, FlowRowMapping, FlowSection } from "@prisma/client";

export interface CreateRowInput {
  section: FlowSection;
  name: string;
  mapping: FlowRowMapping;
  crmAccountId?: string | null;
  installationId?: string | null;
  categoryId?: string | null;
  supplierId?: string | null;
}

export interface ArchiveRowResult {
  row: FinanceFlowRow;
  /** Programaciones activas de la cuenta/instalación de la fila (la UI decide
   *  si además las desactiva). Vacío si no aplica. */
  warning: { activeRecurringTemplateIds: string[] } | null;
}

/** Valida que las referencias del mapping existan y sean del tenant. */
async function assertMappingRefs(tenantId: string, input: CreateRowInput): Promise<void> {
  if (input.mapping === "ACCOUNT_INSTALLATION") {
    if (!input.crmAccountId) throw new Error("crmAccountId requerido para mapping ACCOUNT_INSTALLATION");
    const account = await prisma.crmAccount.findFirst({
      where: { id: input.crmAccountId, tenantId },
      select: { id: true },
    });
    if (!account) throw new Error("Cuenta CRM no encontrada");
    if (input.installationId) {
      const inst = await prisma.crmInstallation.findFirst({
        where: { id: input.installationId, tenantId, accountId: input.crmAccountId },
        select: { id: true },
      });
      if (!inst) throw new Error("Instalación no encontrada para esa cuenta");
    }
  } else if (input.mapping === "CATEGORY") {
    if (!input.categoryId) throw new Error("categoryId requerido para mapping CATEGORY");
    const cat = await prisma.financeCashflowCategory.findFirst({
      where: { id: input.categoryId, tenantId },
      select: { id: true },
    });
    if (!cat) throw new Error("Categoría no encontrada");
  } else if (input.mapping === "SUPPLIER") {
    if (!input.supplierId) throw new Error("supplierId requerido para mapping SUPPLIER");
    const sup = await prisma.financeSupplier.findFirst({
      where: { id: input.supplierId, tenantId },
      select: { id: true },
    });
    if (!sup) throw new Error("Proveedor no encontrado");
  }
}

export async function listRows(tenantId: string): Promise<FinanceFlowRow[]> {
  return prisma.financeFlowRow.findMany({
    where: { tenantId },
    orderBy: [{ section: "asc" }, { orderIndex: "asc" }, { createdAt: "asc" }],
  });
}

export async function createRow(
  tenantId: string,
  input: CreateRowInput,
): Promise<FinanceFlowRow> {
  await assertMappingRefs(tenantId, input);
  const last = await prisma.financeFlowRow.findFirst({
    where: { tenantId, section: input.section },
    orderBy: { orderIndex: "desc" },
    select: { orderIndex: true },
  });
  const created = await prisma.financeFlowRow.create({
    data: {
      tenantId,
      section: input.section,
      name: input.name.trim(),
      mapping: input.mapping,
      orderIndex: (last?.orderIndex ?? -1) + 1,
      crmAccountId: input.mapping === "ACCOUNT_INSTALLATION" ? input.crmAccountId : null,
      installationId: input.mapping === "ACCOUNT_INSTALLATION" ? (input.installationId ?? null) : null,
      categoryId: input.mapping === "CATEGORY" ? input.categoryId : null,
      supplierId: input.mapping === "SUPPLIER" ? input.supplierId : null,
    },
  });
  // Verdad Verificada: releer de DB.
  return prisma.financeFlowRow.findFirstOrThrow({ where: { id: created.id, tenantId } });
}

export async function renameRow(
  tenantId: string,
  rowId: string,
  name: string,
): Promise<FinanceFlowRow> {
  const row = await prisma.financeFlowRow.findFirst({ where: { id: rowId, tenantId } });
  if (!row) throw new Error("Fila no encontrada");
  await prisma.financeFlowRow.update({ where: { id: row.id }, data: { name: name.trim() } });
  return prisma.financeFlowRow.findFirstOrThrow({ where: { id: rowId, tenantId } });
}

/** Reordena las filas de una sección según el arreglo de ids entregado. */
export async function reorderRows(
  tenantId: string,
  section: FlowSection,
  orderedIds: string[],
): Promise<void> {
  const rows = await prisma.financeFlowRow.findMany({
    where: { tenantId, section, id: { in: orderedIds } },
    select: { id: true },
  });
  const valid = new Set(rows.map((r) => r.id));
  const updates = orderedIds
    .filter((id) => valid.has(id))
    .map((id, i) =>
      prisma.financeFlowRow.update({ where: { id }, data: { orderIndex: i } }),
    );
  await prisma.$transaction(updates);
}

/**
 * Archiva (nunca borra): las FlowPlanCell quedan como histórico y el matrix
 * incluye la fila solo cuando la ventana pedida cubre semanas con movimiento.
 * Si la fila mapea cuenta/instalación con programación activa, devuelve el
 * warning para que la UI ofrezca "desactivar programación también".
 */
export async function archiveRow(tenantId: string, rowId: string): Promise<ArchiveRowResult> {
  const row = await prisma.financeFlowRow.findFirst({ where: { id: rowId, tenantId } });
  if (!row) throw new Error("Fila no encontrada");

  let warning: ArchiveRowResult["warning"] = null;
  if (row.mapping === "ACCOUNT_INSTALLATION" && row.crmAccountId) {
    const templates = await prisma.financeDteRecurringTemplate.findMany({
      where: {
        tenantId,
        isActive: true,
        crmAccountId: row.crmAccountId,
        ...(row.installationId ? { installationId: row.installationId } : {}),
      },
      select: { id: true },
    });
    if (templates.length > 0) {
      warning = { activeRecurringTemplateIds: templates.map((t) => t.id) };
    }
  }

  await prisma.financeFlowRow.update({
    where: { id: row.id },
    data: { archivedAt: new Date() },
  });
  const fresh = await prisma.financeFlowRow.findFirstOrThrow({ where: { id: rowId, tenantId } });
  return { row: fresh, warning };
}
