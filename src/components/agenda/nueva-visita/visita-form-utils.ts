import { todayInChile, CHILE_TZ } from "@/lib/dates-cl";

/** Próximo slot de 30 min en hora Chile (HH:mm). */
export function defaultTimeChile(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CHILE_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "9");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const total = hour * 60 + minute + 30;
  const rounded = Math.ceil(total / 30) * 30;
  const hh = Math.floor(rounded / 60) % 24;
  const mm = rounded % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function defaultScheduleParts(now: Date = new Date()): {
  date: string;
  time: string;
} {
  return { date: todayInChile(now), time: defaultTimeChile(now) };
}

/** Vacío / whitespace → fallback (usuario actual). */
export function resolveAssignedUserId(
  assignedUserId: string | null | undefined,
  fallbackUserId: string,
): string {
  const trimmed = typeof assignedUserId === "string" ? assignedUserId.trim() : "";
  return trimmed || fallbackUserId;
}

export type VisitaSubmitFields = {
  date: string;
  time: string;
  allDay: boolean;
  loading?: boolean;
};

export function canSubmitVisitaForm(f: VisitaSubmitFields): boolean {
  if (f.loading) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) return false;
  if (f.allDay) return true;
  return /^\d{2}:\d{2}/.test(f.time);
}

/** Mensaje corto de qué falta para habilitar Agendar. */
export function missingVisitaSubmitHint(f: VisitaSubmitFields): string | null {
  if (f.loading) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) return "Elige una fecha";
  if (!f.allDay && !/^\d{2}:\d{2}/.test(f.time)) return "Elige una hora de inicio";
  return null;
}
