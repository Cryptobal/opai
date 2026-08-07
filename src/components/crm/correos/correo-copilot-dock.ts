import { useEffect, useState } from "react";

/** Ancho reservado a la derecha cuando Copiloto / Plan de acciones está abierto en desktop. */
export const CORREO_COPILOT_DOCK_WIDTH_VAR = "--correo-copilot-dock-width";

/** Media query: dock lateral solo en desktop fino (mouse). iPad/tablet → sheet cerrable. */
export const COPILOT_DOCK_DESKTOP_MQ = "(min-width: 1280px) and (hover: hover) and (pointer: fine)";

export function isCopilotDockDesktop(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(COPILOT_DOCK_DESKTOP_MQ).matches;
}

/** true = dock lateral persistente; false = bottom-sheet con scrim (móvil / iPad). */
export function useCopilotDockDesktop(): boolean {
  const [dock, setDock] = useState(isCopilotDockDesktop);
  useEffect(() => {
    const mq = window.matchMedia(COPILOT_DOCK_DESKTOP_MQ);
    const apply = () => setDock(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return dock;
}

/** Ancho fijo del dock Copiloto en desktop (px). */
export const CORREO_DOCK_WIDTH = 430;

/** Id del claim del dock Copiloto (CorreoWorkPanel). */
export const DOCK_CLAIM_COPILOT = "copilot";
/** Id del claim del dock Plan de acciones (CorreoAiActionPanel). */
export const DOCK_CLAIM_PLAN = "plan";

/**
 * El carril derecho es uno solo: Copiloto y Plan escriben la MISMA variable.
 * Viven en árboles distintos (Drawer vs. CorreosClient), así que el orden de
 * montaje/desmontaje de sus efectos no está garantizado y un `removeProperty`
 * del que se cierra puede pisar al que se acaba de abrir.
 *
 * Con claims el ancho lo define el último que reclamó y la var solo se borra
 * cuando no queda ninguno.
 */
const claims = new Map<string, number>();
const claimOrder: string[] = [];

function applyDockWidth(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const top = claimOrder[claimOrder.length - 1];
  const width = top != null ? claims.get(top) : undefined;
  if (width == null) {
    root.style.removeProperty(CORREO_COPILOT_DOCK_WIDTH_VAR);
    return;
  }
  root.style.setProperty(CORREO_COPILOT_DOCK_WIDTH_VAR, `${width}px`);
}

/** Reserva el carril para `id` con `width` px (last-claim-wins). */
export function claimDockWidth(id: string, width: number): void {
  claims.set(id, width);
  const at = claimOrder.indexOf(id);
  if (at >= 0) claimOrder.splice(at, 1);
  claimOrder.push(id);
  applyDockWidth();
}

/** Suelta el claim de `id`; el carril vuelve al claim previo (o se libera). */
export function releaseDockWidth(id: string): void {
  claims.delete(id);
  const at = claimOrder.indexOf(id);
  if (at >= 0) claimOrder.splice(at, 1);
  applyDockWidth();
}

/** Libera todos los claims de una (cerrar ambos docks sin esperar cleanups). */
export function resetDockWidthClaims(): void {
  claims.clear();
  claimOrder.length = 0;
  applyDockWidth();
}
