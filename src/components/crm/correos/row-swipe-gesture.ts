export type CorreoSwipeSide = "right" | "left";

/** Ancho fijo de cada botón de acción (estilo Apple Mail / Gmail iOS). */
export const SWIPE_BUTTON_WIDTH = 78;
/** Ancho de apertura con 2 botones visibles. */
export const SWIPE_OPEN_WIDTH = SWIPE_BUTTON_WIDTH * 2; // 156
/** Fracción de OPEN_WIDTH para snap abierto (requiere tap explícito). */
export const SWIPE_SNAP_RATIO = 0.5;
/** Fracción del ancho de fila que dispara commit de la acción principal. */
export const SWIPE_COMMIT_RATIO = 0.45;
/** Velocidad mínima (px/s) hacia el lado del gesto para contar como flick. */
export const SWIPE_FLICK_VELOCITY = 1200;
/** Rubber-band: pasado el ancho de botones, el arrastre extra se amortigua. */
export const SWIPE_RUBBER_BAND = 0.25;
/** Histéresis (px) para rearmar hápticas al cruzar umbrales. */
export const SWIPE_HAPTIC_HYSTERESIS = 16;

export type SwipeReleaseOutcome =
  | { type: "close" }
  | { type: "snap"; side: CorreoSwipeSide }
  | { type: "commit"; side: CorreoSwipeSide };

/** Desplazamiento visual con rubber-band pasado el ancho de botones. */
export function toVisualDx(rawDx: number): number {
  const absRaw = Math.abs(rawDx);
  if (absRaw <= SWIPE_OPEN_WIDTH) return rawDx;
  return (
    Math.sign(rawDx) *
    (SWIPE_OPEN_WIDTH + (absRaw - SWIPE_OPEN_WIDTH) * SWIPE_RUBBER_BAND)
  );
}

export function swipeProgress(absRaw: number, rowWidth: number): number {
  const threshold = rowWidth * SWIPE_COMMIT_RATIO;
  if (threshold <= 0) return 0;
  return Math.min(1, absRaw / threshold);
}

export function isSwipeArmed(absRaw: number, rowWidth: number): boolean {
  return absRaw >= rowWidth * SWIPE_COMMIT_RATIO;
}

export function isSwipeOpenReached(absRaw: number): boolean {
  return absRaw >= SWIPE_OPEN_WIDTH;
}

/**
 * Flick válido solo si hay velocidad suficiente Y el desplazamiento ya alcanzó
 * la apertura completa de botones. Evita commits espurios por timestamps
 * coalescidos de WebKit (dt≈1ms → velocidad artificialmente alta).
 */
export function isSwipeFlick(
  side: CorreoSwipeSide,
  absRaw: number,
  velocityX: number,
): boolean {
  const sameDirection = side === "right" ? velocityX : -velocityX;
  return sameDirection >= SWIPE_FLICK_VELOCITY && absRaw >= SWIPE_OPEN_WIDTH;
}

/**
 * Resuelve qué hacer al soltar el gesto.
 * - commit: acción principal automática (umbral de fila o flick válido)
 * - snap: fija los 2 botones visibles; requiere tap explícito
 * - close: vuelve a reposo
 *
 * Nunca ejecuta una acción por debajo de SWIPE_OPEN_WIDTH.
 */
export function resolveSwipeRelease(params: {
  value: number;
  rowWidth: number;
  velocityX: number;
}): SwipeReleaseOutcome {
  const { value, rowWidth, velocityX } = params;
  const abs = Math.abs(value);
  const side: CorreoSwipeSide = value > 0 ? "right" : "left";
  const commitThreshold = rowWidth * SWIPE_COMMIT_RATIO;

  if (abs >= commitThreshold || isSwipeFlick(side, abs, velocityX)) {
    return { type: "commit", side };
  }

  if (abs >= SWIPE_OPEN_WIDTH * SWIPE_SNAP_RATIO) {
    return { type: "snap", side };
  }

  return { type: "close" };
}

export const SWIPE_SNAP_SPRING = {
  type: "spring" as const,
  stiffness: 480,
  damping: 38,
  mass: 0.85,
};

/** Transición lineal corta cuando el usuario prefiere reduced-motion. */
export const SWIPE_REDUCED_MOTION = {
  type: "tween" as const,
  duration: 0.12,
  ease: "linear" as const,
};
