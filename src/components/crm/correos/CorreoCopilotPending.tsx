"use client";

import { AlertTriangle, Paperclip, Plus, Search } from "lucide-react";
import type { AccountSuggestion } from "./CorreoAccountSuggestionChips";

type Props = {
  noAccount: boolean;
  pendingAttachments: number;
  degraded: boolean;
  canEdit: boolean;
  suggestions: AccountSuggestion[];
  busyId: string | null;
  onAssociate: (id: string) => void;
  onOpenPanel: () => void;
};

/** Cards de pendientes del sheet Copiloto (cuenta / adjuntos / degradado). */
export function CorreoCopilotPending({
  noAccount,
  pendingAttachments,
  degraded,
  canEdit,
  suggestions,
  busyId,
  onAssociate,
  onOpenPanel,
}: Props) {
  return (
    <section className="space-y-2">
      <p className="text-[12px] font-medium uppercase tracking-wide text-ds-text-3">Pendientes</p>
      {noAccount && (
        <div className="space-y-2 rounded-xl border border-ds-border-subtle bg-ds-surface-1 p-3">
          <p className="text-[13px] font-semibold text-ds-text-1">Sin cuenta asociada</p>
          <p className="text-[12px] text-ds-text-3">Asociá el hilo a una cuenta del CRM.</p>
          {canEdit && (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.slice(0, 3).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  disabled={busyId != null}
                  title={s.reason}
                  onClick={() => onAssociate(s.id)}
                  className="inline-flex min-h-11 items-center gap-1 rounded-full border border-ds-border-default bg-ds-surface-1 px-3 text-[12px] text-ds-text-1 ds-tap disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5 text-ds-text-3" aria-hidden />
                  <span className="max-w-[140px] truncate">{s.name}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={onOpenPanel}
                className="inline-flex min-h-11 items-center gap-1 rounded-full border border-ds-border-default bg-ds-surface-1 px-3 text-[12px] text-ds-text-2 ds-tap"
              >
                <Search className="h-3.5 w-3.5" aria-hidden /> Otra cuenta
              </button>
            </div>
          )}
        </div>
      )}
      {pendingAttachments > 0 && (
        <div className="space-y-2 rounded-xl border border-ds-border-subtle bg-ds-surface-1 p-3">
          <p className="text-[13px] font-semibold text-ds-text-1">
            Adjuntos sin guardar{pendingAttachments > 1 ? ` (${pendingAttachments})` : ""}
          </p>
          <p className="text-[12px] text-ds-text-3">Guardalos en OPAI para no perderlos.</p>
          {canEdit && (
            <button
              type="button"
              onClick={onOpenPanel}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-status-warn-border bg-status-warn-soft px-3 text-[12px] text-status-warn-fg ds-tap"
            >
              <Paperclip className="h-3.5 w-3.5" aria-hidden /> Guardar adjunto
            </button>
          )}
        </div>
      )}
      {degraded && (
        <div className="flex items-start gap-2 rounded-xl border border-status-warn-border bg-status-warn-soft p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-warn-fg" aria-hidden />
          <div>
            <p className="text-[13px] font-semibold text-status-warn-fg">Adjuntos no cargados</p>
            <p className="text-[12px] text-status-warn-fg/90">
              No se pudieron cargar desde Gmail. Reintentá en unos segundos.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
