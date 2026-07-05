/**
 * Macro-fase de una etapa del pipeline (Fase 3). Colapsa las N etapas reales en
 * 3 macro-fases con emoji, para reflejar el avance en el NOMBRE del canal sin
 * renombrar en cada micro-cambio (naming "emoji"): 🌱 prospección → 🔥
 * negociación → 🤝 cierre. El canal solo se renombra al CRUZAR de macro-fase.
 */

export type MacroPhaseKey = "early" | "mid" | "late";

export interface MacroPhase {
  emoji: string;
  key: MacroPhaseKey;
}

/**
 * `order` = CrmPipelineStage.order (posición de la etapa); `total` = nº de
 * etapas abiertas. Divide el recorrido en tercios. Robusto ante total ≤ 1.
 */
export function stageMacroPhase(order: number, total: number): MacroPhase {
  if (!Number.isFinite(order) || total <= 1) return { emoji: "🌱", key: "early" };
  const ratio = Math.max(0, Math.min(1, order / Math.max(1, total - 1)));
  if (ratio < 1 / 3) return { emoji: "🌱", key: "early" };
  if (ratio < 2 / 3) return { emoji: "🔥", key: "mid" };
  return { emoji: "🤝", key: "late" };
}
