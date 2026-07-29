/**
 * SLA de espera de contraparte (Copiloto Correos v4).
 *
 * Horas hábiles lun–vie 09:00–18:00 America/Santiago desde el último inbound
 * externo sin outbound posterior. Sin calendario de feriados en v1.
 */
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { CHILE_TZ } from "@/lib/dates-cl";

const WORKDAY_START_H = 9;
const WORKDAY_END_H = 18;
const WORKDAY_HOURS = WORKDAY_END_H - WORKDAY_START_H; // 9

export type SlaLevel = "warn" | "danger";

export type SlaThresholds = {
  dealWarn: number;
  dealDanger: number;
  nodealWarn: number;
  nodealDanger: number;
};

export const DEFAULT_SLA_THRESHOLDS: SlaThresholds = {
  dealWarn: 8,
  dealDanger: 24,
  nodealWarn: 24,
  nodealDanger: 72,
};

const SETTING_KEYS = {
  dealWarn: "correos.sla.deal.warn",
  dealDanger: "correos.sla.deal.danger",
  nodealWarn: "correos.sla.nodeal.warn",
  nodealDanger: "correos.sla.nodeal.danger",
} as const;

function parsePositiveHours(raw: string | null | undefined, fallback: number): number {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

/** Umbrales por tenant desde Setting; defaults si la clave no existe. */
export async function getSlaThresholds(tenantId: string): Promise<SlaThresholds> {
  const keys = Object.values(SETTING_KEYS);
  const rows = await prisma.setting
    .findMany({
      where: { tenantId, key: { in: keys } },
      select: { key: true, value: true },
    })
    .catch(() => []);
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const d = DEFAULT_SLA_THRESHOLDS;
  return {
    dealWarn: parsePositiveHours(byKey.get(SETTING_KEYS.dealWarn), d.dealWarn),
    dealDanger: parsePositiveHours(byKey.get(SETTING_KEYS.dealDanger), d.dealDanger),
    nodealWarn: parsePositiveHours(byKey.get(SETTING_KEYS.nodealWarn), d.nodealWarn),
    nodealDanger: parsePositiveHours(byKey.get(SETTING_KEYS.nodealDanger), d.nodealDanger),
  };
}

/**
 * Horas hábiles entre dos instantes (UTC) en America/Santiago.
 * Lun–vie 09:00–18:00. Fin de semana y fuera de horario = 0.
 */
export function businessHoursBetween(from: Date, to: Date): number {
  if (!(from instanceof Date) || !(to instanceof Date)) return 0;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  if (to.getTime() <= from.getTime()) return 0;

  let totalMs = 0;
  let cursor = new Date(from.getTime());

  // Acotar a max ~400 días para evitar loops en fechas corruptas.
  const hardCap = new Date(from.getTime() + 400 * 86_400_000);
  const end = to.getTime() < hardCap.getTime() ? to : hardCap;

  while (cursor.getTime() < end.getTime()) {
    const local = toZonedTime(cursor, CHILE_TZ);
    const dow = local.getDay(); // 0=dom … 6=sáb
    const y = local.getFullYear();
    const m = local.getMonth();
    const d = local.getDate();

    if (dow === 0 || dow === 6) {
      // Saltar al lunes 09:00 Chile.
      const daysToMon = dow === 0 ? 1 : 2;
      const nextMon = fromZonedTime(
        new Date(y, m, d + daysToMon, WORKDAY_START_H, 0, 0, 0),
        CHILE_TZ,
      );
      cursor = nextMon.getTime() > cursor.getTime() ? nextMon : new Date(cursor.getTime() + 86_400_000);
      continue;
    }

    const dayStart = fromZonedTime(
      new Date(y, m, d, WORKDAY_START_H, 0, 0, 0),
      CHILE_TZ,
    );
    const dayEnd = fromZonedTime(
      new Date(y, m, d, WORKDAY_END_H, 0, 0, 0),
      CHILE_TZ,
    );

    const segStart = Math.max(cursor.getTime(), dayStart.getTime());
    const segEnd = Math.min(end.getTime(), dayEnd.getTime());
    if (segEnd > segStart) totalMs += segEnd - segStart;

    // Avanzar al día siguiente 09:00 Chile.
    const nextDay = fromZonedTime(
      new Date(y, m, d + 1, WORKDAY_START_H, 0, 0, 0),
      CHILE_TZ,
    );
    cursor = nextDay.getTime() > cursor.getTime() ? nextDay : new Date(end.getTime());
  }

  return totalMs / 3_600_000;
}

export function formatSlaLabel(businessHours: number): string {
  if (businessHours < 24) {
    const h = Math.max(1, Math.round(businessHours));
    return `${h} h`;
  }
  const days = Math.max(1, Math.round(businessHours / WORKDAY_HOURS));
  return `${days} d`;
}

export type ThreadSlaInput = {
  lastInboundAt: Date | null | undefined;
  lastOutboundAt: Date | null | undefined;
  accountId: string | null | undefined;
  dealId: string | null | undefined;
  /** Negocio abierto (status === "open"). Si false/null con dealId, no usa umbrales de deal. */
  dealIsOpen?: boolean | null;
  archivedAt?: Date | null;
  trashedAt?: Date | null;
  spamAt?: Date | null;
  snoozedUntil?: Date | null;
  /** Si el último inbound es de dominio/alias propio → no cuenta. */
  lastInboundIsOwn?: boolean;
  /** Remitente automático (no-reply, mailer-daemon). */
  lastInboundIsSystem?: boolean;
};

export type ThreadSlaResult = {
  level: SlaLevel | null;
  businessHours: number;
  label: string | null;
  pendingSince: string | null;
};

export function resolveThreadSla(
  thread: ThreadSlaInput,
  opts: {
    now?: Date;
    thresholds?: SlaThresholds;
  } = {},
): ThreadSlaResult {
  const empty: ThreadSlaResult = {
    level: null,
    businessHours: 0,
    label: null,
    pendingSince: null,
  };

  const now = opts.now ?? new Date();
  const th = opts.thresholds ?? DEFAULT_SLA_THRESHOLDS;

  if (thread.archivedAt || thread.trashedAt || thread.spamAt) return empty;
  if (thread.snoozedUntil && thread.snoozedUntil.getTime() > now.getTime()) return empty;
  if (!thread.accountId) return empty;
  if (!thread.lastInboundAt) return empty;
  if (thread.lastInboundIsOwn || thread.lastInboundIsSystem) return empty;

  // Hay outbound posterior al último inbound → ya respondido.
  if (
    thread.lastOutboundAt &&
    thread.lastOutboundAt.getTime() >= thread.lastInboundAt.getTime()
  ) {
    return empty;
  }

  const hours = businessHoursBetween(thread.lastInboundAt, now);
  if (hours <= 0) return empty;

  const useDeal =
    Boolean(thread.dealId) && thread.dealIsOpen !== false;
  const warn = useDeal ? th.dealWarn : th.nodealWarn;
  const danger = useDeal ? th.dealDanger : th.nodealDanger;

  let level: SlaLevel | null = null;
  if (hours >= danger) level = "danger";
  else if (hours >= warn) level = "warn";

  if (!level) {
    return {
      level: null,
      businessHours: hours,
      label: null,
      pendingSince: thread.lastInboundAt.toISOString(),
    };
  }

  return {
    level,
    businessHours: hours,
    label: formatSlaLabel(hours),
    pendingSince: thread.lastInboundAt.toISOString(),
  };
}
