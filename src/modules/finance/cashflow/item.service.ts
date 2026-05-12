import "server-only";
import { prisma } from "@/lib/prisma";
import type {
  FinanceCashflowItem,
  FinanceCashflowItemKind,
  FinanceCashflowItemSource,
  FinanceCashflowRecurrence,
} from "@prisma/client";

export interface CreateItemInput {
  categoryId: string;
  kind: FinanceCashflowItemKind;
  source?: FinanceCashflowItemSource;
  sourceRefId?: string | null;
  name: string;
  description?: string;
  amount: number;
  currency?: string;
  ufFixingPolicy?: string;
  ufFixingDay?: number;
  recurrence: FinanceCashflowRecurrence;
  dayOfMonth?: number | null;
  dayOfWeek?: number | null;
  monthOfYear?: number | null;
  startDate: Date;
  endDate?: Date | null;
  installationId?: string | null;
  crmAccountId?: string | null;
  supplierId?: string | null;
  notes?: string;
}

export async function listItems(
  tenantId: string,
  filters: {
    kind?: FinanceCashflowItemKind;
    source?: FinanceCashflowItemSource;
    isActive?: boolean;
    installationId?: string;
  } = {},
) {
  return prisma.financeCashflowItem.findMany({
    where: {
      tenantId,
      ...(filters.kind && { kind: filters.kind }),
      ...(filters.source && { source: filters.source }),
      ...(filters.isActive !== undefined && { isActive: filters.isActive }),
      ...(filters.installationId && { installationId: filters.installationId }),
    },
    include: { category: { select: { code: true, name: true, color: true, sortOrder: true } } },
    orderBy: [{ isActive: "desc" }, { startDate: "asc" }],
  });
}

export async function getItem(tenantId: string, id: string): Promise<FinanceCashflowItem | null> {
  return prisma.financeCashflowItem.findFirst({ where: { id, tenantId } });
}

export async function createItem(
  tenantId: string,
  createdBy: string | null,
  input: CreateItemInput,
): Promise<FinanceCashflowItem> {
  validateItemInput(input);
  const cat = await prisma.financeCashflowCategory.findFirst({
    where: { id: input.categoryId, tenantId, isActive: true },
  });
  if (!cat) throw new Error("Categoría no válida o inactiva");
  if (cat.kind !== input.kind) {
    throw new Error(`Kind del item (${input.kind}) no coincide con el de la categoría (${cat.kind})`);
  }

  return prisma.financeCashflowItem.create({
    data: {
      tenantId,
      createdBy: createdBy ?? undefined,
      categoryId: input.categoryId,
      kind: input.kind,
      source: input.source ?? "MANUAL",
      sourceRefId: input.sourceRefId ?? null,
      name: input.name,
      description: input.description,
      amount: input.amount,
      currency: input.currency ?? "CLP",
      ufFixingPolicy: input.ufFixingPolicy,
      ufFixingDay: input.ufFixingDay,
      recurrence: input.recurrence,
      dayOfMonth: input.dayOfMonth,
      dayOfWeek: input.dayOfWeek,
      monthOfYear: input.monthOfYear,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      installationId: input.installationId ?? null,
      crmAccountId: input.crmAccountId ?? null,
      supplierId: input.supplierId ?? null,
      notes: input.notes,
      isActive: true,
    },
  });
}

/**
 * Sources de items cuya plata, recurrencia o vínculos NO se editan desde
 * el módulo de Cashflow porque la fuente de verdad vive en otro módulo
 * (dotación de instalaciones, contratos del CRM, F29 del SII, etc.). El
 * cron diario `cashflow-sync` re-materializa estos items desde su fuente
 * — cualquier edición acá se pierde silenciosamente.
 *
 * Para estos sources, solo se permite editar metadata cosmética
 * (descripción, notas) o desactivar el item. Para cambiar el monto, hay
 * que ir a la fuente de verdad (la ficha de instalación, el contrato
 * CRM, etc.).
 */
const LOCKED_SOURCES = new Set<FinanceCashflowItemSource>([
  "CONTRACT",
  "PAYROLL",
  "PAYROLL_LIQUIDO",
  "PAYROLL_PREVIRED",
  "TURNOS_EXTRA",
  "IVA",
  "RECURRING_DTE",
]);

const SOURCE_LABEL: Partial<Record<FinanceCashflowItemSource, string>> = {
  CONTRACT: "Contrato del CRM",
  PAYROLL: "Dotación de instalaciones",
  PAYROLL_LIQUIDO: "Dotación de instalaciones (sueldo líquido)",
  PAYROLL_PREVIRED: "Dotación de instalaciones (PreviRed)",
  TURNOS_EXTRA: "Histórico de turnos extra",
  IVA: "F29 del SII",
  RECURRING_DTE: "DTE recurrente",
};

