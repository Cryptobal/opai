import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createCrmHistoryLog } from "@/lib/crm-history";
import { computeEmployerCost } from "@/modules/payroll/engine/compute-employer-cost";
import { buildCpqStyleEmployerCostInput } from "@/lib/cpq/cpq-employer-cost-input";
import { refreshQuoteTotals } from "@/modules/cpq/costing/compute-quote-costs";
import { normalizeWeekdays } from "@/lib/cpq/weekdays";

export type InsertPositionBody = {
  puestoTrabajoId: string;
  weekdays: string[];
  startTime: string;
  endTime: string;
  numGuards: number;
  numPuestos?: number;
  cargoId: string;
  rolId: string;
  baseSalary: number;
  afpName?: string | null;
  healthSystem?: string | null;
  healthPlanPct?: number | null;
  serviceGroupId?: string | null;
  customName?: string | null;
  description?: string | null;
};

/**
 * Alta de puesto con recálculo payroll + refresh totals + historial CRM.
 * Equivalente funcional al POST `/api/cpq/quotes/[id]/positions`.
 */
export async function insertQuotePosition(opts: {
  quoteId: string;
  tenantId: string;
  userId: string;
  body: InsertPositionBody;
}) {
  const { quoteId, tenantId, userId } = opts;
  const body = opts.body;

  const normalizedWeekdays = normalizeWeekdays(body.weekdays);
  if (!body.puestoTrabajoId || normalizedWeekdays.length === 0) {
    throw new Error("VALIDATION_FIELDS");
  }
  if (
    !body.startTime ||
    !body.endTime ||
    body.numGuards == null ||
    !body.cargoId ||
    !body.rolId ||
    body.baseSalary == null
  ) {
    throw new Error("VALIDATION_FIELDS");
  }

  const healthPlan =
    body.healthSystem === "isapre" ? body.healthPlanPct ?? 0.07 : 0.07;

  const payroll = await computeEmployerCost(
    buildCpqStyleEmployerCostInput(Number(body.baseSalary), {
      afpName: body.afpName || "modelo",
      healthSystem: body.healthSystem || "fonasa",
      healthPlanPct: body.healthPlanPct ?? 0.07,
    }),
  );

  const employerCost = payroll.monthly_employer_cost_clp;
  const netSalary = payroll.worker_net_salary_estimate;
  const safeNumPuestos = Math.max(1, Number(body.numPuestos ?? 1));
  const monthlyPositionCost = employerCost * Number(body.numGuards) * safeNumPuestos;

  const created = await prisma.$transaction(async (tx) =>
    tx.cpqPosition.create({
      data: {
        quoteId,
        puestoTrabajoId: body.puestoTrabajoId,
        serviceGroupId: body.serviceGroupId || null,
        customName: body.customName?.trim() || null,
        description: body.description?.trim() || null,
        weekdays: normalizedWeekdays,
        startTime: body.startTime,
        endTime: body.endTime,
        numGuards: Number(body.numGuards),
        numPuestos: safeNumPuestos,
        cargoId: body.cargoId,
        rolId: body.rolId,
        baseSalary: Number(body.baseSalary),
        afpName: body.afpName || "modelo",
        healthSystem: body.healthSystem || "fonasa",
        healthPlanPct: healthPlan,
        employerCost,
        netSalary,
        monthlyPositionCost,
        payrollSnapshot: {
          breakdown: payroll.breakdown,
          worker_breakdown_estimate: payroll.worker_breakdown_estimate,
          parameters_snapshot: payroll.parameters_snapshot,
        } as unknown as Prisma.InputJsonValue,
        payrollVersionId: payroll.parameters_snapshot?.version_id || null,
        calculatedAt: new Date(payroll.computed_at),
      },
    }),
  );

  await refreshQuoteTotals(quoteId);

  const quote = await prisma.cpqQuote.findFirst({
    where: { id: quoteId, tenantId },
    select: { code: true },
  });
  await createCrmHistoryLog({
    tenantId,
    entityType: "quote",
    entityId: quoteId,
    action: "quote_position_added",
    details: {
      quoteCode: quote?.code ?? null,
      positionId: created.id,
      puestoTrabajoId: body.puestoTrabajoId,
      numGuards: Number(body.numGuards),
      numPuestos: safeNumPuestos,
    },
    createdBy: userId,
  });

  return created;
}

