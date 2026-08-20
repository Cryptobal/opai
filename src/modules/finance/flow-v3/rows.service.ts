import "server-only";
import { prisma } from "@/lib/prisma";
import type {
  FinanceFlowRow,
  FlowRowKey,
  FlowRowMapping,
  FlowSection,
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import { addWeeksUTC, enumerateWeeks, startOfIsoWeekUTC, toYmd, weekStartYmd } from "./weeks";
import { loadCommittedIncome } from "./load-committed-income";
import { loadCommittedExpense } from "./load-committed-expense";
import { loadReal } from "./load-real";
import { setAccountsForRow } from "./rowAccount.service";
import { EXPENSE_ROW_KEYS, isBandejaKey } from "./row-keys";
import { SUBROW_SECTIONS } from "./row-tree";
import type { FlowRowRef } from "./types";
import { listClosedV3Weeks } from "./weekly-close.adapter";

export class FlowRowConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlowRowConflictError";
  }
}

export interface CreateRowInput {
  section: FlowSection;
  name: string;
  mapping: FlowRowMapping;
  crmAccountId?: string | null;
  installationId?: string | null;
  recurringTemplateId?: string | null;
  /** @deprecated Preferir accountPlanIds + canonicalKey. */
  categoryId?: string | null;
  accountPlanIds?: string[];
  canonicalKey?: FlowRowKey | null;
  supplierId?: string | null;
  parentId?: string | null;
}

