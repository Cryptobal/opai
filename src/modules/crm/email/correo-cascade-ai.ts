/**
 * Foco de creación IA desde la cascada del Copiloto.
 * Armar licitación = plan completo; cada sparkles de fila = solo esa entidad.
 */
import type { CreateCrmStructureInclude } from "./email-to-crm-structure.types";

export type CorreoCascadeAiTarget =
  | "account"
  | "contact"
  | "deal"
  | "quote"
  | "installation";

export type CascadeAiSelection = {
  selectedIds: Set<string>;
  include: CreateCrmStructureInclude;
};

/**
 * Selección mínima para crear solo la entidad pedida desde la cascada.
 * `account` siempre queda seleccionado (la cuenta ancla el plan).
 */
export function selectionForCascadeAi(
  target: CorreoCascadeAiTarget,
): CascadeAiSelection {
  const baseInclude: CreateCrmStructureInclude = {
    contact: false,
    deal: false,
    installations: false,
    attachments: false,
    followUpTask: false,
    quote: false,
    milestones: false,
  };

  switch (target) {
    case "account":
      return {
        selectedIds: new Set(["account"]),
        include: baseInclude,
      };
    case "contact":
      return {
        selectedIds: new Set(["account", "contact"]),
        include: { ...baseInclude, contact: true },
      };
    case "deal":
      return {
        selectedIds: new Set(["account", "deal"]),
        include: { ...baseInclude, deal: true },
      };
    case "quote":
      return {
        selectedIds: new Set(["account", "quote"]),
        include: { ...baseInclude, quote: true },
      };
    case "installation":
      return {
        selectedIds: new Set(["account", "installations"]),
        include: { ...baseInclude, installations: true },
      };
  }
}
