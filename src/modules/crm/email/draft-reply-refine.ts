/** Presets de refinamiento post-borrador (estilo Gmail Help me write). */

export const DRAFT_REFINE_MODES = ["formal", "friendly", "shorten", "polish"] as const;
export type DraftRefineMode = (typeof DRAFT_REFINE_MODES)[number];

export const DRAFT_REFINE_CHIPS: ReadonlyArray<{ id: DraftRefineMode; label: string }> = [
  { id: "formal", label: "Formalizar" },
  { id: "friendly", label: "Amistoso" },
  { id: "shorten", label: "Acortar" },
  { id: "polish", label: "Pulir" },
];

/** Instrucciones internas para el modelo (no se muestran al usuario). */
export const DRAFT_REFINE_INSTRUCTIONS: Record<DraftRefineMode, string> = {
  formal:
    "Reescribí el borrador con tono más formal y profesional. Conservá todos los hechos, nombres y compromisos; no inventes datos.",
  friendly:
    "Reescribí el borrador con tono más cercano y amistoso, sin perder profesionalismo ni hechos. No uses jerga excesiva.",
  shorten:
    "Acortá el borrador de forma notable (apuntá a ~60% de la extensión) manteniendo el mismo mensaje, hechos y próximo paso.",
  polish:
    "Pulí el borrador: mejor redacción, claridad y fluidez en español chileno neutro. No cambies el sentido ni agregues información nueva.",
};

export function isDraftRefineMode(value: unknown): value is DraftRefineMode {
  return typeof value === "string" && (DRAFT_REFINE_MODES as readonly string[]).includes(value);
}
