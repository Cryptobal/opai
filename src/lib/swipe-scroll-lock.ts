/**
 * Lock global de scroll vertical mientras un gesto horizontal (swipe de fila)
 * está activo. Evita que el documento / pull-to-refresh compitan con el arrastre.
 */

let lockCount = 0;
let priorOverflow = "";
let priorOverscroll = "";
let touchMoveBound: ((e: TouchEvent) => void) | null = null;

function onTouchMove(e: TouchEvent) {
  if (e.cancelable) e.preventDefault();
}

export function lockSwipeScroll(): void {
  if (typeof document === "undefined") return;
  lockCount += 1;
  if (lockCount > 1) return;

  const root = document.documentElement;
  priorOverflow = document.body.style.overflow;
  priorOverscroll = root.style.overscrollBehavior;
  document.body.style.overflow = "hidden";
  root.style.overscrollBehavior = "none";
  root.dataset.opaiSwipeLock = "1";

  touchMoveBound = onTouchMove;
  document.addEventListener("touchmove", touchMoveBound, { passive: false });
}

export function unlockSwipeScroll(): void {
  if (typeof document === "undefined") return;
  if (lockCount === 0) return;
  lockCount -= 1;
  if (lockCount > 0) return;

  document.body.style.overflow = priorOverflow;
  document.documentElement.style.overscrollBehavior = priorOverscroll;
  delete document.documentElement.dataset.opaiSwipeLock;
  if (touchMoveBound) {
    document.removeEventListener("touchmove", touchMoveBound);
    touchMoveBound = null;
  }
}

export function isSwipeScrollLocked(): boolean {
  return lockCount > 0;
}
