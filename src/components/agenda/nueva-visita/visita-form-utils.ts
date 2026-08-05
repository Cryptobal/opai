import { todayInChile, CHILE_TZ, ymdInChile } from "@/lib/dates-cl";
import { dateAtChileSlot } from "@/components/agenda/agenda-calendar-utils";

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
  endDate: string;
} {
  const date = todayInChile(now);
  return { date, time: defaultTimeChile(now), endDate: date };
}

/** Vacío / whitespace → fallback (usuario actual). */
export function resolveAssignedUserId(
  assignedUserId: string | null | undefined,
  fallbackUserId: string,
): string {
  const trimmed = typeof assignedUserId === "string" ? assignedUserId.trim() : "";
  return trimmed || fallbackUserId;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeEndDate(date: string, endDate?: string | null): string {
  if (!YMD.test(date)) return date;
  if (typeof endDate === "string" && YMD.test(endDate) && endDate >= date) {
    return endDate;
  }
  return date;
}

export type VisitaSubmitFields = {
  date: string;
  time: string;
  allDay: boolean;
  endDate?: string;
  loading?: boolean;
};

export function canSubmitVisitaForm(f: VisitaSubmitFields): boolean {
  if (f.loading) return false;
  if (!YMD.test(f.date)) return false;
  if (f.allDay) {
    const endRaw = f.endDate?.trim() || f.date;
    if (!YMD.test(endRaw)) return false;
    return endRaw >= f.date;
  }
  return /^\d{2}:\d{2}/.test(f.time);
}

/** Mensaje corto de qué falta para habilitar Agendar. */
export function missingVisitaSubmitHint(f: VisitaSubmitFields): string | null {
  if (f.loading) return null;
  if (!YMD.test(f.date)) return "Elige una fecha de inicio";
  if (f.allDay) {
    const end = f.endDate?.trim() || "";
    if (end && YMD.test(end) && end < f.date) {
      return "La fecha de término no puede ser anterior al inicio";
    }
    return null;
  }
  if (!/^\d{2}:\d{2}/.test(f.time)) return "Elige una hora de inicio";
  return null;
}

/** Calcula startAt/endAt Chile desde campos del formulario/API. */
export function scheduleFromFormParts(input: {
  date: string;
  endDate?: string | null;
  time?: string | null;
  allDay: boolean;
  durationMin?: number;
}): { startAt: Date; endAt: Date; endDate: string } | null {
  if (!YMD.test(input.date)) return null;
  const endDate = normalizeEndDate(input.date, input.endDate);
  if (input.allDay) {
    return {
      startAt: dateAtChileSlot(input.date, 0),
      endAt: dateAtChileSlot(endDate, 24 * 60 - 1),
      endDate,
    };
  }
  const [hh, mm] = String(input.time ?? "09:00").split(":").map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  const durationMin = Math.max(15, Math.min(24 * 60, Number(input.durationMin) || 60));
  const startAt = dateAtChileSlot(input.date, hh * 60 + mm);
  return {
    startAt,
    endAt: new Date(startAt.getTime() + durationMin * 60_000),
    endDate: input.date,
  };
}

/** Fecha de término inclusiva (Chile) a partir de endAt almacenado. */
export function endDateFromEndAt(endAt: Date | string): string {
  return ymdInChile(typeof endAt === "string" ? new Date(endAt) : endAt);
}
