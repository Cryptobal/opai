import "server-only";
import type { FinanceFlowRow } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isValidRut, rutSearchNeedles, toSiiRut } from "@/lib/chile-rut";
import {
  upsertFlowRowRuleForDescription,
  upsertFlowRowRuleForRut,
} from "@/modules/finance/banking/automatch-rule.service";
import { createRow, updateRow } from "./rows.service";
import {
  createRecurrence,
  updateRecurrence,
  type RecurrenceInput,
} from "./recurring-plan.service";

export interface CreateSubRowInput {
  parentId: string;
  name: string;
  recurrence?: RecurrenceInput | null;
  matchRule?: { rut?: string; description?: string } | null;
}

export interface CreateSubRowResult {
  row: FinanceFlowRow;
  ruleIds: string[];
}

export interface UpdateSubRowInput {
  name?: string;
  recurrence?: RecurrenceInput | null;
  matchRule?: { rut?: string; description?: string } | null;
}

async function findSupplierIdByRut(
  tenantId: string,
  rut: string,
): Promise<string | null> {
  const needles = rutSearchNeedles(rut);
  if (needles.length === 0) return null;
  const found = await prisma.financeSupplier.findFirst({
    where: { tenantId, isActive: true, rut: { in: needles } },
    select: { id: true },
  });
  return found?.id ?? null;
}

export async function createSubRow(
  tenantId: string,
  input: CreateSubRowInput,
  userId: string | null,
): Promise<CreateSubRowResult> {
  const rutRaw = input.matchRule?.rut?.trim() || "";
  const description = input.matchRule?.description?.trim() || "";
  if (rutRaw && !isValidRut(rutRaw)) {
    throw new Error("RUT inválido");
  }

  const supplierId = rutRaw ? await findSupplierIdByRut(tenantId, rutRaw) : null;

  const row = await createRow(tenantId, {
    section: "GAV",
    name: input.name,
    mapping: supplierId ? "SUPPLIER" : "MANUAL",
    parentId: input.parentId,
    supplierId,
  });

  if (input.recurrence) {
    await createRecurrence(tenantId, row.id, input.recurrence, userId);
  }

  const ruleIds = await applyMatchRules(tenantId, row.id, row.name, rutRaw, description, userId);

  const fresh = await prisma.financeFlowRow.findFirstOrThrow({
    where: { id: row.id, tenantId },
  });
  return { row: fresh, ruleIds };
}

export async function updateSubRow(
  tenantId: string,
  rowId: string,
  input: UpdateSubRowInput,
  userId: string | null,
): Promise<CreateSubRowResult> {
  const row = await prisma.financeFlowRow.findFirst({
    where: { id: rowId, tenantId },
  });
  if (!row) throw new Error("Fila no encontrada");
  if (!row.parentId) throw new Error("Solo se editan subfilas");

  const rutRaw = input.matchRule?.rut?.trim() || "";
  const description = input.matchRule?.description?.trim() || "";
  if (rutRaw && !isValidRut(rutRaw)) {
    throw new Error("RUT inválido");
  }

  if (input.name != null && input.name.trim() && input.name.trim() !== row.name) {
    await updateRow(tenantId, rowId, { name: input.name.trim() });
  }

  if (input.recurrence) {
    const existing = await prisma.financeFlowPlanRecurrence.findFirst({
      where: { tenantId, rowId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (existing) {
      await updateRecurrence(tenantId, existing.id, input.recurrence, userId);
    } else {
      await createRecurrence(tenantId, rowId, input.recurrence, userId);
    }
  }

  const displayName = input.name?.trim() || row.name;
  const ruleIds = await applyMatchRules(
    tenantId,
    row.id,
    displayName,
    rutRaw,
    description,
    userId,
  );

  const fresh = await prisma.financeFlowRow.findFirstOrThrow({
    where: { id: rowId, tenantId },
  });
  return { row: fresh, ruleIds };
}

async function applyMatchRules(
  tenantId: string,
  rowId: string,
  rowName: string,
  rutRaw: string,
  description: string,
  userId: string | null,
): Promise<string[]> {
  const ruleIds: string[] = [];
  if (rutRaw) {
    const { ruleId } = await upsertFlowRowRuleForRut({
      tenantId,
      rut: toSiiRut(rutRaw),
      flowRowId: rowId,
      rowName,
      userId,
    });
    ruleIds.push(ruleId);
  }
  if (description.length >= 4) {
    const { ruleId } = await upsertFlowRowRuleForDescription({
      tenantId,
      needle: description,
      flowRowId: rowId,
      rowName,
      appliesTo: "WITHDRAWALS",
      userId,
    });
    ruleIds.push(ruleId);
  }
  return ruleIds;
}