/** Campos cuya modificación se materializaría en BD pero el cron de
 * cashflow-sync sobrescribiría al día siguiente. Si el caller intenta
 * cambiar uno de estos en un item lockeado, rechazamos con error claro. */
const STRUCTURAL_FIELDS = [
  "categoryId",
  "kind",
  "amount",
  "currency",
  "ufFixingPolicy",
  "ufFixingDay",
  "recurrence",
  "dayOfMonth",
  "dayOfWeek",
  "monthOfYear",
  "startDate",
  "endDate",
  "installationId",
  "crmAccountId",
  "supplierId",
  "source",
  "sourceRefId",
] as const;

export async function updateItem(
  tenantId: string,
  id: string,
  patch: Partial<CreateItemInput> & { isActive?: boolean },
): Promise<FinanceCashflowItem> {
  const existing = await getItem(tenantId, id);
  if (!existing) throw new Error("Item no encontrado");

  if (LOCKED_SOURCES.has(existing.source)) {
    const attempted = STRUCTURAL_FIELDS.filter(
      (f) => patch[f] !== undefined,
    );
    if (attempted.length > 0) {
      const label = SOURCE_LABEL[existing.source] ?? existing.source;
      throw new Error(
        `Este ítem es auto-generado desde ${label}. No se puede editar monto, recurrencia ni fechas desde el módulo de Flujo de Caja porque el cron diario lo sobrescribiría. Para cambiarlo, edita la fuente original. Solo puedes editar el nombre, descripción, notas o desactivar el ítem.`,
      );
    }
  }

  if (patch.amount !== undefined || patch.recurrence !== undefined) {
    validateItemInput({
      ...existing,
      ...patch,
      amount: Number(patch.amount ?? existing.amount),
      currency: (patch.currency ?? existing.currency) as string,
      recurrence: (patch.recurrence ?? existing.recurrence) as FinanceCashflowRecurrence,
      dayOfMonth: patch.dayOfMonth ?? existing.dayOfMonth,
      dayOfWeek: patch.dayOfWeek ?? existing.dayOfWeek,
      monthOfYear: patch.monthOfYear ?? existing.monthOfYear,
      startDate: patch.startDate ?? existing.startDate,
      endDate: patch.endDate === undefined ? existing.endDate : patch.endDate,
    });
  }
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) data[k] = v;
  }
  return prisma.financeCashflowItem.update({ where: { id }, data });
}

export async function deleteItem(tenantId: string, id: string): Promise<void> {
  const existing = await getItem(tenantId, id);
  if (!existing) throw new Error("Item no encontrado");
  if (LOCKED_SOURCES.has(existing.source)) {
    const label = SOURCE_LABEL[existing.source] ?? existing.source;
    throw new Error(
      `Este ítem es auto-generado desde ${label} y el cron lo volvería a crear. Para que desaparezca del flujo de caja, elimina/desactiva la fuente original (ej. desactivar el puesto operativo o eliminar el contrato del CRM).`,
    );
  }
  await prisma.financeCashflowItem.delete({ where: { id } });
}

function validateItemInput(
  input: Pick<
    CreateItemInput,
    "amount" | "currency" | "recurrence" | "dayOfMonth" | "dayOfWeek" | "monthOfYear" | "startDate" | "endDate"
  >,
) {
  if (input.amount <= 0) throw new Error("El monto debe ser mayor a 0");
  if (input.currency && !["CLP", "UF"].includes(input.currency)) {
    throw new Error("Moneda debe ser CLP o UF");
  }
  if (input.endDate && input.startDate > input.endDate) {
    throw new Error("startDate no puede ser mayor a endDate");
  }
  if (
    ["WEEKLY", "BIWEEKLY"].includes(input.recurrence) &&
    (input.dayOfWeek === null || input.dayOfWeek === undefined)
  ) {
    throw new Error("dayOfWeek es obligatorio para WEEKLY/BIWEEKLY (0=Dom, 6=Sáb)");
  }
  if (
    ["MONTHLY", "QUARTERLY", "YEARLY"].includes(input.recurrence) &&
    (input.dayOfMonth === null || input.dayOfMonth === undefined)
  ) {
    throw new Error("dayOfMonth es obligatorio (-1 para último día)");
  }
  if (
    input.recurrence === "YEARLY" &&
    (input.monthOfYear === null || input.monthOfYear === undefined)
  ) {
    throw new Error("monthOfYear es obligatorio para YEARLY (1-12)");
  }
}
