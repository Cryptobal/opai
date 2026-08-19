/** Stub comercial / de licitación de exclusiones: cuenta como “sin contenido”. */
export function isPlaceholderExclusionesContent(content: string): boolean {
  const t = content.trim().toLowerCase();
  if (!t) return true;
  return (
    t === "pendiente de completar." ||
    t === "pendiente de completar" ||
    t.startsWith("pendiente: se completará")
  );
}
