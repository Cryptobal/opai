/** Slug estable para CalendarEvent.kind a partir de etiqueta libre. */
export function labelToKindSlug(label: string | null | undefined): string {
  if (!label?.trim()) return "event";
  return (
    label
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 40) || "event"
  );
}
