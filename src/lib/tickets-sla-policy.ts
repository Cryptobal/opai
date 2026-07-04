/**
 * Política de recordatorios de SLA por tenant (Fase 14).
 *
 * Antes: los intervalos de re-notificación estaban HARDCODEADOS en el monitor
 * (P1 2h · P2 6h · P3 24h · P4 72h), sin tope diario ni forma de ajustarlos —
 * "metralleta fija". Ahora viven en configuración por tenant, con defaults =
 * los valores históricos, para no cambiar el comportamiento de nadie sin acción.
 *
 * Se guarda DENTRO del Setting `notification_preferences:{tenantId}` (mismo
 * registro que el resto de preferencias de notificación → una sola fuente, sin
 * migración). El monitor y la ruta de config leen ambos por aquí.
 */

import { prisma } from "@/lib/prisma";

export type SlaPriority = "p1" | "p2" | "p3" | "p4";
export const SLA_PRIORITIES: SlaPriority[] = ["p1", "p2", "p3", "p4"];

export interface SlaReminderPolicy {
  /** Intervalo de re-notificación por prioridad, en HORAS. */
  intervals: Record<SlaPriority, number>;
  /** Tope de recordatorios por ticket por día (individuales o consolidados). */
  dailyCap: number;
  /** "Solo resumen diario": sin campanas individuales; se apoya en sla-daily-digest. */
  digestOnly: Record<SlaPriority, boolean>;
}

export const DEFAULT_SLA_REMINDER_POLICY: SlaReminderPolicy = {
  intervals: { p1: 2, p2: 6, p3: 24, p4: 72 },
  dailyCap: 3,
  digestOnly: { p1: false, p2: false, p3: false, p4: false },
};

/** Clave del Setting compartido con las preferencias de notificación del tenant. */
export function notificationPrefsSettingKey(tenantId: string): string {
  return `notification_preferences:${tenantId}`;
}

const clamp = (n: unknown, lo: number, hi: number, fallback: number): number => {
  const v = typeof n === "number" && Number.isFinite(n) ? n : fallback;
  return Math.max(lo, Math.min(hi, Math.round(v)));
};

/** Normaliza cualquier entrada (parcial/corrupta) a una política válida y completa. */
export function sanitizeSlaReminderPolicy(raw: unknown): SlaReminderPolicy {
  const r = (raw ?? {}) as Partial<SlaReminderPolicy>;
  const ri = (r.intervals ?? {}) as Partial<Record<SlaPriority, number>>;
  const rd = (r.digestOnly ?? {}) as Partial<Record<SlaPriority, boolean>>;
  const d = DEFAULT_SLA_REMINDER_POLICY;
  const intervals = {} as Record<SlaPriority, number>;
  const digestOnly = {} as Record<SlaPriority, boolean>;
  for (const p of SLA_PRIORITIES) {
    // 1h..168h (una semana): evita 0 (spam infinito) y valores absurdos.
    intervals[p] = clamp(ri[p], 1, 168, d.intervals[p]);
    digestOnly[p] = typeof rd[p] === "boolean" ? (rd[p] as boolean) : d.digestOnly[p];
  }
  return { intervals, dailyCap: clamp(r.dailyCap, 1, 50, d.dailyCap), digestOnly };
}

function extractPolicy(value: string | null | undefined): SlaReminderPolicy {
  if (!value) return DEFAULT_SLA_REMINDER_POLICY;
  try {
    const parsed = JSON.parse(value) as { slaReminderPolicy?: unknown };
    return sanitizeSlaReminderPolicy(parsed.slaReminderPolicy);
  } catch {
    return DEFAULT_SLA_REMINDER_POLICY;
  }
}

/** Política de un tenant (defaults si no configuró nada). */
export async function getSlaReminderPolicy(tenantId: string): Promise<SlaReminderPolicy> {
  const setting = await prisma.setting
    .findFirst({ where: { key: notificationPrefsSettingKey(tenantId) }, select: { value: true } })
    .catch(() => null);
  return extractPolicy(setting?.value ?? null);
}

/** Carga en lote (para el monitor, que barre varios tenants por corrida). */
export async function getSlaReminderPolicies(
  tenantIds: string[],
): Promise<Map<string, SlaReminderPolicy>> {
  const map = new Map<string, SlaReminderPolicy>();
  if (tenantIds.length === 0) return map;
  const keys = tenantIds.map(notificationPrefsSettingKey);
  const settings = await prisma.setting
    .findMany({ where: { key: { in: keys } }, select: { tenantId: true, value: true } })
    .catch(() => []);
  const byTenant = new Map(settings.map((s) => [s.tenantId ?? "", s.value]));
  for (const id of tenantIds) map.set(id, extractPolicy(byTenant.get(id)));
  return map;
}
