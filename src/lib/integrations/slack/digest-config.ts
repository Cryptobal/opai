/**
 * Toggles por tenant de los digests / reportes periódicos a Slack.
 *
 * Fuente de verdad: Setting `slack_digests:{tenantId}` (JSON). Defaults = comportamiento
 * histórico (casi todo ON) para no silenciar tenants existentes. Compat:
 * - `comercialDaily` también lee/escribe el legacy `crm.digestDaily`.
 * - `relevo` también lee/escribe `relevo_config.enabled`.
 */

import { prisma } from "@/lib/prisma";

export type SlackDigestKey =
  | "comercialWeekly"
  | "comercialDaily"
  | "rondas"
  | "docs"
  | "agenda"
  | "relevo"
  | "sla";

export interface SlackDigestConfig {
  /** Lunes ~08:00 Chile → canal comercial. */
  comercialWeekly: boolean;
  /** Digest comercial también los demás días (legacy crm.digestDaily). */
  comercialDaily: boolean;
  /** Cumplimiento de rondas del día anterior. */
  rondas: boolean;
  /** Vencimientos de documentos (operacionales + guardia). */
  docs: boolean;
  /** Agenda semanal (visitas + licitaciones). */
  agenda: boolean;
  /** Tablero de relevo / control de asistencia por instalación. */
  relevo: boolean;
  /** Resumen diario de tickets con SLA vencido (solo el canal Slack; campana/email siguen prefs). */
  sla: boolean;
}

export const DEFAULT_SLACK_DIGEST_CONFIG: SlackDigestConfig = {
  comercialWeekly: true,
  comercialDaily: false,
  rondas: true,
  docs: true,
  agenda: true,
  relevo: true,
  sla: true,
};

export const SLACK_DIGEST_META: Array<{
  key: SlackDigestKey;
  label: string;
  description: string;
}> = [
  {
    key: "comercialWeekly",
    label: "Digest comercial (lunes)",
    description: "Pipeline, cotizaciones, leads sin tomar y negocios estancados · ~08:00 Chile",
  },
  {
    key: "comercialDaily",
    label: "Digest comercial diario",
    description: "Mismo resumen comercial todos los días hábiles (además del lunes)",
  },
  {
    key: "rondas",
    label: "Digest de rondas",
    description: "Cumplimiento del día anterior por instalación · canal Operaciones - Rondas",
  },
  {
    key: "docs",
    label: "Digest de documentos",
    description: "Vencimientos operacionales y de guardia · canal Documentos",
  },
  {
    key: "agenda",
    label: "Digest de agenda (semanal)",
    description: "Visitas y licitaciones de la semana · canal por defecto",
  },
  {
    key: "relevo",
    label: "Tablero de relevo",
    description: "Control de asistencia antes de cada turno · canal de la instalación",
  },
  {
    key: "sla",
    label: "Resumen diario SLA",
    description: "Tickets con SLA vencido · canal Operaciones - Tickets (campana/email siguen Mis notificaciones)",
  },
];

const SETTING_KEY = "slack_digests";
const CACHE_TTL_MS = 60 * 1000;
const cache = new Map<string, { value: SlackDigestConfig; expires: number }>();

export function invalidateSlackDigestConfig(tenantId: string): void {
  cache.delete(tenantId);
}

export function parseSlackDigestConfig(raw: string | null | undefined): SlackDigestConfig {
  if (!raw?.trim()) return { ...DEFAULT_SLACK_DIGEST_CONFIG };
  try {
    const parsed = JSON.parse(raw) as Partial<SlackDigestConfig>;
    return {
      comercialWeekly: boolOr(parsed.comercialWeekly, DEFAULT_SLACK_DIGEST_CONFIG.comercialWeekly),
      comercialDaily: boolOr(parsed.comercialDaily, DEFAULT_SLACK_DIGEST_CONFIG.comercialDaily),
      rondas: boolOr(parsed.rondas, DEFAULT_SLACK_DIGEST_CONFIG.rondas),
      docs: boolOr(parsed.docs, DEFAULT_SLACK_DIGEST_CONFIG.docs),
      agenda: boolOr(parsed.agenda, DEFAULT_SLACK_DIGEST_CONFIG.agenda),
      relevo: boolOr(parsed.relevo, DEFAULT_SLACK_DIGEST_CONFIG.relevo),
      sla: boolOr(parsed.sla, DEFAULT_SLACK_DIGEST_CONFIG.sla),
    };
  } catch {
    return { ...DEFAULT_SLACK_DIGEST_CONFIG };
  }
}

