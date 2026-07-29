/**
 * Materializa coverageSlots del Plan de acciones en CpqServiceGroup + CpqPosition
 * sobre una cotización borrador ya creada.
 *
 * Reusa la misma lógica de catálogos / payroll que el approve de lead, sin depender
 * del payload de lead. Si faltan cargo/rol activos, no crea puestos (la cotización
 * queda usable y el usuario completa en el workspace).
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeEmployerCost } from "@/modules/payroll/engine/compute-employer-cost";
import { buildCpqStyleEmployerCostInput } from "@/lib/cpq/cpq-employer-cost-input";
import { refreshQuoteTotals } from "@/modules/cpq/costing/compute-quote-costs";
import {
  inferCoveragePatternFromPositions,
  getCoveragePatternMeta,
} from "@/lib/cpq/coverage-patterns";
import { normalizeWeekdays } from "@/lib/cpq/weekdays";
import type { CrmStructureProposal } from "@/modules/crm/email/email-to-crm-structure.types";

function normalizePositiveInt(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

/** Preferencia de rol CPQ a partir del régimen del slot. */
export function preferredRolName(regimen: string | null | undefined): string | null {
  if (!regimen) return null;
  const r = regimen
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  if (/7\s*[x\/]\s*7/.test(r)) return "7x7";
  if (/4\s*[x\/]\s*4/.test(r)) return "4x4";
  if (/5\s*[x\/]\s*2/.test(r)) return "5x2";
  if (/24\s*[\/x]\s*7|24x7|continuo/.test(r)) return "4x4";
  return regimen.trim();
}

export async function materializeCoverageSlotsOnQuote(params: {
  tenantId: string;
  quoteId: string;
  proposal: CrmStructureProposal;
}): Promise<{ positionsCreated: number }> {
  const { tenantId, quoteId, proposal } = params;
  const slots = proposal.installations.flatMap((inst) =>
    inst.coverageSlots.map((slot) => ({ inst, slot })),
  );
  if (slots.length === 0) return { positionsCreated: 0 };

  const tenantOrShared = { OR: [{ tenantId }, { tenantId: null }] };

  const [defaultCargo, defaultRol, roles] = await Promise.all([
    prisma.cpqCargo.findFirst({
      where: { active: true, ...tenantOrShared },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.cpqRol.findFirst({
      where: { active: true, ...tenantOrShared },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.cpqRol.findMany({
      where: { active: true, ...tenantOrShared },
      select: { id: true, name: true },
    }),
  ]);

  if (!defaultCargo || !defaultRol) {
    console.warn(
      "[coverage-slots-to-quote-positions] sin cargo/rol activos; omitiendo puestos",
    );
    return { positionsCreated: 0 };
  }

  const rolByName = new Map(
    roles.map((r) => [r.name.toLowerCase(), r] as const),
  );

  const patternPositions = slots.map(({ slot }) => ({
    startTime: slot.horaInicio || "08:00",
    weekdays: normalizeWeekdays(slot.dias).filter((d) => d !== "Fer"),
  }));
  const inferredPattern = inferCoveragePatternFromPositions(patternPositions);
  const patternMeta = getCoveragePatternMeta(inferredPattern);

  const serviceGroup = await prisma.cpqServiceGroup.create({
    data: {
      tenantId,
      quoteId,
      name: patternMeta.label,
      coveragePattern: inferredPattern,
      iconName: patternMeta.icon || null,
      displayOrder: 0,
    },
    select: { id: true },
  });

  let positionsCreated = 0;

  for (const { slot } of slots) {
    const puestoName = (slot.name || "Guardia de Seguridad").trim();
    let puesto = await prisma.cpqPuestoTrabajo.findFirst({
      where: { name: { equals: puestoName, mode: "insensitive" }, active: true, ...tenantOrShared },
      select: { id: true, name: true },
    });
    if (!puesto) {
      puesto = await prisma.cpqPuestoTrabajo.create({
        data: { tenantId, name: puestoName, active: true },
        select: { id: true, name: true },
      });
    }

    const preferred = preferredRolName(slot.regimen);
    const matchedRol = preferred
      ? rolByName.get(preferred.toLowerCase()) ??
        roles.find((r) => r.name.toLowerCase().includes(preferred.toLowerCase()))
      : null;
    const rol = matchedRol ?? defaultRol;

    let cargo = defaultCargo;
    if (slot.role?.trim()) {
      const byRole = await prisma.cpqCargo.findFirst({
        where: {
          name: { equals: slot.role.trim(), mode: "insensitive" },
          active: true,
          ...tenantOrShared,
        },
        select: { id: true, name: true },
      });
      if (byRole) cargo = byRole;
    }

    const weekdays = normalizeWeekdays(slot.dias);
    if (weekdays.filter((d) => d !== "Fer").length === 0) continue;

    const startTime = slot.horaInicio || "08:00";
    const endTime = slot.horaFin || "20:00";
    const numGuards = normalizePositiveInt(slot.headcount, 1);
    const numPuestos = normalizePositiveInt(slot.simultaneous, 1);
    // Piso del pliego si la extracción lo detectó; si no, default interno.
    const floor = proposal.condicionesEconomicas?.sueldoBaseMinimo;
    const baseSalary =
      typeof floor === "number" && Number.isFinite(floor) && floor > 0
        ? Math.round(floor)
        : 550000;

    let employerCost = 0;
    let netSalary = 0;
    let monthlyPositionCost = 0;
    let payrollSnapshot: Prisma.InputJsonValue | undefined;
    let payrollVersionId: string | null = null;
    let calculatedAt: Date | null = null;

    try {
      const payroll = await computeEmployerCost(
        buildCpqStyleEmployerCostInput(baseSalary, {}),
      );
      employerCost = payroll.monthly_employer_cost_clp;
      netSalary = payroll.worker_net_salary_estimate;
      monthlyPositionCost = employerCost * numGuards * numPuestos;
      payrollSnapshot = {
        breakdown: payroll.breakdown,
        worker_breakdown_estimate: payroll.worker_breakdown_estimate,
        parameters_snapshot: payroll.parameters_snapshot,
      } as unknown as Prisma.InputJsonValue;
      payrollVersionId = payroll.parameters_snapshot?.version_id || null;
      calculatedAt = new Date(payroll.computed_at);
    } catch (err) {
      console.warn("[coverage-slots-to-quote-positions] payroll:", err);
    }

    const customName = [puesto.name, cargo.name, rol.name].filter(Boolean).join(" - ");

    await prisma.cpqPosition.create({
      data: {
        quoteId,
        serviceGroupId: serviceGroup.id,
        puestoTrabajoId: puesto.id,
        customName,
        description: slot.notes,
        weekdays,
        startTime,
        endTime,
        numGuards,
        numPuestos,
        cargoId: cargo.id,
        rolId: rol.id,
        baseSalary,
        employerCost,
        netSalary,
        monthlyPositionCost,
        afpName: "modelo",
        healthSystem: "fonasa",
        healthPlanPct: 0.07,
        payrollSnapshot,
        payrollVersionId,
        calculatedAt,
      },
    });
    positionsCreated++;
  }

  if (positionsCreated > 0) {
    try {
      await refreshQuoteTotals(quoteId);
    } catch (err) {
      console.warn("[coverage-slots-to-quote-positions] refresh totals:", err);
    }
  }

  return { positionsCreated };
}
