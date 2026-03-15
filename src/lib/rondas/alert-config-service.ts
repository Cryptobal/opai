/**
 * Per-alert-type configuration service.
 * Stores structured config in the Setting table (JSON), with automatic
 * migration from the legacy ia-config format.
 */

import { prisma } from "@/lib/prisma";
import {
  ALERT_CATALOG,
  ALERT_TYPE_CODES,
  type AlertTypeCode,
  type AlertSeverity,
} from "./alert-catalog";

// ── Types ──

export interface AlertTypeConfig {
  enabled: boolean;
  severity: AlertSeverity;
  thresholds: Record<string, number>;
}

export type FullAlertConfig = Record<AlertTypeCode, AlertTypeConfig>;

// ── Defaults ──

function buildDefaultFullConfig(): FullAlertConfig {
  const config = {} as FullAlertConfig;
  for (const code of ALERT_TYPE_CODES) {
    const def = ALERT_CATALOG[code];
    config[code] = {
      enabled: true,
      severity: def.defaultSeverity,
      thresholds: Object.fromEntries(
        (def.thresholds ?? []).map((t) => [t.key, t.defaultValue]),
      ),
    };
  }
  return config;
}

export const DEFAULT_FULL_CONFIG = buildDefaultFullConfig();

// ── Setting keys ──

const V2_KEY_PREFIX = "rondas_alert_config_v2";
const LEGACY_KEY_PREFIX = "rondas_ia_config";
const SETTING_CATEGORY = "ops";

function settingKey(tenantId: string) {
  return `${V2_KEY_PREFIX}_${tenantId}`;
}

// ── Read / Write ──

export async function getFullAlertConfig(tenantId: string): Promise<FullAlertConfig> {
  try {
    const setting = await prisma.setting.findFirst({
      where: { key: settingKey(tenantId) },
    });

    if (!setting) {
      return await migrateFromLegacy(tenantId);
    }

    const parsed = JSON.parse(setting.value);
    return mergeWithDefaults(parsed);
  } catch {
    return buildDefaultFullConfig();
  }
}

export async function saveFullAlertConfig(
  tenantId: string,
  config: FullAlertConfig,
): Promise<void> {
  const key = settingKey(tenantId);
  const value = JSON.stringify(config);

  const existing = await prisma.setting.findFirst({ where: { key } });

  if (existing) {
    await prisma.setting.update({
      where: { id: existing.id },
      data: { value },
    });
  } else {
    await prisma.setting.create({
      data: { key, value, type: "json", category: SETTING_CATEGORY, tenantId },
    });
  }
}

// ── Backward-compatible helper ──

/** Convert FullAlertConfig → legacy AlertConfig shape used by alert-engine / ia-config */
export function toLegacyAlertConfig(full: FullAlertConfig) {
  return {
    staticGuardMinutes: full.guardia_estatico?.thresholds?.staticGuardMinutes ?? 5,
    staticGuardEnabled: full.guardia_estatico?.enabled ?? true,
    speedAnomalyKmh: full.velocidad_anomala?.thresholds?.speedAnomalyKmh ?? 15,
    speedAnomalyEnabled: full.velocidad_anomala?.enabled ?? true,
    roundNotStartedMinutes: full.ronda_no_iniciada?.thresholds?.roundNotStartedMinutes ?? 10,
    roundNotStartedEnabled: full.ronda_no_iniciada?.enabled ?? true,
  };
}

// ── Internal helpers ──

function mergeWithDefaults(
  partial: Partial<Record<string, Partial<AlertTypeConfig>>>,
): FullAlertConfig {
  const result = buildDefaultFullConfig();
  for (const [code, config] of Object.entries(partial)) {
    if (config && code in result) {
      const typedCode = code as AlertTypeCode;
      result[typedCode] = {
        enabled: config.enabled ?? result[typedCode].enabled,
        severity: (config.severity ?? result[typedCode].severity) as AlertSeverity,
        thresholds: { ...result[typedCode].thresholds, ...(config.thresholds ?? {}) },
      };
    }
  }
  return result;
}

async function migrateFromLegacy(tenantId: string): Promise<FullAlertConfig> {
  try {
    const legacySetting = await prisma.setting.findFirst({
      where: { key: `${LEGACY_KEY_PREFIX}_${tenantId}` },
    });
    if (!legacySetting) return buildDefaultFullConfig();

    const legacy = JSON.parse(legacySetting.value);
    const config = buildDefaultFullConfig();

    if (legacy.staticGuardEnabled !== undefined)
      config.guardia_estatico.enabled = legacy.staticGuardEnabled;
    if (legacy.staticGuardMinutes !== undefined)
      config.guardia_estatico.thresholds.staticGuardMinutes = legacy.staticGuardMinutes;

    if (legacy.speedAnomalyEnabled !== undefined)
      config.velocidad_anomala.enabled = legacy.speedAnomalyEnabled;
    if (legacy.speedAnomalyKmh !== undefined)
      config.velocidad_anomala.thresholds.speedAnomalyKmh = legacy.speedAnomalyKmh;

    if (legacy.roundNotStartedEnabled !== undefined)
      config.ronda_no_iniciada.enabled = legacy.roundNotStartedEnabled;
    if (legacy.roundNotStartedMinutes !== undefined)
      config.ronda_no_iniciada.thresholds.roundNotStartedMinutes = legacy.roundNotStartedMinutes;

    return config;
  } catch {
    return buildDefaultFullConfig();
  }
}
