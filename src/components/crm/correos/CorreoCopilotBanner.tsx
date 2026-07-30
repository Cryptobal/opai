"use client";

import { Paperclip, Plus, Search, Sparkles, X } from "lucide-react";
import type { CorreoDetail } from "@/modules/crm/email/correos.types";
import type { AccountSuggestion } from "./CorreoAccountSuggestionChips";
import { copilotoAttentionReasons } from "./correo-copiloto-reasons";

type Props = {
  detail: CorreoDetail;
  canEdit: boolean;
  suggestions: AccountSuggestion[];
  onAssociate: (accountId: string) => void;
  /** "Otra cuenta" → abre CorreoWorkPanel en contexto. */
  onOpenPanel: () => void;
  /** "Guardar adjunto" → abre el flujo de guardado (panel contexto). */
  onSaveAttachments: () => void;
  onDismiss: () => void;
};

/**
 * Banner de Copiloto (móvil `<lg`): reúne pendientes (sin cuenta, adjuntos sin
 * guardar, degradado) en un solo bloque con espacio real, en vez de competir
 * truncados en la fila de chips del escritorio. Descartable por sesión de hilo.
 */
export function CorreoCopilotBanner({
  detail,
  canEdit,
  suggestions,
  onAssociate,
  onOpenPanel,
  onSaveAttachments,
  onDismiss,
}: Props) {
  const reasons = copilotoAttentionReasons(detail);
  if (reasons.length === 0) return null;

  const t = detail.thread;
  const pendingAttachments = detail.attachments.filter((a) => !a.savedFileId).length;
  const count = reasons.length;
  const noAccount = t.accountId == null;

  return (
    <div className="rounded-2xl border border-tint-violet/30 bg-tint-violet/10 p-3 lg:hidden">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-tint-violet/20 text-tint-violet-fg">
          <Sparkles className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-tint-violet-fg">
            Copiloto · {count} {count === 1 ? "pendiente" : "pendientes"}
          </p>
          <p className="text-[12px] leading-snug text-ds-text-2">{reasons.join(" · ")}</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Descartar sugerencias de Copiloto"
          className="-m-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ds-text-3 ds-tap"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {canEdit && (
        <div className="mt-2 flex items-center gap-1.5 overflow-x-auto scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none]">
          {noAccount &&
            suggestions.slice(0, 3).map((s) => (
              <button
                key={s.id}
                type="button"
                title={s.reason}
                aria-label={`Asociar a ${s.name} — ${s.reason}`}
                onClick={() => onAssociate(s.id)}
                className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-ds-border-default bg-ds-surface-1 px-3 text-[12px] text-ds-text-1 ds-tap"
              >
                <Plus className="h-3.5 w-3.5 text-ds-text-3" aria-hidden />
                <span className="max-w-[160px] truncate">{s.name}</span>
                {s.confidence && (
                  <span className="rounded bg-ds-surface-2 px-1 text-[12px] text-ds-text-4">
                    {s.confidence}
                  </span>
                )}
              </button>
            ))}
          {noAccount && (
            <button
              type="button"
              onClick={onOpenPanel}
              className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-ds-border-default bg-ds-surface-1 px-3 text-[12px] text-ds-text-2 ds-tap"
            >
              <Search className="h-3.5 w-3.5" aria-hidden /> Otra cuenta
            </button>
          )}
          {pendingAttachments > 0 && (
            <button
              type="button"
              onClick={onSaveAttachments}
              className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-status-warn-border bg-status-warn-soft px-3 text-[12px] text-status-warn-fg ds-tap"
            >
              <Paperclip className="h-3.5 w-3.5" aria-hidden /> Guardar adjunto
              {pendingAttachments > 1 ? ` (${pendingAttachments})` : ""}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
