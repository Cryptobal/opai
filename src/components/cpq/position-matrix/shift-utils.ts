/**
 * Helpers de turno para <PositionMatrix>. Reusa los helpers canónicos de
 * weekdays y shift-type ya existentes en el módulo CPQ.
 */
import {
  getShiftType,
  normalizeWeekdays,
  formatWeekdaysShort,
  WEEKDAY_ORDER,
} from "@/components/cpq/utils";
import type { Weekday } from "@/lib/cpq/weekdays";
import { onlyRealWeekdays } from "@/lib/cpq/weekdays";
import { COVERAGE_PATTERNS } from "@/lib/cpq/coverage-patterns";
import {
  analizarJornada,
  DEFAULT_LIMITS,
  type JornadaAnalysis,
  type JornadaLimits,
  type Regimen,
} from "@/lib/dt/jornada-calc";
import type { TemplateRowSeed } from "./types";

export { WEEKDAY_ORDER, normalizeWeekdays, formatWeekdaysShort };

/** Colación por defecto (min) para estimar horas efectivas mientras no se persiste por turno. */
export const DEFAULT_COLACION_MIN = 60;

/** Lista de horarios cada 15 min para los selects de inicio/fin. */
export const HOURS_24 = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
});

export function isNightShift(inicio: string | null | undefined): boolean {
  return getShiftType(inicio) === "night";
}

/** Duración en horas; cruza medianoche si fin <= inicio. */
export function durHours(inicio: string, fin: string): number {
  const toMin = (t: string) => {
    const [h, m] = (t || "0:0").split(":").map((x) => parseInt(x, 10) || 0);
    return h * 60 + m;
  };
  let diff = toMin(fin) - toMin(inicio);
  if (diff <= 0) diff += 24 * 60;
  return diff / 60;
}

export function diasLabel(dias: string[]): string {
  return formatWeekdaysShort(dias);
}

/**
 * Extrae el ciclo trabajo/descanso de un nombre de rol tipo "5x2", "4×4", "7x7".
 * Devuelve null si no matchea el patrón "NxN".
 */
export function parseRolPattern(
  rolName: string | null | undefined
): { work: number; off: number } | null {
  if (!rolName) return null;
  const m = rolName.replace(/\s/g, "").match(/(\d+)\s*[x×]\s*(\d+)/i);
  if (!m) return null;
  const work = parseInt(m[1], 10);
  const off = parseInt(m[2], 10);
  if (!work || off === undefined || Number.isNaN(off)) return null;
  return { work, off };
}

/**
 * Clasifica el régimen a partir del nombre del rol.
 * Ordinaria: 5x2, 6x1 (base semanal, tope 42h/sem, 10h/día).
 * Excepcional: rotativos autorizados (4x4, 7x7, 14x14) — promedio sobre el ciclo,
 * 12h/día. Heurística: excepcional si trabajo == descanso o si el bloque de
 * trabajo es de 7+ días. Ordinaria en el resto.
 */
export function regimenFromRolName(rolName: string | null | undefined): Regimen {
  const p = parseRolPattern(rolName);
  if (!p) return "ordinaria";
  if (p.work === p.off || p.work >= 7) return "excepcional";
  return "ordinaria";
}

/**
 * Días marcados por defecto para un rol NxN. Reglas Gard:
 *  - rotativos (work === off o work >= 7): todos los días (4x4, 7x7, 14x14)
 *  - 2x5: solo Sáb-Dom
 *  - resto con 1 <= work <= 6: primeros `work` días desde Lun (5x2→Lun-Vie, 6x1→Lun-Sáb)
 *  - sin patrón NxN: null (no tocar los días actuales)
 */
export function defaultDiasForRol(rolName: string | null | undefined): Weekday[] | null {
  const p = parseRolPattern(rolName);
  if (!p) return null;
  if (p.work === p.off || p.work >= 7) return [...WEEKDAY_ORDER];
  if (p.work === 2 && p.off === 5) return ["Sáb", "Dom"];
  if (p.work >= 1 && p.work <= 6) {
    return WEEKDAY_ORDER.slice(0, p.work) as Weekday[];
  }
  return null;
}

/** Analiza un turno para el desglose de horas/jornada de la UI. */
export function analizarTurno(input: {
  inicio: string;
  fin: string;
  dias: string[];
  rolName: string | null | undefined;
  colacionMin?: number;
  limites?: JornadaLimits;
}): JornadaAnalysis {
  const regimen = regimenFromRolName(input.rolName);
  const ciclo = parseRolPattern(input.rolName);
  return analizarJornada({
    inicio: input.inicio,
    fin: input.fin,
    dias: onlyRealWeekdays(input.dias),
    colacionMin: input.colacionMin ?? DEFAULT_COLACION_MIN,
    regimen,
    ciclo:
      regimen === "excepcional" && ciclo
        ? { diasTrabajo: ciclo.work, diasDescanso: ciclo.off }
        : undefined,
    limites: input.limites ?? DEFAULT_LIMITS,
  });
}

/** Botones de plantilla disponibles (incluye "custom" = servicio vacío). */
export const COVERAGE_BUTTONS = COVERAGE_PATTERNS;

/**
 * Construye las filas semilla de una plantilla de cobertura.
 * Devuelve `null` para "custom" (servicio vacío, sin filas).
 */
export function templateSeedsFor(
  patternId: string
): { name: string; seeds: TemplateRowSeed[] } | null {
  const meta = COVERAGE_PATTERNS.find((p) => p.id === patternId);
  if (!meta || !meta.template) return null;
  const seeds: TemplateRowSeed[] = meta.template.positions.map((pos) => ({
    inicio: pos.shiftStart,
    fin: pos.shiftEnd,
    dias: normalizeWeekdays(pos.daysOfWeek),
    guardias: pos.guardsCount,
    nPuestos: 1,
    bruto: pos.baseSalary,
    shiftPattern: pos.shiftPattern,
    rolShiftPattern: pos.rolShiftPattern,
  }));
  return { name: meta.label, seeds };
}
