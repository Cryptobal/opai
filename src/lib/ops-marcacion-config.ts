export interface MarcacionConfig {
  toleranciaAtrasoMinutos: number;
  rotacionCodigoHoras: number;
  plazoOposicionHoras: number;
  emailComprobanteDigitalEnabled: boolean;
  emailAvisoMarcaManualEnabled: boolean;
  emailAlertaFueraRangoEnabled: boolean;
  emailAlertaFueraRangoIncludeSupervisors: boolean;
  emailAlertaFueraRangoUserIds: string[];
  emailDelayManualMinutos: number;
  clausulaLegal: string;
  radioGlobalMarcacionEnabled: boolean;
  radioGlobalMarcacionM: number;
  rondasPollingSegundos: number;
  rondasVentanaInicioAntesMin: number;
  rondasVentanaInicioDespuesMin: number;
  rondasRequiereFotoEvidencia: boolean;
  rondasPermiteReemplazo: boolean;
}

const MIN_MARCACION_RADIUS_M = 10;
const MAX_MARCACION_RADIUS_M = 1000;
const DEFAULT_MARCACION_RADIUS_M = 1000;

export const DEFAULT_MARCACION_CONFIG: MarcacionConfig = {
  toleranciaAtrasoMinutos: 15,
  rotacionCodigoHoras: 0,
  plazoOposicionHoras: 48,
  emailComprobanteDigitalEnabled: true,
  emailAvisoMarcaManualEnabled: true,
  emailAlertaFueraRangoEnabled: true,
  emailAlertaFueraRangoIncludeSupervisors: true,
  emailAlertaFueraRangoUserIds: [],
  emailDelayManualMinutos: 0,
  clausulaLegal:
    'Si transcurridas las 48 horas de recibir esta notificación usted no se hubiera opuesto al nuevo ajuste, ésta será considerada válida para los efectos de cálculo de su jornada.',
  radioGlobalMarcacionEnabled: false,
  radioGlobalMarcacionM: DEFAULT_MARCACION_RADIUS_M,
  rondasPollingSegundos: 30,
  rondasVentanaInicioAntesMin: 60,
  rondasVentanaInicioDespuesMin: 120,
  rondasRequiereFotoEvidencia: false,
  rondasPermiteReemplazo: true,
};

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function booleanOrDefault(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function stringOrDefault(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

export function normalizeMarcacionConfig(raw: unknown): MarcacionConfig {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  return {
    toleranciaAtrasoMinutos: clampNumber(
      source.toleranciaAtrasoMinutos,
      DEFAULT_MARCACION_CONFIG.toleranciaAtrasoMinutos,
      0,
      120,
    ),
    rotacionCodigoHoras: clampNumber(
      source.rotacionCodigoHoras,
      DEFAULT_MARCACION_CONFIG.rotacionCodigoHoras,
      0,
      720,
    ),
    plazoOposicionHoras: clampNumber(
      source.plazoOposicionHoras,
      DEFAULT_MARCACION_CONFIG.plazoOposicionHoras,
      12,
      168,
    ),
    emailComprobanteDigitalEnabled: booleanOrDefault(
      source.emailComprobanteDigitalEnabled,
      DEFAULT_MARCACION_CONFIG.emailComprobanteDigitalEnabled,
    ),
    emailAvisoMarcaManualEnabled: booleanOrDefault(
      source.emailAvisoMarcaManualEnabled,
      DEFAULT_MARCACION_CONFIG.emailAvisoMarcaManualEnabled,
    ),
    emailAlertaFueraRangoEnabled: booleanOrDefault(
      source.emailAlertaFueraRangoEnabled,
      DEFAULT_MARCACION_CONFIG.emailAlertaFueraRangoEnabled,
    ),
    emailAlertaFueraRangoIncludeSupervisors: booleanOrDefault(
      source.emailAlertaFueraRangoIncludeSupervisors,
      DEFAULT_MARCACION_CONFIG.emailAlertaFueraRangoIncludeSupervisors,
    ),
    emailAlertaFueraRangoUserIds: stringArray(source.emailAlertaFueraRangoUserIds),
    emailDelayManualMinutos: clampNumber(
      source.emailDelayManualMinutos,
      DEFAULT_MARCACION_CONFIG.emailDelayManualMinutos,
      0,
      1440,
    ),
    clausulaLegal: stringOrDefault(source.clausulaLegal, DEFAULT_MARCACION_CONFIG.clausulaLegal),
    radioGlobalMarcacionEnabled: booleanOrDefault(
      source.radioGlobalMarcacionEnabled,
      DEFAULT_MARCACION_CONFIG.radioGlobalMarcacionEnabled,
    ),
    radioGlobalMarcacionM: clampNumber(
      source.radioGlobalMarcacionM,
      DEFAULT_MARCACION_CONFIG.radioGlobalMarcacionM,
      MIN_MARCACION_RADIUS_M,
      MAX_MARCACION_RADIUS_M,
    ),
    rondasPollingSegundos: clampNumber(
      source.rondasPollingSegundos,
      DEFAULT_MARCACION_CONFIG.rondasPollingSegundos,
      10,
      120,
    ),
    rondasVentanaInicioAntesMin: clampNumber(
      source.rondasVentanaInicioAntesMin,
      DEFAULT_MARCACION_CONFIG.rondasVentanaInicioAntesMin,
      0,
      360,
    ),
    rondasVentanaInicioDespuesMin: clampNumber(
      source.rondasVentanaInicioDespuesMin,
      DEFAULT_MARCACION_CONFIG.rondasVentanaInicioDespuesMin,
      0,
      360,
    ),
    rondasRequiereFotoEvidencia: booleanOrDefault(
      source.rondasRequiereFotoEvidencia,
      DEFAULT_MARCACION_CONFIG.rondasRequiereFotoEvidencia,
    ),
    rondasPermiteReemplazo: booleanOrDefault(
      source.rondasPermiteReemplazo,
      DEFAULT_MARCACION_CONFIG.rondasPermiteReemplazo,
    ),
  };
}

export function parseMarcacionConfigValue(value: string | null | undefined): MarcacionConfig {
  if (!value) return { ...DEFAULT_MARCACION_CONFIG };

  try {
    return normalizeMarcacionConfig(JSON.parse(value));
  } catch {
    return { ...DEFAULT_MARCACION_CONFIG };
  }
}

export function resolveMarcacionGeoRadiusM(
  config: Pick<MarcacionConfig, "radioGlobalMarcacionEnabled" | "radioGlobalMarcacionM"> | null | undefined,
  installationGeoRadiusM: number | null | undefined,
) {
  if (config?.radioGlobalMarcacionEnabled) {
    return clampNumber(
      config.radioGlobalMarcacionM,
      DEFAULT_MARCACION_RADIUS_M,
      MIN_MARCACION_RADIUS_M,
      MAX_MARCACION_RADIUS_M,
    );
  }

  return clampNumber(
    installationGeoRadiusM,
    DEFAULT_MARCACION_RADIUS_M,
    MIN_MARCACION_RADIUS_M,
    MAX_MARCACION_RADIUS_M,
  );
}
