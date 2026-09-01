/**
 * Columnas mutables del trigger append-only de ops.marcaciones (Art. 14 a ii).
 * El resto de columnas es inmutable; DELETE físico está prohibido.
 *
 * Adaptación: `timestamp` se permite porque el PATCH de back office
 * actualiza la hora de la marca (queda is_modified = true).
 */
export const MARCACION_APPEND_ONLY_ALLOWED_COLUMNS = [
  "deleted_at",
  "deleted_by",
  "modified_at",
  "modified_by",
  "modification_reason",
  "is_modified",
  "opposition_token",
  "opposed_at",
  "opposed_by",
  "opposition_reason",
  "consolidated_at",
  "timestamp",
] as const;

export type MarcacionAppendOnlyColumn =
  (typeof MARCACION_APPEND_ONLY_ALLOWED_COLUMNS)[number];
