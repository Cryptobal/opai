/**
 * clause-utils-client — Utilidades cliente para manejar clauseId
 *
 * Genera slugs válidos a partir de texto libre, valida formato y detecta
 * duplicados dentro de un documento Tiptap JSON.
 */

/** Convierte texto libre de heading a un slug válido para clauseId. */
export function textToClauseId(text: string): string {
  if (!text) return "";
  const ordinalMatch = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .match(
      /^(primera|segunda|tercera|cuarta|quinta|sexta|septima|octava|novena|decima|undecima|duodecima|decima\s+\w+|vigesima(?:\s+\w+)?|trigesima(?:\s+\w+)?)\b/
    );
  const base = ordinalMatch
    ? ordinalMatch[1]
    : text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  return base
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

/** Valida formato de clauseId (a-z, 0-9, guiones, sin guiones iniciales/finales). */
export function isValidClauseId(id: string): boolean {
  if (!id) return false;
  if (id.length > 48) return false;
  return /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(id);
}

/** Busca clauseIds duplicados en un doc Tiptap JSON. Retorna set de ids duplicados. */
export function findDuplicateClauseIds(doc: any): Set<string> {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  const walk = (node: any) => {
    if (!node) return;
    if (node.type === "heading" && node.attrs?.clauseId) {
      const id = String(node.attrs.clauseId);
      if (seen.has(id)) dupes.add(id);
      else seen.add(id);
    }
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };
  walk(doc);
  return dupes;
}