export async function patchQuotePosition(opts: {
  quoteId: string;
  tenantId: string;
  userId: string;
  positionId: string;
  body: Record<string, unknown>;
}) {
  const { quoteId, tenantId, userId, positionId, body } = opts;

  const current = await prisma.cpqPosition.findFirst({
    where: { id: positionId, quoteId },
  });

  if (!current) throw new Error("POSITION_NOT_FOUND");

  const updateData: Record<string, unknown> = {};
  const fields = [
    "puestoTrabajoId",
    "customName",
    "description",
    "weekdays",
    "startTime",
    "endTime",
    "numGuards",
    "numPuestos",
    "cargoId",
    "rolId",
    "baseSalary",
    "afpName",
    "healthSystem",
    "healthPlanPct",
    "serviceGroupId",
  ];

  for (const field of fields) {
    if (body[field] !== undefined) {
      updateData[field] = body[field];
    }
  }

  if (updateData.weekdays !== undefined) {
    const normalized = normalizeWeekdays(updateData.weekdays as string[]);
    if (normalized.length === 0) throw new Error("WEEKDAYS_INVALID");
    updateData.weekdays = normalized;
  }

  const nextBaseSalary = Number(updateData.baseSalary ?? current.baseSalary);
  const nextAfpName = (updateData.afpName ?? current.afpName) as string;
  const nextHealthSystem = (updateData.healthSystem ?? current.healthSystem) as string;
  const nextHealthPlan =
    nextHealthSystem === "isapre"
      ? Number(updateData.healthPlanPct ?? current.healthPlanPct ?? 0.07)
      : 0.07;

  const forceRecalculate = body?.forceRecalculate === true;
  const shouldRecalc =
    forceRecalculate ||
    updateData.baseSalary !== undefined ||
    updateData.afpName !== undefined ||
    updateData.healthSystem !== undefined ||
    updateData.healthPlanPct !== undefined ||
    updateData.cargoId !== undefined ||
    updateData.rolId !== undefined;

  let employerCost = Number(current.employerCost);
  let netSalary = current.netSalary ? Number(current.netSalary) : null;
  let payrollSnapshot: Prisma.InputJsonValue =
    current.payrollSnapshot as unknown as Prisma.InputJsonValue;
  let payrollVersionId = current.payrollVersionId;
  let calculatedAt = current.calculatedAt;

  if (shouldRecalc) {
    const payroll = await computeEmployerCost(
      buildCpqStyleEmployerCostInput(nextBaseSalary, {
        afpName: nextAfpName,
        healthSystem: nextHealthSystem,
        healthPlanPct: nextHealthPlan,
      }),
    );

    employerCost = payroll.monthly_employer_cost_clp;
    netSalary = payroll.worker_net_salary_estimate;
    payrollSnapshot = {
      breakdown: payroll.breakdown,
      worker_breakdown_estimate: payroll.worker_breakdown_estimate,
      parameters_snapshot: payroll.parameters_snapshot,
    } as unknown as Prisma.InputJsonValue;
    payrollVersionId = payroll.parameters_snapshot?.version_id || null;
    calculatedAt = new Date(payroll.computed_at);
  }

  const nextNumGuards = Number(updateData.numGuards ?? current.numGuards);
  const nextNumPuestos = Math.max(1, Number(updateData.numPuestos ?? current.numPuestos ?? 1));
  const monthlyPositionCost = employerCost * nextNumGuards * nextNumPuestos;

  const position = await prisma.cpqPosition.update({
    where: { id: positionId },
    data: {
      ...updateData,
      baseSalary: nextBaseSalary,
      afpName: nextAfpName,
      healthSystem: nextHealthSystem,
      healthPlanPct: nextHealthPlan,
      employerCost,
      netSalary,
      payrollSnapshot,
      payrollVersionId,
      calculatedAt,
      numPuestos: nextNumPuestos,
      monthlyPositionCost,
    } as Prisma.CpqPositionUpdateInput,
  });

  await refreshQuoteTotals(quoteId);

  const quote = await prisma.cpqQuote.findFirst({
    where: { id: quoteId, tenantId },
    select: { code: true },
  });
  await createCrmHistoryLog({
    tenantId,
    entityType: "quote",
    entityId: quoteId,
    action: "quote_position_updated",
    details: {
      quoteCode: quote?.code ?? null,
      positionId,
      changedFields: Object.keys(updateData),
    },
    createdBy: userId,
  });

  return position;
}

export async function deleteQuotePosition(opts: {
  quoteId: string;
  tenantId: string;
  userId: string;
  positionId: string;
}) {
  const { quoteId, tenantId, userId, positionId } = opts;
  const existing = await prisma.cpqPosition.findFirst({
    where: { id: positionId, quoteId },
    select: { id: true },
  });

  if (!existing) throw new Error("POSITION_NOT_FOUND");

  await prisma.cpqPosition.delete({ where: { id: positionId } });
  await refreshQuoteTotals(quoteId);

  const quote = await prisma.cpqQuote.findFirst({
    where: { id: quoteId, tenantId },
    select: { code: true },
  });
  await createCrmHistoryLog({
    tenantId,
    entityType: "quote",
    entityId: quoteId,
    action: "quote_position_deleted",
    details: { quoteCode: quote?.code ?? null, positionId },
    createdBy: userId,
  });
}
