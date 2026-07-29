export type CorreoSwipeSide = "right" | "left";

/** Ancho fijo de cada botón de acción (estilo Apple Mail / Gmail iOS). */
export const SWIPE_BUTTON_WIDTH = 78;
/** Ancho de apertura con 2 botones visibles. */
export const SWIPE_OPEN_WIDTH = SWIPE_BUTTON_WIDTH * 2; // 156
/** Fracción de OPEN_WIDTH para snap abierto (requiere tap explícito). */
export const SWIPE_SNAP_RATIO = 0.5;
/** Rubber-band: pasado el ancho de botones, el arrastre extra se amortigua. */
export const SWIPE_RUBBER_BAND = 0.25;
/** Histéresis (px) para rearmar hápticas al cruzar umbrales. */
export const SWIPE_HAPTIC_HYSTERESIS = 16;
/** Ventana (ms) para suprimir el click sintético post-arrastre. */
export const SUPPRESS_CLICK_MS = 280;
/** Desplazamiento mínimo (px) para considerar que el gesto se movió de verdad. */
export const SWIPE_DRAG_CONFIRM_PX = 4;

export type SwipeReleaseOutcome =
  | { type: "close" }
  | { type: "snap"; side: CorreoSwipeSide };

/** Desplazamiento visual con rubber-band pasado el ancho de botones. */
export function toVisualDx(rawDx: number): number {
  const absRaw = Math.abs(rawDx);
  if (absRaw <= SWIPE_OPEN_WIDTH) return rawDx;
  return (
    Math.sign(rawDx) *
    (SWIPE_OPEN_WIDTH + (absRaw - SWIPE_OPEN_WIDTH) * SWIPE_RUBBER_BAND)
  );
}

export function isSwipeOpenReached(absRaw: number): boolean {
  return absRaw >= SWIPE_OPEN_WIDTH;
}

/**
 * Resuelve qué hacer al soltar el gesto.
 * - snap: fija los 2 botones visibles; requiere tap explícito para ejecutar
 * - close: vuelve a reposo
 *
 * Nunca ejecuta una acción al soltar (ni por umbral profundo ni por flick).
 */
export function resolveSwipeRelease(params: {
  value: number;
  /** Conservado por compatibilidad de firma; el umbral es fijo a OPEN_WIDTH. */
  rowWidth: number;
  /** Conservado por compatibilidad; el flick ya no ejecuta acciones. */
  velocityX: number;
}): SwipeReleaseOutcome {
  void params.rowWidth;
  void params.velocityX;
  const abs = Math.abs(params.value);
  const side: CorreoSwipeSide = params.value > 0 ? "right" : "left";

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
