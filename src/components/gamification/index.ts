/* ─── Gamificacion: Barrel Export ─── */

// Types & constants
export type {
  DimensionScore,
  GuardiaScorecard,
  BadgeData,
  PointEvent,
  RankingEntry,
  DesafioData,
  BeneficioData,
  FeedItem,
  TrendPoint,
} from "./types";

export {
  DIMENSION_CONFIG,
  NIVEL_CONFIG,
  getTrustScoreColor,
  getTrustScoreStrokeColor,
  getTrustScoreBgColor,
} from "./types";

// Components
export { TrustScoreGauge } from "./TrustScoreGauge";
export { NivelBadge } from "./NivelBadge";
export { StreakCounter } from "./StreakCounter";
export { RankingPosition } from "./RankingPosition";
export { DimensionBreakdown } from "./DimensionBreakdown";
export { BadgeCard } from "./BadgeCard";
export { BadgeGrid } from "./BadgeGrid";
export { PointsHistory } from "./PointsHistory";
export { TrendChart } from "./TrendChart";
export { GuardiaDesempenoTab } from "./GuardiaDesempenoTab";
