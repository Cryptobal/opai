import type { CrmStructureAssumption, CrmStructureProposal } from "./email-to-crm-structure.types";

function getAtPath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    const key = /^\d+$/.test(part) ? Number(part) : part;
    cur = (cur as Record<string | number, unknown>)[key as string];
  }
  return cur;
}

function setAtPath(obj: unknown, path: string, value: unknown): boolean {
  const parts = path.split(".");
  if (parts.length === 0) return false;
  let cur: unknown = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const key = /^\d+$/.test(part) ? Number(part) : part;
    if (cur == null || typeof cur !== "object") return false;
    const next = (cur as Record<string | number, unknown>)[key as string];
    if (next == null) return false;
    cur = next;
  }
  const last = parts[parts.length - 1];
  const lastKey = /^\d+$/.test(last) ? Number(last) : last;
  if (cur == null || typeof cur !== "object") return false;
  if (Array.isArray(cur) && typeof lastKey === "number") {
    if (lastKey < 0 || lastKey >= cur.length) return false;
    cur[lastKey] = value;
    return true;
  }
  (cur as Record<string | number, unknown>)[lastKey as string] = value;
  return true;
}

/**
 * Re-aplica valores bloqueados desde `base` sobre `next`.
 * Paths inválidos o índices inexistentes se ignoran silenciosamente.
 */
export function applyLocks(
  next: CrmStructureProposal,
  base: CrmStructureProposal,
  locks: string[],
): CrmStructureProposal {
  if (!locks.length) return next;
  const out = structuredClone(next);
  for (const path of locks) {
    if (!path || path.length > 200) continue;
    // No bloquear campos calculados de dotación — se recalculan después.
    if (
      path.includes(".weeklyHH") ||
      path.includes(".headcount") ||
      path.includes(".pattern") ||
      path.includes(".staffingRationale") ||
      path === "staffingTotals" ||
      path.startsWith("staffingTotals.")
    ) {
      continue;
    }
    const value = getAtPath(base, path);
    if (value === undefined) continue;
    setAtPath(out, path, structuredClone(value));
  }
  return out;
}

/**
 * Fusiona supuestos: conserva por id los de origen user/edited del base;
 * los nuevos de la IA entran como inference.
 */
export function mergeAssumptionItems(
  nextItems: CrmStructureAssumption[] | undefined,
  baseItems: CrmStructureAssumption[] | undefined,
): CrmStructureAssumption[] {
  const next = nextItems ?? [];
  const base = baseItems ?? [];
  const preserved = base.filter(
    (a) => a.origin === "user" || a.origin === "edited" || a.removed,
  );
  const preservedIds = new Set(preserved.map((a) => a.id));
  const fromAi = next.filter((a) => !preservedIds.has(a.id));
  // También preservar por texto original si la IA regeneró el mismo supuesto.
  const preservedTexts = new Set(
    preserved.map((a) => a.originalText.trim().toLowerCase()),
  );
  const fromAiDeduped = fromAi.filter(
    (a) => !preservedTexts.has(a.text.trim().toLowerCase()),
  );
  return [...preserved, ...fromAiDeduped];
}