export interface UpdateRowInput {
  /**
   * Nombre visible en la planilla. Se puede fijar en cualquier mapping no
   * virtual: es un alias de visualización (la fuente CRM/cuenta/proveedor
   * no se toca). Para volver al nombre de origen, el cliente envía el
   * `sourceName` calculado por el matrix.
   */
  name?: string;
  section?: FlowSection;
  accountPlanIds?: string[];
  canonicalKey?: FlowRowKey | null;
  /** @deprecated Preferir accountPlanIds. */
  categoryId?: string | null;
  /** Transición a ACCOUNTS/MANUAL. */
  mapping?: Extract<FlowRowMapping, "ACCOUNTS" | "CATEGORY" | "MANUAL">;
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
    if (input.recurringTemplateId) {
      const tpl = await prisma.financeDteRecurringTemplate.findFirst({
        where: {
          id: input.recurringTemplateId,
          tenantId,
          crmAccountId: input.crmAccountId,
        },
        select: { id: true },
      });
      if (!tpl) throw new Error("Programación no encontrada para esa cuenta");
    }
  } else if (input.mapping === "ACCOUNTS") {
    // Cuentas opcionales al crear; se validan en setAccountsForRow.
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

function assertExpenseKeyAllowed(
  section: FlowSection,
  canonicalKey: FlowRowKey | null | undefined,
  accountPlanIds: string[] | undefined,
  rowCanonicalKey?: FlowRowKey | null,
): void {
  const key = canonicalKey ?? undefined;
  const isBandeja = isBandejaKey(rowCanonicalKey) || isBandejaKey(key);
  if (
    (section === "INGRESOS" || section === "OTROS" || isBandeja) &&
    ((key && EXPENSE_ROW_KEYS.has(key) && key !== "BANDEJA_EGRESO" && key !== "BANDEJA_INGRESO") ||
      (accountPlanIds && accountPlanIds.length > 0 && (section === "INGRESOS" || section === "OTROS" || isBandeja)))
  ) {
    if (section === "INGRESOS" || section === "OTROS") {
      throw new Error(
        "Las filas de ingresos no admiten cuentas ni llaves de egreso",
      );
    }
    if (isBandeja && accountPlanIds && accountPlanIds.length > 0) {
      throw new Error("Las bandejas no admiten cuentas contables propias");
    }
    if (isBandeja && key && EXPENSE_ROW_KEYS.has(key) && !isBandejaKey(key)) {
      throw new Error("Las bandejas no admiten llaves de egreso adicionales");
    }
  }
}

async function assertParentForSubRow(
  tenantId: string,
  parentId: string,
): Promise<FinanceFlowRow> {
  const parent = await prisma.financeFlowRow.findFirst({
    where: { id: parentId, tenantId },
  });
  if (!parent) throw new Error("Fila padre no encontrada");
  if (parent.archivedAt) throw new Error("No se pueden agregar subfilas a una fila archivada");
  if (parent.parentId) throw new Error("Solo un nivel: el padre ya es una subfila");
  if (parent.canonicalKey) throw new Error("Las filas de sistema no admiten subfilas");
  if (!SUBROW_SECTIONS.has(parent.section)) {
    throw new Error("Las subfilas solo aplican a GAV u Otros");
  }
  return parent;
}

export async function createRow(
  tenantId: string,
  input: CreateRowInput,
): Promise<FinanceFlowRow> {
  let section = input.section;
  let parentId: string | null = null;
  if (input.parentId) {
    const parent = await assertParentForSubRow(tenantId, input.parentId);
    parentId = parent.id;
    section = parent.section;
    if (input.canonicalKey) {
      throw new Error("Una subfila no admite llave de sistema");
    }
    if (input.accountPlanIds && input.accountPlanIds.length > 0) {
      throw new Error("Las cuentas se asignan en la categoría padre");
    }
    if (
      input.mapping !== "MANUAL" &&
      input.mapping !== "SUPPLIER"
    ) {
      throw new Error("Una subfila es manual o de proveedor");
    }
  }

  await assertMappingRefs(tenantId, { ...input, section });
  assertExpenseKeyAllowed(
    section,
    input.canonicalKey,
    input.accountPlanIds,
  );

  if (input.canonicalKey) {
    const clash = await prisma.financeFlowRow.findFirst({
      where: {
        tenantId,
        canonicalKey: input.canonicalKey,
        archivedAt: null,
      },
      select: { id: true, name: true },
    });
    if (clash) {
      throw new FlowRowConflictError(
        `«${clash.name}» ya usa esta llave; una llave alimenta un solo renglón`,
      );
    }
  }

  const last = await prisma.financeFlowRow.findFirst({
    where: parentId
      ? { tenantId, parentId }
      : { tenantId, section, parentId: null },
    orderBy: { orderIndex: "desc" },
    select: { orderIndex: true },
  });

  const mapping: FlowRowMapping =
    input.mapping === "CATEGORY"
      ? "ACCOUNTS"
      : input.accountPlanIds && input.accountPlanIds.length > 0
        ? "ACCOUNTS"
        : input.mapping;

  let created: FinanceFlowRow;
  try {
    created = await prisma.financeFlowRow.create({
      data: {
        tenantId,
        section,
        name: input.name.trim(),
        mapping,
        orderIndex: (last?.orderIndex ?? -1) + 1,
        parentId,
        crmAccountId: input.mapping === "ACCOUNT_INSTALLATION" ? input.crmAccountId : null,
        installationId: input.mapping === "ACCOUNT_INSTALLATION" ? (input.installationId ?? null) : null,
        recurringTemplateId:
          input.mapping === "ACCOUNT_INSTALLATION" ? (input.recurringTemplateId ?? null) : null,
        categoryId: input.mapping === "CATEGORY" ? input.categoryId : null,
        canonicalKey: input.canonicalKey ?? null,
        supplierId: input.mapping === "SUPPLIER" ? input.supplierId : null,
      },
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      throw new FlowRowConflictError(
        "Esta llave ya está en uso por otro renglón activo",
      );
    }
    throw e;
  }

  if (input.accountPlanIds && input.accountPlanIds.length > 0) {
    await setAccountsForRow(tenantId, created.id, input.accountPlanIds);
  }

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

/**
 * Edita atributos LOCALES de la fila (nombre, sección, cuentas, llave).
 * Read-after-write.
 */
export async function updateRow(
  tenantId: string,
  rowId: string,
  input: UpdateRowInput,
): Promise<FinanceFlowRow> {
  const row = await prisma.financeFlowRow.findFirst({ where: { id: rowId, tenantId } });
  if (!row) throw new Error("Fila no encontrada");

  if (row.parentId && input.section != null && input.section !== row.section) {
    throw new Error("La subfila sigue la sección del padre");
  }
  if (row.parentId && input.accountPlanIds !== undefined) {
    throw new Error("Las cuentas se asignan en la categoría padre");
  }

  const data: {
    name?: string;
    section?: FlowSection;
    categoryId?: string | null;
    canonicalKey?: FlowRowKey | null;
    mapping?: FlowRowMapping;
    orderIndex?: number;
  } = {};

  if (input.name != null) {
    const trimmed = input.name.trim();
    if (!trimmed) throw new Error("El nombre no puede estar vacío");
    data.name = trimmed;
  }

  const targetSection = input.section ?? row.section;
  assertExpenseKeyAllowed(
    targetSection,
    input.canonicalKey,
    input.accountPlanIds,
    row.canonicalKey,
  );

  // Transición ACCOUNTS/CATEGORY → MANUAL: solo si no hay actividad derivada.
  if (
    input.mapping === "MANUAL" &&
    (row.mapping === "CATEGORY" || row.mapping === "ACCOUNTS")
  ) {
    if (await rowHasDerivedActivity(tenantId, row)) {
      throw new Error(
        "No se pueden quitar las cuentas: la fila tiene movimientos reales asociados. Reasigná las cuentas en vez de dejarla manual.",
      );
    }
    data.mapping = "MANUAL";
    data.categoryId = null;
  }

  if (input.canonicalKey !== undefined) {
    if (input.canonicalKey) {
      const clash = await prisma.financeFlowRow.findFirst({
        where: {
          tenantId,
          canonicalKey: input.canonicalKey,
          archivedAt: null,
          NOT: { id: rowId },
        },
        select: { id: true, name: true },
      });
      if (clash) {
        throw new FlowRowConflictError(
          `«${clash.name}» ya usa esta llave; una llave alimenta un solo renglón`,
        );
      }
    }
    data.canonicalKey = input.canonicalKey;
  }

  if (input.accountPlanIds !== undefined) {
    if (
      row.mapping === "ACCOUNT_INSTALLATION" &&
      input.accountPlanIds.length === 0
    ) {
      // Explicit no-op refusal (antes era silencioso al elegir "sin categoría").
      throw new Error(
        "Las filas de ingreso por cuenta/programación no usan cuentas de egreso; no hay nada que guardar",
      );
    }
    await setAccountsForRow(tenantId, rowId, input.accountPlanIds);
    if (input.accountPlanIds.length > 0) {
      data.mapping = "ACCOUNTS";
    } else if (row.mapping === "ACCOUNTS" || row.mapping === "CATEGORY") {
      data.mapping = "MANUAL";
    }
  }

  // Legacy: categoryId aún aceptado para espejo hacia atrás.
  if (input.categoryId !== undefined && input.mapping !== "MANUAL" && input.accountPlanIds === undefined) {
    if (!input.categoryId) {
      throw new Error(
        "Para quitar cuentas usa accountPlanIds: []. Elegir vacío en una fila de ingreso no aplica.",
      );
    }
    if (
      row.section === "INGRESOS" ||
      row.section === "OTROS" ||
      isBandejaKey(row.canonicalKey)
    ) {
      throw new Error(
        "No se pueden asignar cuentas de egreso a filas de ingresos ni a bandejas",
      );
    }
    const cat = await prisma.financeCashflowCategory.findFirst({
      where: { id: input.categoryId, tenantId, kind: "EXPENSE" },
      select: { id: true },
    });
    if (!cat) throw new Error("Categoría de egreso no encontrada");
    data.categoryId = input.categoryId;
    data.mapping = "ACCOUNTS";
  }

  if (input.section != null && input.section !== row.section) {
    data.section = input.section;
    const last = await prisma.financeFlowRow.findFirst({
      where: { tenantId, section: input.section, parentId: null },
      orderBy: { orderIndex: "desc" },
      select: { orderIndex: true },
    });
    data.orderIndex = (last?.orderIndex ?? -1) + 1;
  }

  if (Object.keys(data).length === 0 && input.accountPlanIds === undefined) {
    throw new Error("Nada que actualizar");
  }

  if (Object.keys(data).length > 0) {
    try {
      await prisma.financeFlowRow.update({ where: { id: row.id }, data });
      if (data.section) {
        await prisma.financeFlowRow.updateMany({
          where: { tenantId, parentId: row.id },
          data: { section: data.section },
        });
      }
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        throw new FlowRowConflictError(
          "Esta llave ya está en uso por otro renglón activo",
        );
      }
      throw e;
    }
  }
  return prisma.financeFlowRow.findFirstOrThrow({ where: { id: rowId, tenantId } });
}

/** ¿La fila muestra comprometido o real en alguna semana? Reutiliza los mismos
 *  loaders que la matriz (cero divergencia de matching) sobre una ventana amplia
 *  acotada (~2 años atrás → ~4 meses adelante). Usado por la guarda de deleteRow. */
async function rowHasDerivedActivity(
  tenantId: string,
  row: FinanceFlowRow,
): Promise<boolean> {
  const ref: FlowRowRef = {
    id: row.id, name: row.name, section: row.section, mapping: row.mapping,
    crmAccountId: row.crmAccountId, installationId: row.installationId,
    recurringTemplateId: row.recurringTemplateId,
    categoryId: row.categoryId, supplierId: row.supplierId,
  };
  const currentMonday = startOfIsoWeekUTC(new Date());
  const weeks = enumerateWeeks(addWeeksUTC(currentMonday, -104), addWeeksUTC(currentMonday, 16));
  const todayYmd = toYmd(new Date());
  const [incLoad, exp, real] = await Promise.all([
    loadCommittedIncome(tenantId, [ref], weeks, todayYmd),
    loadCommittedExpense(tenantId, [ref], weeks, todayYmd),
    loadReal(tenantId, [ref], weeks),
  ]);
  const nonEmpty = (m: Map<string, Map<string, { total: number }>>): boolean => {
    const byWeek = m.get(row.id);
    if (!byWeek) return false;
    for (const cell of byWeek.values()) if (cell.total !== 0) return true;
    return false;
  };
  return nonEmpty(incLoad.committed) || nonEmpty(exp) || nonEmpty(real);
}

/**
 * Elimina físicamente una fila SIN historial operativo. Guarda en el servidor
 * (el 409 no depende del cliente). Subfilas: el plan en semanas abiertas no
 * bloquea (se borra con la fila); real/comprometido o plan en semanas cerradas
 * sí. Padres: cualquier plan cell histórico bloquea. En esos casos la UI ofrece
 * archivar. Las fuentes (DTE/banco) no se tocan.
 */
export async function deleteRow(tenantId: string, rowId: string): Promise<{ deleted: true }> {
  const row = await prisma.financeFlowRow.findFirst({ where: { id: rowId, tenantId } });
  if (!row) throw new Error("Fila no encontrada");

  const childCount = await prisma.financeFlowRow.count({
    where: { tenantId, parentId: rowId },
  });
  if (childCount > 0) {
    throw new Error("Archivá o eliminá las subfilas primero");
  }

  if (row.parentId) {
    if (await rowHasDerivedActivity(tenantId, row)) {
      throw new Error("La fila tiene comprometido o real: archívala en vez de eliminarla");
    }
    const planCells = await prisma.financeFlowPlanCell.findMany({
      where: { tenantId, rowId },
      select: { weekStart: true },
    });
    const weeks = planCells.map((c) => weekStartYmd(c.weekStart));
    const closed = weeks.length > 0 ? await listClosedV3Weeks(tenantId, weeks) : [];
    if (closed.length > 0) {
      throw new Error("Hay semanas cerradas: archívala en vez de eliminarla");
    }
    await prisma.financeFlowRow.delete({ where: { id: row.id } });
    return { deleted: true };
  }

  const planCount = await prisma.financeFlowPlanCell.count({ where: { tenantId, rowId } });
  if (planCount > 0) {
    throw new Error("La fila tiene plan histórico: archívala en vez de eliminarla");
  }
  if (await rowHasDerivedActivity(tenantId, row)) {
    throw new Error("La fila tiene comprometido o real: archívala en vez de eliminarla");
  }

  await prisma.financeFlowRow.delete({ where: { id: row.id } });
  return { deleted: true };
}

/** Desarchiva una fila (vuelve a admitir plan y a proyectarse hacia adelante). */
export async function unarchiveRow(tenantId: string, rowId: string): Promise<FinanceFlowRow> {
  const row = await prisma.financeFlowRow.findFirst({ where: { id: rowId, tenantId } });
  if (!row) throw new Error("Fila no encontrada");
  await prisma.financeFlowRow.update({ where: { id: row.id }, data: { archivedAt: null } });
  await prisma.financeFlowRow.updateMany({
    where: { tenantId, parentId: row.id },
    data: { archivedAt: null },
  });
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
        ...(row.recurringTemplateId
          ? { id: row.recurringTemplateId }
          : {
              crmAccountId: row.crmAccountId,
              ...(row.installationId ? { installationId: row.installationId } : {}),
            }),
      },
      select: { id: true },
    });
    if (templates.length > 0) {
      warning = { activeRecurringTemplateIds: templates.map((t) => t.id) };
    }
  }

  const now = new Date();
  await prisma.financeFlowRow.update({
    where: { id: row.id },
    data: { archivedAt: now },
  });
  await prisma.financeFlowRow.updateMany({
    where: { tenantId, parentId: row.id, archivedAt: null },
    data: { archivedAt: now },
  });
  const fresh = await prisma.financeFlowRow.findFirstOrThrow({ where: { id: rowId, tenantId } });
  return { row: fresh, warning };
}
