/**
 * Recálculo de dotación 100% en cliente.
 *
 * Usa exactamente la misma librería pura que el servidor
 * (`src/lib/crm/coverage-to-staffing.ts`, vía `enrichSlot`), así que editar
 * horas / días / simultáneos / régimen actualiza HH, dotación y KPIs al
 * instante y sin round-trip. Un round-trip además borraba los puestos recién
 * agregados, porque la normalización server reemplazaba la propuesta completa.
 */
import {
  computePeakStaffing,
  staffingForCoverageSlot,
  sumStaffing,
} from "@/lib/crm/coverage-to-staffing";
import type {
  CrmStructureCoverageSlot,
  CrmStructureProposal,
} from "@/modules/crm/email/email-to-crm-structure.types";

/**
 * Tope legal de jornada semanal (Ley 21.561, 42 h vigentes desde abr-2026).
 * No es configurable: la dotación se deriva del régimen de turno, no de una
 * jornada semanal elegible.
 */
export const LEGAL_WEEKLY_HOURS = 42;

/** Coerciona jornadas de drafts viejos (44 / 45) al tope legal vigente. */
export function normalizeWeeklyHours(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return LEGAL_WEEKLY_HOURS;
  return Math.min(LEGAL_WEEKLY_HOURS, n);
}

/** Reserva en porcentaje 0–100 (mismo criterio que el normalizador server). */
export function normalizeReservePct(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) return 10;
  return Math.round(n);
}

/** Recalcula HH / dotación / patrón de un slot respetando `headcountLocked`. */
export function recalcCoverageSlot(
  slot: CrmStructureCoverageSlot,
  weeklyHours: number,
): CrmStructureCoverageSlot {
  const staff = staffingForCoverageSlot(
    {
      simultaneous: slot.simultaneous,
      dias: slot.dias,
      horaInicio: slot.horaInicio,
      horaFin: slot.horaFin,
      regimen: slot.regimen,
    },
    weeklyHours,
  );
  const manual = Number(slot.headcount);
  const keepManual =
    slot.headcountLocked === true && Number.isFinite(manual) && manual > 0;
  return {
    ...slot,
    weeklyHH: staff.weeklyHH,
    headcount: keepManual ? Math.max(1, Math.floor(manual)) : staff.headcount,
    pattern: staff.pattern,
    staffingRationale: staff.rationale,
  };
}

/**
 * Devuelve la propuesta con dotación, totales y peak recalculados.
 * Puro: no muta la entrada ni toca la red.
 */
export function recalcProposalStaffing(
  proposal: CrmStructureProposal,
): CrmStructureProposal {
  const weeklyHours = normalizeWeeklyHours(proposal.weeklyHoursPerWorker);
  const reservePct = normalizeReservePct(proposal.reservePct);

  const installations = proposal.installations.map((inst) => ({
    ...inst,
    coverageSlots: inst.coverageSlots.map((slot) =>
      recalcCoverageSlot(slot, weeklyHours),
    ),
  }));

  const allSlots = installations.flatMap((i) => i.coverageSlots);
  const totals = sumStaffing(
    allSlots.map((s) => ({
      weeklyHH: s.weeklyHH,
      headcount: s.headcount,
      pattern: s.pattern as "4x4" | "pool_42h" | "parcial",
      rationale: s.staffingRationale,
    })),
    weeklyHours,
    reservePct / 100,
  );
  const staffingPeak = computePeakStaffing(
    allSlots.map((s) => ({
      headcount: s.headcount,
      weeklyHH: s.weeklyHH,
      vigenciaDesde: s.vigenciaDesde,
      vigenciaHasta: s.vigenciaHasta,
    })),
  );

  return {
    ...proposal,
    weeklyHoursPerWorker: weeklyHours,
    reservePct,
    installations,
    staffingTotals: {
      weeklyHH: totals.weeklyHH,
      headcountBase: totals.headcountBase,
      reserveHeadcount: totals.reserveHeadcount,
      headcountWithReserve: totals.headcountWithReserve,
      legalMinimum: totals.legalMinimum,
    },
    staffingPeak,
  };
}
