"use client";

import { OAuthResultBanner } from "@/components/configuracion/OAuthResultBanner";

/** Banner OAuth Gmail + progreso de importación inicial + sync aparcado. */
export function CorreosSyncBanner({
  backfillDone,
  totalThreads,
  syncParked = false,
  onConnected,
}: {
  backfillDone: boolean | null;
  totalThreads: number;
  /** true si el job de sync quedó aparcado en la DLQ (errores repetidos). */
  syncParked?: boolean;
  onConnected?: () => void;
}) {
  return (
    <div className="space-y-2">
      <OAuthResultBanner
        param="gmail"
        startHref="/api/crm/gmail/connect"
        onConnected={onConnected}
      />
      {syncParked && (
        <div className="rounded-xl border border-status-warn-border bg-status-warn-soft px-3 py-2.5 text-[13px] text-status-warn-fg">
          La sincronización de esta casilla está pausada por errores repetidos.
          Los correos nuevos pueden demorar; probá &quot;Sincronizar&quot; o
          reconectá la casilla si persiste.
        </div>
      )}
      {backfillDone === false && (
        <div className="rounded-xl border border-status-info-border bg-status-info-soft px-3 py-2.5 text-[13px] text-status-info-fg">
          Importación inicial en progreso ({totalThreads} hilos sincronizados hasta ahora).
          Podés seguir usando la bandeja; al terminar se actualizará sola.
        </div>
      )}
    </div>
  );
}
