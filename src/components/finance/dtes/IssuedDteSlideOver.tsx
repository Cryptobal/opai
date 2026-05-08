"use client";

import { IssuedDteDetailDialog } from "../IssuedDteDetailDialog";

interface Props {
  open: boolean;
  onClose: () => void;
  dteId: string | null;
  canManage: boolean;
  onEmitCreditNote?: (dteId: string) => void;
  onEmitDebitNote?: (dteId: string) => void;
}

/**
 * Slide-over de detalle del DTE emitido. Wrapper sobre `IssuedDteDetailDialog`
 * con presentation="sheet" — render desde la derecha en desktop, desde
 * abajo (con drag handle) en mobile.
 *
 * Reusa toda la lógica del dialog tradicional (fetch del DTE, acciones,
 * timeline de email, modals auxiliares) sin duplicar código.
 */
export function IssuedDteSlideOver(props: Props) {
  return <IssuedDteDetailDialog {...props} presentation="sheet" />;
}
