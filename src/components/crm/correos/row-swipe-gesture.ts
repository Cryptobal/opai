export type CorreoSwipeSide = "right" | "left";

/** 2 botones de 74px por lado (estilo Apple Mail). */
export const SWIPE_OPEN_WIDTH = 148;
export const SWIPE_BUTTON_WIDTH = SWIPE_OPEN_WIDTH / 2;
/** Bajo este desplazamiento el gesto se considera tap/ruido y cierra. */
export const SWIPE_MIN_COMMIT = 36;
/** Proporción del ancho de fila que dispara la acción principal del lado. */
export const SWIPE_LONG_RATIO = 0.42;
/** Velocidad mínima (px/s) hacia el lado del gesto para contar como flick. */
export const SWIPE_FLICK_VELOCITY = 850;
/** Desplazamiento mínimo para que un flick dispare la acción principal. */
export const SWIPE_FLICK_MIN_OFFSET = 72;
/** Rubber-band: pasado el ancho de botones, el arrastre extra se amortigua. */
export const SWIPE_RUBBER_BAND = 0.35;

export type SwipeReleaseOutcome =
  | { type: "close" }
  | { type: "snap"; side: CorreoSwipeSide }
  | { type: "long"; side: CorreoSwipeSide }
  | { type: "button"; side: CorreoSwipeSide; buttonIndex: 0 | 1 };

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
  const threshold = rowWidth * SWIPE_LONG_RATIO;
  if (threshold <= 0) return 0;
  return Math.min(1, absRaw / threshold);
}

export function isSwipeArmed(absRaw: number, rowWidth: number): boolean {
  return absRaw >= rowWidth * SWIPE_LONG_RATIO;
}

export function isSwipeFlick(
  side: CorreoSwipeSide,
  absRaw: number,
  velocityX: number,
): boolean {
  const sameDirection = side === "right" ? velocityX : -velocityX;
  return sameDirection >= SWIPE_FLICK_VELOCITY && absRaw >= SWIPE_FLICK_MIN_OFFSET;
}

/** Umbral de desplazamiento para háptica al revelar ambos botones (snap). */
export function shouldHapticSnapOpen(absRaw: number): boolean {
  return absRaw >= SWIPE_OPEN_WIDTH * 0.92;
}

/**
 * Resuelve qué hacer al soltar el gesto.
 * - long: acción principal (índice 0) automática
 * - button: acción del botón dominante sin tap extra
 * - snap: fija los 2 botones visibles
 * - close: vuelve a reposo
 */
export function resolveSwipeRelease(params: {
  value: number;
  rowWidth: number;
  velocityX: number;
}): SwipeReleaseOutcome {
  const { value, rowWidth, velocityX } = params;
  const abs = Math.abs(value);
  const side: CorreoSwipeSide = value > 0 ? "right" : "left";
  const longThreshold = rowWidth * SWIPE_LONG_RATIO;

  if (abs >= longThreshold || isSwipeFlick(side, abs, velocityX)) {
    return { type: "long", side };
  }

  if (abs < SWIPE_MIN_COMMIT) {
    return { type: "close" };
  }

  // Zona intermedia: ejecutar el botón dominante sin tap (estilo Spark/Gmail).
  if (abs >= SWIPE_BUTTON_WIDTH * 1.12) {
    const buttonIndex: 0 | 1 =
      abs >= SWIPE_BUTTON_WIDTH * 1.55
        ? 0
        : side === "right"
          ? 0
          : 1;
    return { type: "button", side, buttonIndex };
  }

  if (abs >= SWIPE_BUTTON_WIDTH * 0.82) {
    const buttonIndex: 0 | 1 = side === "right" ? 0 : 1;
    return { type: "button", side, buttonIndex };
  }

  return { type: "snap", side };
}

export const SWIPE_SNAP_SPRING = {
  type: "spring" as const,
  stiffness: 420,
  damping: 32,
  mass: 0.8,
};
