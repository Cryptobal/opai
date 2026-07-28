import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { CHILE_TZ } from "@/lib/dates-cl";

/**
 * Preferencias de posponer (estilo Gmail). Persistidas en
 * `opai.crm.correos.view.v1` junto al resto de preferencias de bandeja.
 */
export type CorreoSnoozeConfig = {
  /** Hora de "Mañana" / "Próxima semana" / fin de semana (0–23). Default 8. */
  morningHour: number;
  /** Hora de "Hoy más tarde" (0–23). Default 18. */
  afternoonHour: number;
  /** Día de "Este fin de semana": 0 = domingo, 6 = sábado. */
  weekendDay: 0 | 6;
  /** Día de "La próxima semana" (1 = lunes … 5 = viernes). */
  nextWeekDay: 1 | 2 | 3 | 4 | 5;
};

export const DEFAULT_CORREO_SNOOZE_CONFIG: CorreoSnoozeConfig = {
  morningHour: 8,
  afternoonHour: 18,
  weekendDay: 6,
  nextWeekDay: 1,
};

export const CORREO_SNOOZE_MORNING_HOURS = [6, 7, 8, 9, 10] as const;
export const CORREO_SNOOZE_AFTERNOON_HOURS = [13, 14, 15, 16, 17, 18, 19, 20] as const;

export type CorreoSnoozePresetId =
  | "plus_1h"
  | "plus_3h"
  | "later_today"
  | "tomorrow"
  | "later_this_week"
  | "this_weekend"
  | "next_week";

export type CorreoSnoozePreset = {
  id: CorreoSnoozePresetId;
  label: string;
  at: Date;
};

function clampHour(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value)) return fallback;
  if (value < min || value > max) return fallback;
  return value;
}

/** Parsea config parcial; inválidos → defaults. Nunca lanza. */
export function parseCorreoSnoozeConfig(value: unknown): CorreoSnoozeConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_CORREO_SNOOZE_CONFIG };
  }
  const c = value as Record<string, unknown>;
  const weekendDay = c.weekendDay === 0 || c.weekendDay === 6 ? c.weekendDay : 6;
  const nextWeekDay =
    c.nextWeekDay === 1 ||
    c.nextWeekDay === 2 ||
    c.nextWeekDay === 3 ||
    c.nextWeekDay === 4 ||
    c.nextWeekDay === 5
      ? c.nextWeekDay
      : 1;
  return {
    morningHour: clampHour(c.morningHour, 8, 0, 23),
    afternoonHour: clampHour(c.afternoonHour, 18, 0, 23),
    weekendDay,
    nextWeekDay,
  };
}

/** Construye un instante UTC desde hora de pared Chile. */
export function atChileWall(
  base: Date,
  opts: { addDays?: number; targetWeekday?: number; hour: number; minute?: number },
): Date {
  const cl = toZonedTime(base, CHILE_TZ);
  if (typeof opts.targetWeekday === "number") {
    const delta = ((opts.targetWeekday - cl.getDay() + 7) % 7) || 7;
    cl.setDate(cl.getDate() + delta);
  } else if (opts.addDays) {
    cl.setDate(cl.getDate() + opts.addDays);
  }
  cl.setHours(opts.hour, opts.minute ?? 0, 0, 0);
  return fromZonedTime(cl, CHILE_TZ);
}

/** Interpreta YYYY-MM-DD + HH:MM como hora de pared Chile → UTC. */
export function chileDateTimeToUtc(dateYmd: string, timeHm: string): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateYmd);
  const tm = /^(\d{1,2}):(\d{2})$/.exec(timeHm);
  if (!dm || !tm) return null;
  const y = Number(dm[1]);
  const mo = Number(dm[2]);
  const d = Number(dm[3]);
  const h = Number(tm[1]);
  const mi = Number(tm[2]);
  if (
    !Number.isFinite(y) ||
    !Number.isFinite(mo) ||
    !Number.isFinite(d) ||
    h < 0 ||
    h > 23 ||
    mi < 0 ||
    mi > 59
  ) {
    return null;
  }
  const at = fromZonedTime(new Date(y, mo - 1, d, h, mi, 0, 0), CHILE_TZ);
  if (Number.isNaN(at.getTime())) return null;
  return at;
}

export function formatSnoozeWhen(d: Date): string {
  return d.toLocaleString("es-CL", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: CHILE_TZ,
  });
}

/** Formato compacto tipo Gmail: "mié, 8:00". */
export function formatSnoozeWhenShort(d: Date): string {
  return d.toLocaleString("es-CL", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: CHILE_TZ,
  });
}

/**
 * "Esta semana más tarde": jueves 08:00 si hoy es dom–mié; viernes si es jueves.
 * Si ya pasó (vie/sáb) o cae el mismo día que otro preset, se omite.
 */
function laterThisWeekAt(now: Date, morningHour: number): Date | null {
  const cl = toZonedTime(now, CHILE_TZ);
  const day = cl.getDay(); // 0 dom … 6 sáb
  if (day === 5 || day === 6) return null; // vie/sáb → no aplica
  const target = day === 4 ? 5 : 4; // jue→vie; dom–mié→jue
  const at = atChileWall(now, { targetWeekday: target, hour: morningHour });
  return at.getTime() > now.getTime() ? at : null;
}

/**
 * Presets estilo Gmail + relativos (+1h / +3h). Solo futuros; orden fijo.
 */
export function buildCorreoSnoozePresets(
  now: Date = new Date(),
  config: CorreoSnoozeConfig = DEFAULT_CORREO_SNOOZE_CONFIG,
): CorreoSnoozePreset[] {
  const cfg = parseCorreoSnoozeConfig(config);
  const out: CorreoSnoozePreset[] = [];

  const plus1 = new Date(now.getTime() + 60 * 60 * 1000);
  out.push({ id: "plus_1h", label: "En 1 hora", at: plus1 });

  const plus3 = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  out.push({ id: "plus_3h", label: "En 3 horas", at: plus3 });

  const laterToday = atChileWall(now, { hour: cfg.afternoonHour });
  if (laterToday.getTime() > now.getTime()) {
    out.push({ id: "later_today", label: "Hoy más tarde", at: laterToday });
  }

  const tomorrow = atChileWall(now, { addDays: 1, hour: cfg.morningHour });
  if (tomorrow.getTime() > now.getTime()) {
    out.push({ id: "tomorrow", label: "Mañana", at: tomorrow });
  }

  const midWeek = laterThisWeekAt(now, cfg.morningHour);
  if (midWeek) {
    // Evitar duplicar "Mañana" si mañana es exactamente ese jueves/viernes.
    if (midWeek.getTime() !== tomorrow.getTime()) {
      out.push({ id: "later_this_week", label: "Esta semana más tarde", at: midWeek });
    }
  }

  const weekend = atChileWall(now, {
    targetWeekday: cfg.weekendDay,
    hour: cfg.morningHour,
  });
  if (weekend.getTime() > now.getTime() && weekend.getTime() !== tomorrow.getTime()) {
    out.push({ id: "this_weekend", label: "Este fin de semana", at: weekend });
  }

  const nextWeek = atChileWall(now, {
    targetWeekday: cfg.nextWeekDay,
    hour: cfg.morningHour,
  });
  if (nextWeek.getTime() > now.getTime()) {
    out.push({ id: "next_week", label: "La próxima semana", at: nextWeek });
  }

  return out.filter((p) => p.at.getTime() > now.getTime());
}
