"use client";

import { OAuthResultBanner } from "@/components/configuracion/OAuthResultBanner";

/** Banner OAuth Gmail + progreso de importación inicial + sync aparcado. */
export function CorreosSyncBanner({
  backfillDone,
  totalThreads,
  syncParked = false,
  syncParkedReason = null,
  onConnected,
}: {
  backfillDone: boolean | null;
  totalThreads: number;
  /** true si el job de sync quedó aparcado en la DLQ (errores repetidos). */
  syncParked?: boolean;
  /** Motivo del último fallo (recortado) — diagnóstico accionable. */
  syncParkedReason?: string | null;
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              La sincronización de esta casilla está pausada por errores
              repetidos. Probá &quot;Sincronizar&quot; y, si persiste,
              reconectá la casilla.
            </span>
            <a
              href="/api/crm/gmail/connect"
              className="shrink-0 font-medium underline underline-offset-2"
            >
              Reconectar Gmail
            </a>
          </div>
          {syncParkedReason && (
            <p className="mt-1.5 break-all font-mono text-[12px] text-status-warn-fg/80">
              Último error: {syncParkedReason}
            </p>
          )}
        </div>
      )}
      {backfillDone === false && (
        <div className="rounded-xl border border-status-info-border bg-status-info-soft px-3 py-2.5 text-[13px] text-status-info-fg">
          Importación inicial en progreso ({totalThreads} hilos). Recibidos ya
          refleja tu bandeja de Gmail; el histórico se guarda en Archivados.
        </div>
      )}
    </div>
  );
}
