// OPAI DS v3 — shared token helpers (pure functions, no React)

export type Threshold = "ok" | "warn" | "danger" | "neutral";

export function thresholdFromScore(score: number | null | undefined): Threshold {
  if (score == null) return "neutral";
  if (score >= 80) return "ok";
  if (score >= 60) return "warn";
  return "danger";
}

/** Standardized icon sizes — ALWAYS use these, no arbitrary numbers. */
export const ICON_SIZE = {
  xs: 14,  // h-3.5 — solo metadata inline
  sm: 16,  // h-4   — botones sm, pills, badges
  md: 18,  // h-4.5 — botones default, list rows
  lg: 20,  // h-5   — list rows destacados, headers
  xl: 24,  // h-6   — IconBubble md
  "2xl": 32, // h-8 — IconBubble lg
} as const;

export type IconSize = keyof typeof ICON_SIZE;
