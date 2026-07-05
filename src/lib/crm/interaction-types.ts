/**
 * Tipos de interacción comercial registrados en `CrmNote.interactionType`
 * (Fase 2/4). Fuente única compartida por: guardado desde Slack, el modal
 * "Registrar interacción", el timeline web y las tarjetas comerciales. Los
 * valores lógicos se validan en la app (no hay CHECK en la BD).
 */

export type InteractionType = "note" | "contact" | "call" | "meeting" | "visit";

export interface InteractionTypeMeta {
  key: InteractionType;
  emoji: string;
  label: string;
}

export const INTERACTION_TYPES: InteractionTypeMeta[] = [
  { key: "note", emoji: "📝", label: "Nota" },
  { key: "contact", emoji: "✉️", label: "Contacto" },
  { key: "call", emoji: "📞", label: "Llamado" },
  { key: "meeting", emoji: "🤝", label: "Reunión" },
  { key: "visit", emoji: "🚶", label: "Visita" },
];

const BY_KEY = new Map(INTERACTION_TYPES.map((t) => [t.key, t]));

/** Type guard: ¿es un tipo de interacción válido? */
export function isInteractionType(v: string | null | undefined): v is InteractionType {
  return !!v && BY_KEY.has(v as InteractionType);
}

/** Metadatos de un tipo (default: Nota) — nunca null. */
export function interactionMeta(key: string | null | undefined): InteractionTypeMeta {
  return (key ? BY_KEY.get(key as InteractionType) : undefined) ?? INTERACTION_TYPES[0];
}

/** Etiqueta con emoji, p. ej. "🤝 Reunión". */
export function interactionLabel(key: string | null | undefined): string {
  const m = interactionMeta(key);
  return `${m.emoji} ${m.label}`;
}
