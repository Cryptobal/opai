import { getFullAlertConfig, saveFullAlertConfig, toLegacyAlertConfig } from "./alert-config-service";

/** Default speed threshold in km/h — used by anomaly detection and trust scoring */
export const DEFAULT_SPEED_THRESHOLD_KMH = 15;

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

/** Read alert config (legacy shape — delegates to v2 service) */
export async function getAlertConfig(tenantId: string): Promise<AlertConfig> {
  const full = await getFullAlertConfig(tenantId);
  return toLegacyAlertConfig(full) as AlertConfig;
}

/** Save alert config (legacy shape — converts to v2 and saves) */
export async function saveAlertConfig(tenantId: string, config: AlertConfig): Promise<void> {
  const full = await getFullAlertConfig(tenantId);

  full.guardia_estatico.enabled = config.staticGuardEnabled;
  full.guardia_estatico.thresholds.staticGuardMinutes = config.staticGuardMinutes;
  full.velocidad_anomala.enabled = config.speedAnomalyEnabled;
  full.velocidad_anomala.thresholds.speedAnomalyKmh = config.speedAnomalyKmh;
  full.ronda_no_iniciada.enabled = config.roundNotStartedEnabled;
  full.ronda_no_iniciada.thresholds.roundNotStartedMinutes = config.roundNotStartedMinutes;
  full.checkpoint_saltado.enabled = config.checkpointSkippedEnabled;
  full.geo_fuera_rango.enabled = config.routeDeviationEnabled;
  full.geo_fuera_rango.thresholds.routeDeviationMultiplier = config.routeDeviationMultiplier;

  await saveFullAlertConfig(tenantId, full);
}
