/** Convierte un clauseId slug a un label legible para UI */
export function clauseIdToLabel(id: string): string {
  if (!id) return "";
  return id
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
