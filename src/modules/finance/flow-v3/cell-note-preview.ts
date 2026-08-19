/** Preview corto de nota para la grilla (una línea). Safe para cliente. */
export function noteCellPreview(note: string, max = 20): string {
  const t = note.trim().replace(/\s+/g, " ");
  if (!t) return "";
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(1, max - 1))}…`;
}
