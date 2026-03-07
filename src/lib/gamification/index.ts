export { getGamificacionConfig, clearConfigCache, getNiveles, getNivelActual, getNextNivel } from "./config";
export { calcularTrustScoreCompuesto } from "./trust-score-calculator";
export { registrarEvento } from "./points-engine";
export { calcularRachaActual } from "./streak-tracker";
export { evaluarBadges } from "./badge-evaluator";
export { calcularRankings } from "./ranking-calculator";
export { generarSugerenciasBono } from "./bonus-generator";
export type {
  DimensionResult,
  TrustScoreCompuesto,
  EventoTipo,
  EventoDimension,
  NivelDefinition,
} from "./types";
