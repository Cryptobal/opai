import { prisma } from "@/lib/prisma";

export interface AtsChannelCfg {
  enabled: boolean;
  label: string;
  tipo: "automatico" | "feed" | "manual_link" | "partner_api";
  /** For manual_link channels — URL where user published the job */
  externalUrl?: string;
  /** For feed channels — auto-generated, read-only */
  feedUrl?: string;
  /** Notes */
  notas?: string;
}

export interface AtsMatchConfig {
  pesoOS10: number;
  pesoDistancia: number;
  pesoDisponibilidad: number;
  pesoExperiencia: number;
  pesoRenta: number;
  pesoEvaluacion: number;
  radioMaxKm: number;
  habilitado: boolean;
  mostrarScoreAlGuardia: boolean;
  filtrosObligatorios: string[];
  notificarBaseInterna: boolean;
  canalesDefault: string[];
  autoPublicarAlActivar: boolean;
  expiracionDias: number;
  channelConfigs: Record<string, AtsChannelCfg>;
}

export const CHANNEL_DEFAULTS: Record<string, AtsChannelCfg> = {
  google_jobs: { enabled: true, label: "Google Jobs", tipo: "automatico" },
  base_opai: { enabled: true, label: "Base interna OPAI", tipo: "automatico" },
  indeed: { enabled: false, label: "Indeed", tipo: "feed" },
  computrabajo: { enabled: false, label: "Computrabajo", tipo: "manual_link" },
  bumeran: { enabled: false, label: "Bumeran", tipo: "manual_link" },
  talent: { enabled: false, label: "Talent.com", tipo: "feed" },
  yapo: { enabled: false, label: "Yapo", tipo: "manual_link" },
  laborum: { enabled: false, label: "Laborum", tipo: "manual_link" },
  linkedin: { enabled: false, label: "LinkedIn Jobs", tipo: "automatico" },
  bne: { enabled: false, label: "BNE (Bolsa Nacional de Empleo)", tipo: "partner_api" },
  jooble: { enabled: true, label: "Jooble", tipo: "feed" },
  jobrapido: { enabled: false, label: "Jobrapido", tipo: "feed" },
  postjobfree: { enabled: false, label: "PostJobFree", tipo: "feed" },
  whatjobs: { enabled: false, label: "WhatJobs", tipo: "automatico" },
  expertini: { enabled: false, label: "Expertini", tipo: "feed" },
  recruitnet: { enabled: false, label: "Recruit.net", tipo: "feed" },
  tiptopjob: { enabled: false, label: "TipTopJob", tipo: "feed" },
};

const DEFAULTS: AtsMatchConfig = {
  pesoOS10: 30,
  pesoDistancia: 20,
  pesoDisponibilidad: 20,
  pesoExperiencia: 15,
  pesoRenta: 10,
  pesoEvaluacion: 5,
  radioMaxKm: 30,
  habilitado: true,
  mostrarScoreAlGuardia: false,
  filtrosObligatorios: [],
  notificarBaseInterna: true,
  canalesDefault: ["google_jobs", "indeed", "computrabajo", "bumeran"],
  autoPublicarAlActivar: true,
  expiracionDias: 30,
  channelConfigs: CHANNEL_DEFAULTS,
};

const CONFIG_PREFIX = "ats_match";

let cache: { config: AtsMatchConfig; tenantId: string; expiresAt: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

export async function getAtsConfig(tenantId: string): Promise<AtsMatchConfig> {
  if (cache && cache.tenantId === tenantId && cache.expiresAt > Date.now()) {
    return cache.config;
  }

  const settings = await prisma.setting.findMany({
    where: {
      key: { startsWith: `${CONFIG_PREFIX}.` },
      OR: [{ tenantId }, { tenantId: null }],
    },
  });

  const config = { ...DEFAULTS };

  const byKey = new Map<string, string>();
  for (const s of settings) {
    if (s.tenantId === tenantId || !byKey.has(s.key)) {
      byKey.set(s.key, s.value);
    }
  }

  for (const [key, value] of byKey) {
    const field = key.replace(`${CONFIG_PREFIX}.`, "") as keyof AtsMatchConfig;
    if (field in config) {
      try {
        (config as Record<string, unknown>)[field] = JSON.parse(value);
      } catch {
        (config as Record<string, unknown>)[field] = value;
      }
    }
  }

  // Read channel config (single JSON blob).
  //
  // We deep-merge per channel: code-controlled fields (`tipo`, `label`) ALWAYS
  // win over what's stored in DB, so when we promote a channel from "feed" to
  // "partner_api" (e.g. BNE) every existing tenant picks up the new type
  // automatically without a data migration. Only user-editable fields
  // (`enabled`, `externalUrl`, `feedUrl`, `notas`) are taken from DB.
  const channelSetting = await prisma.setting.findFirst({
    where: { key: "ats_channels", tenantId },
  });
  const stored: Record<string, Partial<AtsChannelCfg>> = channelSetting
    ? JSON.parse(channelSetting.value)
    : {};
  const merged: Record<string, AtsChannelCfg> = {};
  for (const [key, def] of Object.entries(CHANNEL_DEFAULTS)) {
    const dbValue = stored[key] ?? {};
    merged[key] = {
      ...def,
      enabled: dbValue.enabled ?? def.enabled,
      externalUrl: dbValue.externalUrl ?? def.externalUrl,
      feedUrl: dbValue.feedUrl ?? def.feedUrl,
      notas: dbValue.notas ?? def.notas,
      // tipo & label intentionally NOT taken from DB.
    };
  }
  config.channelConfigs = merged;

  cache = { config, tenantId, expiresAt: Date.now() + CACHE_TTL };
  return config;
}

export function invalidateAtsCache() {
  cache = null;
}

export async function updateAtsConfig(
  tenantId: string,
  updates: Partial<AtsMatchConfig>,
): Promise<AtsMatchConfig> {
  for (const [key, value] of Object.entries(updates)) {
    const settingKey = `${CONFIG_PREFIX}.${key}`;
    const existing = await prisma.setting.findFirst({
      where: { key: settingKey, tenantId },
    });

    if (existing) {
      await prisma.setting.update({
        where: { id: existing.id },
        data: { value: JSON.stringify(value) },
      });
    } else {
      await prisma.setting.create({
        data: {
          key: settingKey,
          value: JSON.stringify(value),
          type: "json",
          category: "ats",
          tenantId,
        },
      });
    }
  }

  invalidateAtsCache();
  return getAtsConfig(tenantId);
}

export async function updateAtsChannelConfigs(
  tenantId: string,
  channels: Record<string, AtsChannelCfg>,
): Promise<void> {
  const existing = await prisma.setting.findFirst({
    where: { key: "ats_channels", tenantId },
  });
  const value = JSON.stringify(channels);
  if (existing) {
    await prisma.setting.update({ where: { id: existing.id }, data: { value } });
  } else {
    await prisma.setting.create({
      data: { key: "ats_channels", value, type: "json", category: "ats", tenantId },
    });
  }
  invalidateAtsCache();
}
