import { prisma } from "@/lib/prisma";

/** Default speed threshold in km/h — used by anomaly detection and trust scoring */
export const DEFAULT_SPEED_THRESHOLD_KMH = 15;

const SETTING_KEY = "rondas_ia_config";
const SETTING_CATEGORY = "ops";

export interface AlertConfig {
  staticGuardMinutes: number;
  staticGuardEnabled: boolean;
  speedAnomalyKmh: number;
  speedAnomalyEnabled: boolean;
  roundNotStartedMinutes: number;
  roundNotStartedEnabled: boolean;
  checkpointSkippedEnabled: boolean;
  routeDeviationMultiplier: number;
  routeDeviationEnabled: boolean;
}

export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  staticGuardMinutes: 5,
  staticGuardEnabled: true,
  speedAnomalyKmh: 15,
  speedAnomalyEnabled: true,
  roundNotStartedMinutes: 10,
  roundNotStartedEnabled: true,
  checkpointSkippedEnabled: true,
  routeDeviationMultiplier: 2,
  routeDeviationEnabled: true,
};

function settingKey(tenantId: string) {
  return `${SETTING_KEY}_${tenantId}`;
}

export async function getAlertConfig(tenantId: string): Promise<AlertConfig> {
  try {
    const setting = await prisma.setting.findFirst({
      where: { key: settingKey(tenantId) },
    });

    if (!setting) return { ...DEFAULT_ALERT_CONFIG };

    const parsed = JSON.parse(setting.value);
    return {
      staticGuardMinutes: parsed.staticGuardMinutes ?? DEFAULT_ALERT_CONFIG.staticGuardMinutes,
      staticGuardEnabled: parsed.staticGuardEnabled ?? DEFAULT_ALERT_CONFIG.staticGuardEnabled,
      speedAnomalyKmh: parsed.speedAnomalyKmh ?? DEFAULT_ALERT_CONFIG.speedAnomalyKmh,
      speedAnomalyEnabled: parsed.speedAnomalyEnabled ?? DEFAULT_ALERT_CONFIG.speedAnomalyEnabled,
      roundNotStartedMinutes: parsed.roundNotStartedMinutes ?? DEFAULT_ALERT_CONFIG.roundNotStartedMinutes,
      roundNotStartedEnabled: parsed.roundNotStartedEnabled ?? DEFAULT_ALERT_CONFIG.roundNotStartedEnabled,
      checkpointSkippedEnabled: parsed.checkpointSkippedEnabled ?? DEFAULT_ALERT_CONFIG.checkpointSkippedEnabled,
      routeDeviationMultiplier: parsed.routeDeviationMultiplier ?? DEFAULT_ALERT_CONFIG.routeDeviationMultiplier,
      routeDeviationEnabled: parsed.routeDeviationEnabled ?? DEFAULT_ALERT_CONFIG.routeDeviationEnabled,
    };
  } catch {
    return { ...DEFAULT_ALERT_CONFIG };
  }
}

export async function saveAlertConfig(tenantId: string, config: AlertConfig): Promise<void> {
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
      data: {
        key,
        value,
        type: "json",
        category: SETTING_CATEGORY,
        tenantId,
      },
    });
  }
}
