"use client";

import { useState } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/opai-ds";
import { fmtClp, fmtShortDate } from "./format";
import type { CobranzaChannel } from "@/modules/finance/billing/cobranza-shared";
import { CobranzaSendDialog } from "@/components/finance/cobranza/CobranzaSendDialog";

export interface CarteraItem {
  dteId: string;
  folio: number | null;
  receiverName: string | null;
  issueDate: string;
  dueDate: string;
  overdueDays: number;
  pendingClp: number;
  anchoredWeek: string;
  anchoredWeekLabel: string;
  crmAccountId?: string | null;
  ceded?: boolean;
  cededPct?: number;
}

export interface OpenMoveWeek {
  weekStart: string;
  label: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CarteraItem[];
  openMoveWeeks: OpenMoveWeek[];
  canManage: boolean;
  onViewDte?: (dteId: string) => void;
  onMoved?: () => void;
}

type CobranzaTarget = {
  dteId: string;
  crmAccountId: string | null;
  daysOverdue: number;
  initialChannel?: CobranzaChannel;
};

/**
 * Drill del KPI "Por cobrar": listado de cartera ordenado por atraso,
 * con Mover a… / Ver F° / Enviar cobranza (Mail · WA · Ambos).
 */
export function CarteraPendienteSheet({
  open, onOpenChange, items, openMoveWeeks, canManage, onViewDte, onMoved,
}: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cobranzaTarget, setCobranzaTarget] = useState<CobranzaTarget | null>(null);

  const moveTo = async (dteId: string, weekStart: string) => {
    setBusyId(dteId);
    setError(null);
    try {
      const res = await fetch(`/api/finance/cashflow/dtes/${dteId}/move-cashflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newDate: weekStart }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error ?? "Error al mover");
      setMovingId(null);
      onMoved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusyId(null);
    }
  };

  const openCobranza = (item: CarteraItem, initialChannel?: CobranzaChannel) => {
    setCobranzaTarget({
      dteId: item.dteId,
      crmAccountId: item.crmAccountId ?? null,
      daysOverdue: item.overdueDays,
      initialChannel,
    });
  };

  const moving = movingId ? items.find((i) => i.dteId === movingId) : null;

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="gap-0 rounded-t-2xl p-0 max-h-[85vh] overflow-y-auto"
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-ds-border-default" aria-hidden />
        <SheetHeader className="px-5 pt-4 pb-3 text-left">
          <SheetTitle className="text-base text-ds-text-1">
            Cartera por cobrar
          </SheetTitle>
          <SheetDescription className="text-[13px] text-ds-text-3">
            {items.length === 0
              ? "Sin facturas pendientes"
              : `${items.length} factura${items.length === 1 ? "" : "s"} · ordenadas por atraso`}
          </SheetDescription>
        </SheetHeader>

        {error && (
          <p className="px-5 pb-2 text-[12px] text-status-danger-fg">{error}</p>
        )}

        {items.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-ds-text-4">No hay cartera pendiente.</p>
        ) : (
          <ul className="ds-list-cascade border-t border-ds-border-subtle">
            {items.map((d) => (
              <li
                key={d.dteId}
                className="border-b border-ds-border-subtle px-5 py-3 last:border-b-0"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-[14px] font-medium text-ds-text-1">
                    {d.folio != null ? `F°${d.folio}` : "Sin folio"}
                    {d.receiverName ? ` · ${d.receiverName}` : ""}
                  </span>
                  <span className="shrink-0 tabular-nums text-[13px] text-ds-text-1">
                    {fmtClp(d.pendingClp)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-ds-text-3">
                  <span>Emisión {fmtShortDate(d.issueDate)}</span>
                  <span>Vence {fmtShortDate(d.dueDate)}</span>
                  {d.ceded ? (
                    <span className="text-status-info-fg">
                      Cedida{d.cededPct != null ? ` ${d.cededPct}%` : ""}
                    </span>
                  ) : d.overdueDays > 0 ? (
                    <span className="text-status-warn-fg">
                      {d.overdueDays}d atraso
                    </span>
                  ) : (
                    <span className="text-status-ok-fg">Al día</span>
                  )}
                  <span>
                    Anclada {d.anchoredWeekLabel} · {fmtShortDate(d.anchoredWeek)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {canManage && openMoveWeeks.length > 0 && (
                    <button
                      type="button"
                      disabled={busyId === d.dteId}
                      onClick={() => setMovingId(d.dteId)}
                      className="min-h-10 rounded-full border border-ds-border-default bg-ds-surface-1 px-3 py-1.5 text-[12px] font-medium text-ds-text-1"
                    >
                      {busyId === d.dteId ? (
                        <span className="inline-flex items-center gap-1">
                          <Spinner size="sm" /> Moviendo…
                        </span>
                      ) : (
                        "Mover a…"
                      )}
                    </button>
                  )}
                  {canManage && !d.ceded && (
                    <>
                      <button
                        type="button"
                        onClick={() => openCobranza(d, "whatsapp")}
                        className="min-h-10 rounded-full border border-ds-border-default bg-ds-surface-1 px-3 py-1.5 text-[12px] font-medium text-ds-text-1"
                      >
                        WA
                      </button>
                      <button
                        type="button"
                        onClick={() => openCobranza(d, "email")}
                        className="min-h-10 rounded-full border border-ds-border-default bg-ds-surface-1 px-3 py-1.5 text-[12px] font-medium text-ds-text-1"
                      >
                        Mail
                      </button>
                      <button
                        type="button"
                        onClick={() => openCobranza(d, "both")}
                        className="min-h-10 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-[12px] font-medium text-primary"
                      >
                        Ambos
                      </button>
                    </>
                  )}
                  {onViewDte ? (
                    <button
                      type="button"
                      onClick={() => onViewDte(d.dteId)}
                      className="inline-flex min-h-10 items-center rounded-full border border-ds-border-default bg-ds-surface-1 px-3 py-1.5 text-[12px] font-medium text-ds-text-1"
                    >
                      Ver F°
                    </button>
                  ) : (
                    <a
                      href={`/finanzas/facturacion/dtes?dte=${d.dteId}`}
                      className="inline-flex min-h-10 items-center rounded-full border border-ds-border-default bg-ds-surface-1 px-3 py-1.5 text-[12px] font-medium text-ds-text-1"
                    >
                      Ver F°
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {moving && (
          <div
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Mover factura"
            onClick={() => setMovingId(null)}
          >
            <div
              className="opai-glass-strong w-full max-w-md rounded-t-2xl border border-ds-border-subtle bg-ds-surface-1 p-4 sm:rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="mb-1 text-[13px] font-medium text-ds-text-1">
                Mover {moving.folio != null ? `F°${moving.folio}` : "factura"} a…
              </p>
              <p className="mb-3 text-[12px] text-ds-text-3">
                Hoy anclada en {moving.anchoredWeekLabel}
              </p>
              <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
                {openMoveWeeks
                  .filter((w) => w.weekStart !== moving.anchoredWeek)
                  .map((w) => (
                    <li key={w.weekStart}>
                      <button
                        type="button"
                        disabled={busyId === moving.dteId}
                        onClick={() => void moveTo(moving.dteId, w.weekStart)}
                        className="flex min-h-11 w-full items-center justify-between rounded-xl border border-ds-border-subtle bg-ds-surface-2 px-3 py-2.5 text-left transition-colors hover:border-primary/40"
                      >
                        <span className="text-[13px] font-medium text-ds-text-1">
                          {w.label}
                        </span>
                        <span className="text-[12px] text-ds-text-3">
                          {fmtShortDate(w.weekStart)}
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
              <button
                type="button"
                onClick={() => setMovingId(null)}
                className="mt-3 min-h-10 w-full rounded-full text-[13px] text-ds-text-3"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>

    {cobranzaTarget && (
      <CobranzaSendDialog
        open={cobranzaTarget !== null}
        onClose={() => {
          setCobranzaTarget(null);
          onMoved?.();
        }}
        dteId={cobranzaTarget.dteId}
        crmAccountId={cobranzaTarget.crmAccountId}
        daysOverdue={cobranzaTarget.daysOverdue}
        initialChannel={cobranzaTarget.initialChannel}
      />
    )}
    </>
  );
}
