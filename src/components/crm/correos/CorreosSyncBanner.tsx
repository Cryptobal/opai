"use client";

import { OAuthResultBanner } from "@/components/configuracion/OAuthResultBanner";

/** Banner OAuth Gmail + progreso de importación inicial. */
export function CorreosSyncBanner({
  backfillDone,
  totalThreads,
  onConnected,
}: {
  backfillDone: boolean | null;
  totalThreads: number;
  onConnected?: () => void;
}) {
  return (
    <div className="space-y-2">
      <OAuthResultBanner
        param="gmail"
        startHref="/api/crm/gmail/connect"
        onConnected={onConnected}
      />
      {backfillDone === false && (
        <div className="rounded-xl border border-status-info-border bg-status-info-soft px-3 py-2.5 text-[13px] text-status-info-fg">
          Importación inicial en progreso ({totalThreads} hilos sincronizados hasta ahora).
          Podés seguir usando la bandeja; al terminar se actualizará sola.
        </div>
      )}
    </div>
  );
}
