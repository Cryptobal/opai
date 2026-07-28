/**
 * Contador compartido: indica que un gesto horizontal de swipe de fila está
 * activo. `CorreosPullToRefresh` consulta `isSwipeScrollLocked()` para no
 * competir con el arrastre.
 *
 * Ya no muta el DOM (`body.overflow`, listeners globales): el eje lo resuelve
 * `dragDirectionLock` de framer-motion en cada fila.
 */

let lockCount = 0;

export function lockSwipeScroll(): void {
  lockCount += 1;
}

export function unlockSwipeScroll(): void {
  if (lockCount === 0) return;
  lockCount -= 1;
}

export function isSwipeScrollLocked(): boolean {
  return lockCount > 0;
}
