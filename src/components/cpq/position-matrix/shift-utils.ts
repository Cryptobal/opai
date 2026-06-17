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
import { COVERAGE_PATTERNS } from "@/lib/cpq/coverage-patterns";
import type { TemplateRowSeed } from "./types";

export { WEEKDAY_ORDER, normalizeWeekdays, formatWeekdaysShort };

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
