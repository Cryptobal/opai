/**
 * Configuración de Conocimiento por tenant.
 *
 * Lee de la tabla `Setting` con `category: "knowledge"`.
 * Cache en memoria de 5 min por tenantId (mismo patrón que tenant-config.ts).
 */

import { prisma } from "@/lib/prisma";

export interface KnowledgeConfig {
  /** Días por defecto para examen recurrente. Default 90. */
  recurringDefaultDays: number;
  /** Hora local Chile para enviar (0–23). Default 9. */
  dispatchHourCl: number;
  /** Días para responder antes de marcar `expired`. Default 14. */
  deadlineDays: number;
  /** Días después de envío sin abrir para enviar recordatorio. Default 7. 0 = desactivado. */
  reminderDays: number;
  /** Si false, el cron crea ExamAssignment pero NO envía email. Default true. */
  emailEnabled: boolean;
}

const DEFAULTS: KnowledgeConfig = {
  recurringDefaultDays: 90,
  dispatchHourCl: 9,
  deadlineDays: 14,
  reminderDays: 7,
  emailEnabled: true,
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { value: KnowledgeConfig; expires: number }>();

const KEY = {
  recurringDefaultDays: "knowledge.recurring_default_days",
  dispatchHourCl: "knowledge.dispatch_hour_cl",
  deadlineDays: "knowledge.deadline_days",
  reminderDays: "knowledge.reminder_days",
  emailEnabled: "knowledge.email_enabled",
} as const;

export function invalidateKnowledgeConfig(tenantId: string): void {
  cache.delete(tenantId);
}

export async function getKnowledgeConfig(tenantId: string): Promise<KnowledgeConfig> {
  const cached = cache.get(tenantId);
  if (cached && cached.expires > Date.now()) return cached.value;

  const rows = await prisma.setting.findMany({
    where: {
      tenantId,
      category: "knowledge",
      key: { in: Object.values(KEY) },
    },
    select: { key: true, value: true },
  });

  const map = new Map(rows.map((r) => [r.key, r.value]));

  const cfg: KnowledgeConfig = {
    recurringDefaultDays: parseIntOr(map.get(KEY.recurringDefaultDays), DEFAULTS.recurringDefaultDays, 1, 365),
    dispatchHourCl: parseIntOr(map.get(KEY.dispatchHourCl), DEFAULTS.dispatchHourCl, 0, 23),
    deadlineDays: parseIntOr(map.get(KEY.deadlineDays), DEFAULTS.deadlineDays, 1, 365),
    reminderDays: parseIntOr(map.get(KEY.reminderDays), DEFAULTS.reminderDays, 0, 365),
    emailEnabled: parseBoolOr(map.get(KEY.emailEnabled), DEFAULTS.emailEnabled),
  };

  cache.set(tenantId, { value: cfg, expires: Date.now() + CACHE_TTL_MS });
  return cfg;
}

export async function setKnowledgeConfig(
  tenantId: string,
  partial: Partial<KnowledgeConfig>,
): Promise<KnowledgeConfig> {
  const updates: Array<{ key: string; value: string }> = [];
  if (partial.recurringDefaultDays !== undefined) updates.push({ key: KEY.recurringDefaultDays, value: String(partial.recurringDefaultDays) });
  if (partial.dispatchHourCl !== undefined) updates.push({ key: KEY.dispatchHourCl, value: String(partial.dispatchHourCl) });
  if (partial.deadlineDays !== undefined) updates.push({ key: KEY.deadlineDays, value: String(partial.deadlineDays) });
  if (partial.reminderDays !== undefined) updates.push({ key: KEY.reminderDays, value: String(partial.reminderDays) });
  if (partial.emailEnabled !== undefined) updates.push({ key: KEY.emailEnabled, value: String(partial.emailEnabled) });

  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map((u) =>
        prisma.setting.upsert({
          where: { tenantId_key: { tenantId, key: u.key } },
          update: { value: u.value, type: typeOf(u.key), category: "knowledge" },
          create: { tenantId, key: u.key, value: u.value, type: typeOf(u.key), category: "knowledge" },
        }),
      ),
    );
  }

  invalidateKnowledgeConfig(tenantId);
  return getKnowledgeConfig(tenantId);
}

function typeOf(key: string): string {
  if (key === KEY.emailEnabled) return "boolean";
  return "number";
}

function parseIntOr(s: string | undefined, fallback: number, min: number, max: number): number {
  if (!s) return fallback;
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n) || n < min || n > max) return fallback;
  return n;
}

function parseBoolOr(s: string | undefined, fallback: boolean): boolean {
  if (s === undefined) return fallback;
  return s === "true" || s === "1";
}

/**
 * Resuelve los días recurrentes efectivos para un examen.
 * Prioridad:
 *   1) exam.recurringDays   (override del examen, en días)
 *   2) exam.recurringMonths × 30 (legacy)
 *   3) tenant default (KnowledgeConfig.recurringDefaultDays)
 */
export function resolveRecurringDays(
  exam: { recurringDays: number | null; recurringMonths: number | null },
  tenantDefault: number,
): number {
  if (exam.recurringDays && exam.recurringDays > 0) return exam.recurringDays;
  if (exam.recurringMonths && exam.recurringMonths > 0) return exam.recurringMonths * 30;
  return tenantDefault;
}
