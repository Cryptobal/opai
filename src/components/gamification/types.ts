/* ─── Gamificacion: Shared Frontend Types & Constants ─── */

// ────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────

export type DimensionScore = {
  dimension: string;
  label: string;
  score: number; // 0-100
  peso: number; // weight
  color: string;
};

export type GuardiaScorecard = {
  guardiaId: string;
  nombre: string;
  trustScore: number;
  nivel: string;
  puntosMes: number;
  rachaActual: number;
  rankingInstalacion: number;
  totalGuardiasInstalacion: number;
  percentil: number;
  tendenciaMesAnterior: number;
  dimensiones: DimensionScore[];
};

export type BadgeData = {
  id: string;
  nombre: string;
  descripcion: string;
  categoria: string;
  icono: string;
  puntosBonus: number;
  secreto: boolean;
  ganado: boolean;
  fechaDesbloqueo?: string;
  progreso?: number; // 0-100
};

export type PointEvent = {
  id: string;
  fecha: string;
  tipo: string;
  dimension: string;
  dimensionLabel: string;
  descripcion: string;
  puntos: number;
};

export type RankingEntry = {
  posicion: number;
  nombre?: string;
  anonimo?: boolean;
  trustScore: number;
  puntosMes: number;
  nivel: string;
  rachaActual: number;
  tendencia: "up" | "down" | "neutral";
  esYo?: boolean;
};

export type DesafioData = {
  id: string;
  nombre: string;
  descripcion: string;
  tipo: string;
  fechaInicio: string;
  fechaFin: string;
  recompensaPuntos: number;
  badgeRecompensaId?: string;
  progresoPersonal?: number;
  completado?: boolean;
  participantes?: number;
  completados?: number;
};

export type BeneficioData = {
  id: string;
  nombre: string;
  descripcion: string;
  categoria: string;
  costoPuntos: number;
  proveedor: string;
  disponible: boolean;
  imagen?: string;
};

export type FeedItem = {
  id: string;
  tipo: "badge" | "reconocimiento" | "desafio" | "canje";
  texto: string;
  fecha: string;
  icono?: string;
};

export type TrendPoint = {
  mes: string;
  label: string;
  trustScore: number;
};

// ────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────

export const DIMENSION_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string }
> = {
  rondas: { label: "Rondas", color: "text-status-info-fg", bgColor: "bg-status-info" },
  asistencia: {
    label: "Asistencia",
    color: "text-status-info-fg",
    bgColor: "bg-cyan-500",
  },
  sistema_digital: {
    label: "Sistema Digital",
    color: "text-purple-500",
    bgColor: "bg-purple-500",
  },
  supervision: {
    label: "Supervisión",
    color: "text-status-warn-fg",
    bgColor: "bg-status-warn",
  },
  capacitacion: {
    label: "Capacitación",
    color: "text-status-warn-fg",
    bgColor: "bg-status-warn",
  },
  social: { label: "Social", color: "text-pink-500", bgColor: "bg-pink-500" },
  bonus: { label: "Bonus", color: "text-status-warn-fg", bgColor: "bg-status-warn" },
};

export const NIVEL_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string }
> = {
  centinela: {
    label: "Centinela",
    color: "text-status-warn-fg",
    bgColor: "bg-status-warn",
  },
  vigia: {
    label: "Vigía",
    color: "text-slate-400",
    bgColor: "bg-slate-500",
  },
  guardian: {
    label: "Guardián",
    color: "text-status-warn-fg",
    bgColor: "bg-status-warn",
  },
  protector: {
    label: "Protector",
    color: "text-status-info-fg",
    bgColor: "bg-cyan-500",
  },
  comandante: {
    label: "Comandante",
    color: "text-status-info-fg",
    bgColor: "bg-status-info",
  },
};

// ────────────────────────────────────────────────────────
// Helper functions
// ────────────────────────────────────────────────────────

/** Tailwind text-color class based on score thresholds */
export function getTrustScoreColor(score: number): string {
  if (score >= 85) return "text-status-info-fg";
  if (score >= 70) return "text-status-warn-fg";
  if (score >= 50) return "text-status-warn-fg";
  return "text-status-danger-fg";
}

/** Hex stroke color for SVG/chart elements */
export function getTrustScoreStrokeColor(score: number): string {
  if (score >= 85) return "#14b8a6";
  if (score >= 70) return "#eab308";
  if (score >= 50) return "#f97316";
  return "#ef4444";
}

/** Tailwind bg-color class with opacity based on score */
export function getTrustScoreBgColor(score: number): string {
  if (score >= 85) return "bg-status-info-soft";
  if (score >= 70) return "bg-status-warn-soft";
  if (score >= 50) return "bg-orange-500/15";
  return "bg-status-danger-soft";
}
