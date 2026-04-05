export function generateSlug(titulo: string): string {
  const base = titulo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 50);
  const random = Math.random().toString(36).slice(2, 8);
  return `${base}-${random}`;
}
