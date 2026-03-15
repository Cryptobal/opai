/**
 * Catalog of all alert types in the rondas monitoring system.
 * Source of truth for alert metadata, default severity, and configurable thresholds.
 */

export type AlertTypeCode =
  | "sin_movimiento"
  | "velocidad_anomala"
  | "bateria_baja"
  | "bateria_estatica"
  | "guardia_estatico"
  | "ronda_no_iniciada"
  | "panico";

export type AlertSeverity = "info" | "warning" | "critical";

export type AlertSource = "anomaly_inline" | "post_mark" | "scheduler" | "manual";

export interface ThresholdDef {
  key: string;
  label: string;
  unit: string;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
}

export interface AlertTypeDef {
  code: AlertTypeCode;
  label: string;
  description: string;
  defaultSeverity: AlertSeverity;
  source: AlertSource;
  /** Whether this alert can be enabled/disabled and have thresholds configured */
  configurable: boolean;
  /** Configurable numeric thresholds (absent = toggle-only) */
  thresholds?: ThresholdDef[];
}

export const ALERT_CATALOG: Record<AlertTypeCode, AlertTypeDef> = {
  sin_movimiento: {
    code: "sin_movimiento",
    label: "Sin movimiento",
    description: "Sensor de movimiento no detecta actividad física",
    defaultSeverity: "warning",
    source: "anomaly_inline",
    configurable: true,
    thresholds: [
      { key: "movementScoreMin", label: "Score mínimo", unit: "", defaultValue: 0.05, min: 0.01, max: 0.5, step: 0.01 },
    ],
  },
  velocidad_anomala: {
    code: "velocidad_anomala",
    label: "Velocidad anómala",
    description: "Velocidad entre checkpoints supera el umbral configurado",
    defaultSeverity: "warning",
    source: "anomaly_inline",
    configurable: true,
    thresholds: [
      { key: "speedAnomalyKmh", label: "Velocidad máxima", unit: "km/h", defaultValue: 15, min: 5, max: 50, step: 1 },
    ],
  },
  bateria_baja: {
    code: "bateria_baja",
    label: "Batería baja",
    description: "Nivel de batería del dispositivo bajo el umbral",
    defaultSeverity: "warning",
    source: "anomaly_inline",
    configurable: true,
    thresholds: [
      { key: "batteryLowPercent", label: "Umbral batería", unit: "%", defaultValue: 10, min: 5, max: 30, step: 1 },
    ],
  },
  bateria_estatica: {
    code: "bateria_estatica",
    label: "Batería estática",
    description: "Nivel de batería sin cambio entre marcaciones (posible suplantación)",
    defaultSeverity: "info",
    source: "anomaly_inline",
    configurable: true,
    thresholds: [
      { key: "batteryStaticMinMinutes", label: "Minutos mínimos", unit: "min", defaultValue: 10, min: 5, max: 60, step: 1 },
    ],
  },
  guardia_estatico: {
    code: "guardia_estatico",
    label: "Guardia estático",
    description: "Sin movimiento significativo entre checkpoints por X minutos",
    defaultSeverity: "critical",
    source: "post_mark",
    configurable: true,
    thresholds: [
      { key: "staticGuardMinutes", label: "Minutos sin movimiento", unit: "min", defaultValue: 5, min: 2, max: 30, step: 1 },
    ],
  },
  ronda_no_iniciada: {
    code: "ronda_no_iniciada",
    label: "Ronda no iniciada",
    description: "Ronda programada no fue iniciada dentro del plazo de tolerancia",
    defaultSeverity: "critical",
    source: "scheduler",
    configurable: true,
    thresholds: [
      { key: "roundNotStartedMinutes", label: "Tolerancia", unit: "min", defaultValue: 10, min: 5, max: 60, step: 1 },
    ],
  },
  panico: {
    code: "panico",
    label: "Botón de pánico",
    description: "Guardia activó el botón de pánico desde el dispositivo",
    defaultSeverity: "critical",
    source: "manual",
    configurable: false,
  },
};

/** All alert type codes */
export const ALERT_TYPE_CODES = Object.keys(ALERT_CATALOG) as AlertTypeCode[];

/** Only alert types that can be configured (enabled/disabled + thresholds) */
export const CONFIGURABLE_ALERT_CODES = ALERT_TYPE_CODES.filter(
  (c) => ALERT_CATALOG[c].configurable,
);
