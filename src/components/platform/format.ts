import { CHILE_TZ } from "@/lib/dates-cl";

export function formatClDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-CL", {
    timeZone: CHILE_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatClDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-CL", {
    timeZone: CHILE_TZ,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatUf(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `UF ${value.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatClp(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `CLP ${Math.round(value).toLocaleString("es-CL")}`;
}

export function minutesAgoLabel(sinceMs: number, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - sinceMs) / 60_000));
  if (mins < 1) return "actualizado ahora";
  if (mins === 1) return "actualizado hace 1 min";
  return `actualizado hace ${mins} min`;
}