export async function getSlackDigestConfig(tenantId: string): Promise<SlackDigestConfig> {
  const cached = cache.get(tenantId);
  if (cached && cached.expires > Date.now()) return cached.value;

  const [row, legacyDaily, relevoRow] = await Promise.all([
    prisma.setting.findFirst({
      where: { key: `${SETTING_KEY}:${tenantId}`, tenantId },
      select: { value: true },
    }),
    prisma.setting.findFirst({
      where: { tenantId, key: "crm.digestDaily" },
      select: { value: true },
    }),
    prisma.setting.findFirst({
      where: { tenantId, key: "relevo_config" },
      select: { value: true },
    }),
  ]);

  const cfg = parseSlackDigestConfig(row?.value ?? null);

  // Compat: si el JSON aún no se guardó, respetar los settings legacy.
  if (!row?.value) {
    if (legacyDaily?.value === "true") cfg.comercialDaily = true;
    if (legacyDaily?.value === "false") cfg.comercialDaily = false;
    const relevoEnabled = parseRelevoEnabled(relevoRow?.value);
    if (relevoEnabled !== null) cfg.relevo = relevoEnabled;
  }

  cache.set(tenantId, { value: cfg, expires: Date.now() + CACHE_TTL_MS });
  return cfg;
}

export async function setSlackDigestConfig(
  tenantId: string,
  partial: Partial<SlackDigestConfig>,
): Promise<SlackDigestConfig> {
  const current = await getSlackDigestConfig(tenantId);
  const next: SlackDigestConfig = {
    comercialWeekly: boolOr(partial.comercialWeekly, current.comercialWeekly),
    comercialDaily: boolOr(partial.comercialDaily, current.comercialDaily),
    rondas: boolOr(partial.rondas, current.rondas),
    docs: boolOr(partial.docs, current.docs),
    agenda: boolOr(partial.agenda, current.agenda),
    relevo: boolOr(partial.relevo, current.relevo),
    sla: boolOr(partial.sla, current.sla),
  };

  const key = `${SETTING_KEY}:${tenantId}`;
  const value = JSON.stringify(next);
  const existing = await prisma.setting.findFirst({ where: { key, tenantId }, select: { id: true } });
  if (existing) {
    await prisma.setting.update({ where: { id: existing.id }, data: { value, type: "json", category: "slack" } });
  } else {
    await prisma.setting.create({
      data: { key, value, type: "json", category: "slack", tenantId },
    });
  }

  // Mantener legacy en sync para crons/herramientas que aún lo lean directo.
  if (partial.comercialDaily !== undefined) {
    await upsertSetting(tenantId, "crm.digestDaily", String(next.comercialDaily), "boolean", "crm");
  }
  if (partial.relevo !== undefined) {
    await upsertRelevoEnabled(tenantId, next.relevo);
  }

  invalidateSlackDigestConfig(tenantId);
  return next;
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function parseRelevoEnabled(raw: string | null | undefined): boolean | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as { enabled?: unknown };
    if (typeof parsed.enabled === "boolean") return parsed.enabled;
    return null;
  } catch {
    return null;
  }
}

async function upsertSetting(
  tenantId: string,
  key: string,
  value: string,
  type: string,
  category: string,
): Promise<void> {
  const existing = await prisma.setting.findFirst({ where: { tenantId, key }, select: { id: true } });
  if (existing) {
    await prisma.setting.update({ where: { id: existing.id }, data: { value, type, category } });
  } else {
    await prisma.setting.create({ data: { tenantId, key, value, type, category } });
  }
}

async function upsertRelevoEnabled(tenantId: string, enabled: boolean): Promise<void> {
  const existing = await prisma.setting.findFirst({
    where: { tenantId, key: "relevo_config" },
    select: { id: true, value: true },
  });
  let nextValue = JSON.stringify({ anticipacionMin: 60, enabled });
  if (existing?.value) {
    try {
      const parsed = JSON.parse(existing.value) as Record<string, unknown>;
      nextValue = JSON.stringify({ ...parsed, enabled });
    } catch {
      // keep default shape
    }
  }
  if (existing) {
    await prisma.setting.update({
      where: { id: existing.id },
      data: { value: nextValue, type: "json", category: "ops" },
    });
  } else {
    await prisma.setting.create({
      data: { tenantId, key: "relevo_config", value: nextValue, type: "json", category: "ops" },
    });
  }
}
