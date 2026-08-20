import "server-only";
import type { FinanceFlowRow } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isValidRut, rutSearchNeedles, toSiiRut } from "@/lib/chile-rut";
import {
  upsertFlowRowRuleForDescription,
  upsertFlowRowRuleForRut,
} from "@/modules/finance/banking/automatch-rule.service";
import { createRow } from "./rows.service";
import { createRecurrence, type RecurrenceInput } from "./recurring-plan.service";

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

  const ruleIds: string[] = [];
  if (rutRaw) {
    const { ruleId } = await upsertFlowRowRuleForRut({
      tenantId,
      rut: toSiiRut(rutRaw),
      flowRowId: row.id,
      rowName: row.name,
      userId,
    });
    ruleIds.push(ruleId);
  }
  if (description.length >= 4) {
    const { ruleId } = await upsertFlowRowRuleForDescription({
      tenantId,
      needle: description,
      flowRowId: row.id,
      rowName: row.name,
      appliesTo: "WITHDRAWALS",
      userId,
    });
    ruleIds.push(ruleId);
  }

  const fresh = await prisma.financeFlowRow.findFirstOrThrow({
    where: { id: row.id, tenantId },
  });
  return { row: fresh, ruleIds };
}
