/**
 * Configuración global de plataforma (key-value).
 * Cache en memoria 5 min — no depende de RSC. Defaults en código para no
 * exigir seed: la migración de datos siembra los mismos valores.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const PLATFORM_SETTING_DEFAULTS = {
  "lifecycle.enabled": false,
  "lifecycle.emailsEnabled": false,
  "lifecycle.exemptSlugs": ["gard"],
  "trial.defaultDays": 30,
  "trial.graceDays": 7,
  "trial.reminderDays": [7, 3, 1, 0],
  "pastDue.graceDays": 15,
  "suspended.marcacionGraceDays": 30,
  "signup.defaultPlan": "profesional",
} as const;

export type PlatformSettingKey = keyof typeof PLATFORM_SETTING_DEFAULTS;

export interface LifecycleSettings {
  enabled: boolean;
  emailsEnabled: boolean;
  exemptSlugs: string[];
  trialDefaultDays: number;
  trialGraceDays: number;
  trialReminderDays: number[];
  pastDueGraceDays: number;
  suspendedMarcacionGraceDays: number;
  signupDefaultPlan: string;
}

const TTL_MS = 5 * 60 * 1000;

let cache: { expiresAt: number; rows: Map<string, unknown> } | null = null;

export function invalidatePlatformSettingsCache(): void {
  cache = null;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return fallback;
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
    return value.map((v) => v.trim()).filter(Boolean);
  }
  return fallback;
}

function asNumberArray(value: unknown, fallback: number[]): number[] {
  if (Array.isArray(value) && value.every((v) => typeof v === "number" && Number.isFinite(v))) {
    return value;
  }
  return fallback;
}

function asString(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback;
}

async function loadRows(): Promise<Map<string, unknown>> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.rows;
  try {
    const rows = await prisma.platformSetting.findMany();
    const map = new Map<string, unknown>();
    for (const row of rows) map.set(row.key, row.value);
    cache = { expiresAt: now + TTL_MS, rows: map };
    return map;
  } catch (error) {
    console.warn("[platform-settings] read failed, using defaults:", error);
    return cache?.rows ?? new Map();
  }
}

export async function getPlatformSetting<K extends PlatformSettingKey>(
  key: K,
): Promise<(typeof PLATFORM_SETTING_DEFAULTS)[K]> {
  const rows = await loadRows();
  const fallback = PLATFORM_SETTING_DEFAULTS[key];
  if (!rows.has(key)) return fallback;
  return rows.get(key) as (typeof PLATFORM_SETTING_DEFAULTS)[K];
}

export async function getLifecycleSettings(): Promise<LifecycleSettings> {
  const rows = await loadRows();
  const get = (key: PlatformSettingKey) =>
    rows.has(key) ? rows.get(key) : PLATFORM_SETTING_DEFAULTS[key];

  return {
    enabled: asBoolean(get("lifecycle.enabled"), PLATFORM_SETTING_DEFAULTS["lifecycle.enabled"]),
    emailsEnabled: asBoolean(
      get("lifecycle.emailsEnabled"),
      PLATFORM_SETTING_DEFAULTS["lifecycle.emailsEnabled"],
    ),
    exemptSlugs: asStringArray(
      get("lifecycle.exemptSlugs"),
      [...PLATFORM_SETTING_DEFAULTS["lifecycle.exemptSlugs"]],
    ),
    trialDefaultDays: asNumber(
      get("trial.defaultDays"),
      PLATFORM_SETTING_DEFAULTS["trial.defaultDays"],
    ),
    trialGraceDays: asNumber(get("trial.graceDays"), PLATFORM_SETTING_DEFAULTS["trial.graceDays"]),
    trialReminderDays: asNumberArray(
      get("trial.reminderDays"),
      [...PLATFORM_SETTING_DEFAULTS["trial.reminderDays"]],
    ),
    pastDueGraceDays: asNumber(
      get("pastDue.graceDays"),
      PLATFORM_SETTING_DEFAULTS["pastDue.graceDays"],
    ),
    suspendedMarcacionGraceDays: asNumber(
      get("suspended.marcacionGraceDays"),
      PLATFORM_SETTING_DEFAULTS["suspended.marcacionGraceDays"],
    ),
    signupDefaultPlan: asString(
      get("signup.defaultPlan"),
      PLATFORM_SETTING_DEFAULTS["signup.defaultPlan"],
    ),
  };
}

export async function getAllPlatformSettings(): Promise<Record<PlatformSettingKey, unknown>> {
  const rows = await loadRows();
  const out = {} as Record<PlatformSettingKey, unknown>;
  for (const key of Object.keys(PLATFORM_SETTING_DEFAULTS) as PlatformSettingKey[]) {
    out[key] = rows.has(key) ? rows.get(key) : PLATFORM_SETTING_DEFAULTS[key];
  }
  return out;
}

export function isPlatformSettingKey(key: string): key is PlatformSettingKey {
  return key in PLATFORM_SETTING_DEFAULTS;
}

export async function setPlatformSettings(
  updates: Partial<Record<PlatformSettingKey, unknown>>,
  updatedBy: string,
): Promise<Record<PlatformSettingKey, unknown>> {
  const keys = Object.keys(updates) as PlatformSettingKey[];
  if (keys.length) {
    await prisma.$transaction(
      keys.map((key) =>
        prisma.platformSetting.upsert({
          where: { key },
          create: { key, value: updates[key] as Prisma.InputJsonValue, updatedBy },
          update: { value: updates[key] as Prisma.InputJsonValue, updatedBy },
        }),
      ),
    );
  }
  invalidatePlatformSettingsCache();
  return getAllPlatformSettings();
}
