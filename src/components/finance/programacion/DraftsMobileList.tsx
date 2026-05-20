"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { FileText, Loader2, Send, RefreshCw, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Surface, EmptyState } from "@/components/opai-ds";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { fmtCLP } from "@/components/finance/dtes/shared/constants";
import { DocumentTag } from "@/components/finance/dtes/DocumentTag";
import { DocStatusIcon, OcReferenceChip } from "./SendStatusIcons";
import { DraftDetailSheet } from "./DraftDetailSheet";
import type { DraftListItem } from "@/modules/finance/billing/dte-draft.service";

interface Props {
  canIssue: boolean;
  canManage: boolean;
}

export function DraftsMobileList({ canIssue, canManage }: Props) {
  const [drafts, setDrafts] = useState<DraftListItem[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [openDetailId, setOpenDetailId] = useState<string | null>(null);
  const [issuing, setIssuing] = useState<string | null>(null);
  const [confirmingDraft, setConfirmingDraft] = useState<DraftListItem | null>(null);

  const loadDrafts = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/finance/billing/drafts?pageSize=100");
      const json = await res.json();
      if (json.success) setDrafts(json.data?.drafts ?? []);
      else {
        toast.error(json.error ?? "Error cargando borradores");
        setDrafts([]);
      }
    } catch {
      toast.error("Error de conexión");
      setDrafts([]);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDrafts();
  }, [loadDrafts]);

  const handleIssue = useCallback(
    async (id: string) => {
      if (!canIssue) return;
      setIssuing(id);
      try {
        const res = await fetch(`/api/finance/billing/drafts/${id}/issue`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        const json = await res.json();
        if (!json.success) {
          toast.error(json.error ?? "Error emitiendo");
          throw new Error(json.error);
        }
        toast.success("Borrador emitido al SII");
        await loadDrafts();
      } finally {
        setIssuing(null);
      }
    },
    [canIssue, loadDrafts],
  );

  const totals = useMemo(() => {
    if (!drafts) return { count: 0, sum: 0 };
    return {
      count: drafts.length,
      sum: drafts.reduce((acc, d) => acc + d.totalAmount, 0),
    };
  }, [drafts]);

  if (drafts === null) {
    return (
      <ul className="space-y-2" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <li key={i}>
            <Surface elevation={1} padding="sm" className="animate-pulse">
              <div className="flex gap-2 mb-2">
                <div className="h-3 w-16 rounded bg-ds-surface-3" />
                <div className="h-3 w-12 rounded bg-ds-surface-3" />
                <div className="h-3 w-12 rounded bg-ds-surface-3" />
              </div>
              <div className="h-4 w-48 rounded bg-ds-surface-3 mb-1.5" />
              <div className="h-3 w-24 rounded bg-ds-surface-3 mb-3" />
              <div className="h-5 w-32 rounded bg-ds-surface-3" />
            </Surface>
          </li>
        ))}
      </ul>
    );
  }
  if (drafts.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        tone="neutral"
        compact
        title="Sin borradores pendientes"
        description="Cuando crees un borrador o se genere uno desde una plantilla recurrente, aparecerá acá."
      />
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2 mb-2 text-[13px] text-ds-text-3">
        <span>
          <strong className="text-ds-text-1">{totals.count}</strong>{" "}
          {totals.count === 1 ? "borrador" : "borradores"} ·{" "}
          <span className="font-mono tabular-nums">{fmtCLP.format(totals.sum)}</span>
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={loadDrafts}
          disabled={refreshing}
          className="h-8 px-2 text-[12px]"
          aria-label="Refrescar listado"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
          />
          <span className="ml-1">Refrescar</span>
        </Button>
      </div>

      <ul className="space-y-2 ds-list-cascade">
        {drafts.map((d) => {
          const ageLabel = formatDistanceToNowStrict(new Date(d.createdAt), {
            locale: es,
            addSuffix: false,
          });
          return (
            <li key={d.id}>
              <Surface
                elevation={1}
                padding="sm"
                tappable
                onClick={() => setOpenDetailId(d.id)}
                className="cursor-pointer"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setOpenDetailId(d.id);
                  }
                }}
                aria-label={`Ver detalle del borrador para ${d.receiverName ?? "sin cliente"} por ${fmtCLP.format(d.totalAmount)}`}
              >
                {/* Header chips */}
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="font-mono text-[12px] text-ds-text-3 tabular-nums shrink-0">
                    {format(new Date(d.date), "dd MMM yyyy", { locale: es })}
                  </span>
                  <DocumentTag dteType={d.dteType} />
                  <span className="inline-flex items-center rounded-md border border-tint-violet-fg/30 bg-tint-violet/30 px-1.5 py-0.5 text-[11px] font-mono uppercase tracking-[0.08em] text-tint-violet-fg">
                    Borrador
                  </span>
                  <span
                    className="text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4"
                    title={`Creado hace ${ageLabel}`}
                  >
                    {ageLabel}
                  </span>
                  <span className="ml-auto inline-flex items-center gap-1.5">
                    <DocStatusIcon
                      variant="PROFORMA"
                      required={d.requireProforma}
                      status={d.proformaStatus}
                      sentAt={d.proformaSentAt}
                      sentCount={d.proformaSentCount}
                      lastRecipient={d.proformaLastRecipient}
                    />
                    <DocStatusIcon
                      variant="ESTADO_DE_PAGO"
                      required={d.requireEstadoPago}
                      status={d.estadoPagoStatus}
                      sentAt={d.estadoPagoSentAt}
                      sentCount={d.estadoPagoSentCount}
                      lastRecipient={d.estadoPagoLastRecipient}
                    />
                    <OcReferenceChip references={d.additionalReferences} />
                  </span>
                </div>

                {/* Receptor */}
                <p className="text-sm font-medium text-ds-text-1 truncate">
                  {d.receiverName ?? "Sin cliente"}
                </p>
                {d.receiverRut && (
                  <p className="text-[12px] text-ds-text-4 font-mono">
                    {d.receiverRut}
                  </p>
                )}
                {(d.installationName || d.crmAccountName) && (
                  <div className="flex items-center gap-1.5 mt-1 text-[12px] text-ds-text-3 min-w-0">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                      {d.installationName ?? d.crmAccountName}
                      {d.installationCommune && (
                        <span className="text-ds-text-4">
                          {" · "}
                          {d.installationCommune}
                        </span>
                      )}
                    </span>
                  </div>
                )}

                {/* Monto */}
                <div className="mt-2 flex items-baseline gap-2 flex-wrap">
                  <span className="font-mono text-base font-semibold tabular-nums text-ds-text-1">
                    {fmtCLP.format(d.netAmount)}
                    <span className="text-[10px] uppercase tracking-wider text-ds-text-3 ml-1.5 font-sans font-normal">neto</span>
                  </span>
                  <span className="font-mono text-xs tabular-nums text-ds-text-3">
                    · {fmtCLP.format(d.totalAmount)} c/IVA
                  </span>
                </div>

                {/* Actions */}
                <div
                  className="flex gap-2 mt-3 pt-3 border-t border-ds-border-subtle"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setOpenDetailId(d.id)}
                    className="flex-1 justify-center h-11"
                  >
                    Ver detalle
                  </Button>
                  {canIssue && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => setConfirmingDraft(d)}
                      disabled={issuing === d.id}
                      className="flex-1 justify-center h-11"
                    >
                      {issuing === d.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Send className="h-3.5 w-3.5 mr-1.5" />
                          Emitir SII
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </Surface>
            </li>
          );
        })}
      </ul>

      {openDetailId && (
        <DraftDetailSheet
          draftId={openDetailId}
          open={!!openDetailId}
          onOpenChange={(o) => !o && setOpenDetailId(null)}
          canIssue={canIssue}
          canManage={canManage}
          onAfterMutation={loadDrafts}
        />
      )}

      <ConfirmDialog
        open={!!confirmingDraft}
        onOpenChange={(open) => {
          if (!open && !issuing) setConfirmingDraft(null);
        }}
        title="¿Emitir borrador al SII?"
        description={
          confirmingDraft ? (
            <>
              Vas a emitir el borrador para{" "}
              <strong>{confirmingDraft.receiverName ?? "Sin cliente"}</strong>{" "}
              por{" "}
              <strong>{fmtCLP.format(confirmingDraft.totalAmount)}</strong>.
              Esta acción asigna folio y no se puede deshacer (solo con NC).
            </>
          ) : (
            ""
          )
        }
        confirmLabel="Emitir al SII"
        cancelLabel="Cancelar"
        variant="default"
        loading={!!confirmingDraft && issuing === confirmingDraft.id}
        loadingLabel="Emitiendo..."
        onConfirm={async () => {
          if (!confirmingDraft) return;
          try {
            await handleIssue(confirmingDraft.id);
            setConfirmingDraft(null);
          } catch {
            // toast del error ya se mostró en handleIssue.
          }
        }}
      />
    </>
  );
}
