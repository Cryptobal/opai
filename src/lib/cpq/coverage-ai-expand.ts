import { COVERAGE_PATTERNS } from "@/lib/cpq/coverage-patterns";
import { SERVICE_TEMPLATES, type ServiceTemplatePosition } from "@/lib/cpq/service-templates";

export type ExpandedShiftSlot = Pick<
  ServiceTemplatePosition,
  "name" | "shiftStart" | "shiftEnd" | "daysOfWeek"
> & { guardsCount?: number; rolShiftPattern?: string };

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

/**
 * Interpreta texto libre de cobertura (ej. "24/7", "12-7-día", "5x2", "lun-vie día")
 * y devuelve los slots definidos por la plantilla del catálogo (puede haber más de uno).
 */
export function expandCoveragePatternQuery(queryRaw: string): ExpandedShiftSlot[] | null {
  const qNorm = norm(queryRaw);
  if (!qNorm || qNorm.includes("personaliz")) return null;

  for (const meta of COVERAGE_PATTERNS) {
    const idHit = meta.id !== "custom" && (qNorm === norm(meta.id) || qNorm.includes(norm(meta.shortLabel)));
    const lblHit =
      norm(meta.shortLabel).length >= 3 && qNorm.includes(norm(meta.shortLabel));
    const longHit =
      norm(meta.label).length >= 4 && qNorm.includes(norm(meta.label));
    const descHit =
      typeof meta.description === "string" &&
      meta.description.trim().length > 8 &&
      qNorm.includes(norm(meta.description.slice(0, 18)));

    if (!idHit && !lblHit && !longHit && !descHit) continue;
    const tpl = meta.template;
    if (!tpl?.positions?.length) continue;
    return tpl.positions.map((p) => ({
      name: p.name,
      shiftStart: p.shiftStart,
      shiftEnd: p.shiftEnd,
      daysOfWeek: p.daysOfWeek,
      guardsCount: p.guardsCount,
      rolShiftPattern: p.rolShiftPattern,
    }));
  }

  for (const t of SERVICE_TEMPLATES) {
    if (
      qNorm.includes(norm(t.id)) ||
      (norm(t.shortLabel).length >= 3 && qNorm.includes(norm(t.shortLabel)))
    ) {
      return t.positions.map((p) => ({
        name: p.name,
        shiftStart: p.shiftStart,
        shiftEnd: p.shiftEnd,
        daysOfWeek: p.daysOfWeek,
        guardsCount: p.guardsCount,
        rolShiftPattern: p.rolShiftPattern,
      }));
    }
  }

  return null;
}
