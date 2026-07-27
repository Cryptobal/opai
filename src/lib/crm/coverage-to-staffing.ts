/**
 * Convierte cobertura (personas simultáneas × horario) en dotación Gard
 * bajo jornada semanal referencial (default 42 h).
 *
 * Distinción crítica (RFI / consultas al mercado): el cliente pide COBERTURA;
 * la DOTACIÓN la declara el oferente según turnos y normativa.
 */

export type CoverageSlotInput = {
  /** Personas simultáneas en terreno (cobertura), no headcount. */
  simultaneous: number;
  dias: string[];
  horaInicio: string; // HH:mm
  horaFin: string; // HH:mm
  /** Etiqueta libre del documento (ej. "24/7", "L-V diurno"). */
  regimen?: string | null;
};

export type StaffingSlotResult = {
  weeklyHH: number;
  headcount: number;
  pattern: "4x4" | "pool_42h" | "parcial";
  rationale: string;
};

const WEEKDAY_SET = new Set([
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo",
]);

export function normalizeWeekdays(dias: string[]): string[] {
  const out: string[] = [];
  for (const d of dias) {
    const key = d
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (WEEKDAY_SET.has(key) && !out.includes(key)) out.push(key);
  }
  return out;
}

/** Horas de un turno; cruza medianoche si fin ≤ inicio. */
export function shiftHours(horaInicio: string, horaFin: string): number {
  const parse = (t: string) => {
    const m = t.trim().match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
    return h * 60 + min;
  };
  const a = parse(horaInicio);
  const b = parse(horaFin);
  if (a == null || b == null) return 12;
  let mins = b - a;
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
}

function is247Label(regimen: string | null | undefined): boolean {
  if (!regimen) return false;
  const r = regimen
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return /24\s*[\/x]\s*7|24x7|24\/7|continuo\s*24/.test(r);
}

/**
 * Dotación para un slot de cobertura.
 * - 24/7 (7 días, ~12 h, o etiqueta 24/7): 4 personas por simultáneo (2 día + 2 noche 4x4).
 * - 7 días diurno ~12 h: 2 personas por simultáneo (4x4 un turno).
 * - Resto: ceil(HH semanales / jornada) con piso = simultáneos.
 */
export function staffingForCoverageSlot(
  slot: CoverageSlotInput,
  weeklyHoursPerWorker = 42,
): StaffingSlotResult {
  const simultaneous = Math.max(1, Math.floor(slot.simultaneous || 1));
  const dias = normalizeWeekdays(slot.dias);
  const daysCount = dias.length > 0 ? dias.length : 5;
  const hours = shiftHours(slot.horaInicio || "08:00", slot.horaFin || "20:00");
  const weeklyHH = Math.round(daysCount * hours * simultaneous * 10) / 10;
  const jornada = weeklyHoursPerWorker > 0 ? weeklyHoursPerWorker : 42;

  // Un solo slot que cubre ~24 h → 4 personas 4x4 por simultáneo (día+noche).
  if (daysCount === 7 && hours >= 20) {
    const headcount = simultaneous * 4;
    return {
      weeklyHH: Math.round(7 * 24 * simultaneous * 10) / 10,
      headcount,
      pattern: "4x4",
      rationale: `${simultaneous} simultáneo(s) 24/7 (slot único) → ${headcount} en 4x4 (2 día + 2 noche)`,
    };
  }

  // Turno ~12 h en 7 días (día O noche de un 24/7, o diurno 7×12): 2 en 4x4.
  if (daysCount === 7 && hours >= 11 && hours <= 13) {
    const headcount = simultaneous * 2;
    return {
      weeklyHH,
      headcount,
      pattern: "4x4",
      rationale: is247Label(slot.regimen)
        ? `${simultaneous} simultáneo(s) turno 24/7 → ${headcount} en 4x4`
        : `${simultaneous} simultáneo(s) 7×${hours}h → ${headcount} en 4x4`,
    };
  }

  if (is247Label(slot.regimen) && daysCount >= 6) {
    const headcount = simultaneous * 2;
    return {
      weeklyHH,
      headcount,
      pattern: "4x4",
      rationale: `${simultaneous} simultáneo(s) etiqueta 24/7 → ${headcount} en 4x4`,
    };
  }

  if (weeklyHH <= jornada) {
    return {
      weeklyHH,
      headcount: simultaneous,
      pattern: "parcial",
      rationale: `${weeklyHH} HH/sem ≤ ${jornada}h → ${simultaneous} (cobertura = dotación mínima)`,
    };
  }

  const byHours = Math.ceil(weeklyHH / jornada);
  const headcount = Math.max(simultaneous, byHours);
  return {
    weeklyHH,
    headcount,
    pattern: "pool_42h",
    rationale: `${weeklyHH} HH/sem ÷ ${jornada}h → ${headcount} (piso cobertura ${simultaneous})`,
  };
}

export type StaffingTotals = {
  weeklyHH: number;
  headcountBase: number;
  reservePct: number;
  reserveHeadcount: number;
  headcountWithReserve: number;
  legalMinimum: number;
};

export function sumStaffing(
  slots: StaffingSlotResult[],
  weeklyHoursPerWorker = 42,
  reservePct = 0.1,
): StaffingTotals {
  const weeklyHH = slots.reduce((a, s) => a + s.weeklyHH, 0);
  const headcountBase = slots.reduce((a, s) => a + s.headcount, 0);
  const legalMinimum = weeklyHH > 0 ? Math.ceil(weeklyHH / weeklyHoursPerWorker) : 0;
  const reserveHeadcount = Math.ceil(headcountBase * Math.max(0, reservePct));
  return {
    weeklyHH: Math.round(weeklyHH * 10) / 10,
    headcountBase,
    reservePct,
    reserveHeadcount,
    headcountWithReserve: headcountBase + reserveHeadcount,
    legalMinimum,
  };
}
