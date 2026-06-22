"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { es } from "date-fns/locale";
import { formatCalendarDateDisplay } from "@/lib/fx-date";
import { toast } from "sonner";
import { notifyEmitResult } from "./emit-toast";
import { FileText, Loader2, Send, RefreshCw, MapPin, Repeat, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Surface, EmptyState, DataTable, type DataTableColumn } from "@/components/opai-ds";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { fmtCLP } from "@/components/finance/dtes/shared/constants";
import { DocumentTag } from "@/components/finance/dtes/DocumentTag";
import { DocStatusIcon, OcReferenceChip } from "./SendStatusIcons";
import { DraftDetailSheet } from "./DraftDetailSheet";
import {
  SortableColumnHeader,
  toggleTableSort,
  type TableSortDir,
} from "./SortableColumnHeader";
import type { DraftListItem } from "@/modules/finance/billing/dte-draft.service";

interface Props {
  canIssue: boolean;
  canManage: boolean;
}

type DraftSortField =
  | "date"
  | "type"
  | "receptor"
  | "installation"
  | "template"
  | "amount";

function defaultDraftSortDir(field: DraftSortField): TableSortDir {
  return field === "amount" ? "desc" : "asc";
}

function compareDrafts(a: DraftListItem, b: DraftListItem, field: DraftSortField): number {
  switch (field) {
    case "date":
      return a.date.localeCompare(b.date);
    case "type":
      return a.dteType - b.dteType;
    case "receptor":
      return (a.receiverName ?? "").localeCompare(b.receiverName ?? "", "es");
    case "installation":
      return (a.installationName ?? a.crmAccountName ?? "").localeCompare(
        b.installationName ?? b.crmAccountName ?? "",
        "es",
      );
    case "template":
      return (a.templateName ?? "").localeCompare(b.templateName ?? "", "es");
    case "amount":
      return a.totalAmount - b.totalAmount;
    default:
      return 0;
  }
}

export function DraftsMobileList({ canIssue, canManage }: Props) {
  const [drafts, setDrafts] = useState<DraftListItem[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [openDetailId, setOpenDetailId] = useState<string | null>(null);
  const [issuing, setIssuing] = useState<string | null>(null);
  const [confirmingDraft, setConfirmingDraft] = useState<DraftListItem | null>(null);
  const [sortField, setSortField] = useState<DraftSortField>("receptor");
  const [sortDir, setSortDir] = useState<TableSortDir>("asc");

  const handleSort = useCallback((field: DraftSortField) => {
    const next = toggleTableSort(field, sortField, sortDir, defaultDraftSortDir);
    setSortField(next.field);
    setSortDir(next.dir);
  }, [sortField, sortDir]);

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
        notifyEmitResult(json.data);
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

  const sortedDrafts = useMemo(() => {
    if (!drafts) return null;
    const rows = [...drafts];
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => compareDrafts(a, b, sortField) * dir);
    return rows;
  }, [drafts, sortField, sortDir]);

  const draftColumns: DataTableColumn<DraftListItem>[] = useMemo(() => [
    {
      id: "template",
      header: (
        <SortableColumnHeader
          label="Plantilla"
          field="template"
          sortField={sortField}
          sortDir={sortDir}
          onSort={handleSort}
        />
      ),
      width: "w-[224px]",
      cell: (d) => (
        <div className="min-w-0">
          {d.templateName ? (
            <>
              <div className="flex items-center gap-1 min-w-0 text-sm font-medium text-tint-violet-fg">
                <Repeat className="h-3 w-3 shrink-0" />
                <span className="truncate">{d.templateName}</span>
              </div>
              <div className="text-xs text-ds-text-3 truncate">
                {d.receiverName ?? "Sin cliente"}
              </div>
            </>
          ) : (
            <div className="text-sm font-medium text-ds-text-1 truncate">
              {d.receiverName ?? "Sin cliente"}
            </div>
          )}
          {d.receiverRut && (
            <div className="text-xs text-ds-text-4 font-mono tabular-nums truncate">
              {d.receiverRut}
            </div>
          )}
        </div>
      ),
    },
    {
      id: "installation",
      header: (
        <SortableColumnHeader
          label="Cliente / Instalación"
          field="installation"
          sortField={sortField}
          sortDir={sortDir}
          onSort={handleSort}
        />
      ),
      width: "w-[200px]",
      cell: (d) =>
        d.crmAccountName || d.installationName ? (
          <div className="min-w-0 text-xs space-y-0.5">
            {d.crmAccountName && (
              <div
                className="flex items-center gap-1 min-w-0"
                title={d.crmAccountName}
              >
                <Building2 className="h-3 w-3 shrink-0 text-ds-text-4" />
                <span className="truncate font-medium">{d.crmAccountName}</span>
              </div>
            )}
            {d.installationName && (
              <div
                className="flex items-center gap-1 min-w-0 text-ds-text-3"
                title={d.installationName}
              >
                <MapPin className="h-3 w-3 shrink-0 text-ds-text-4" />
                <span className="truncate">
                  {d.installationName}
                  {d.installationCommune ? ` · ${d.installationCommune}` : ""}
                </span>
              </div>
            )}
          </div>
        ) : (
          <span className="text-ds-text-4">—</span>
        ),
    },
    {
      id: "type",
      header: (
        <SortableColumnHeader
          label="Tipo"
          field="type"
          sortField={sortField}
          sortDir={sortDir}
          onSort={handleSort}
        />
      ),
      width: "w-[88px]",
      cell: (d) => (
        <div className="min-w-0 max-w-full overflow-hidden">
          <DocumentTag dteType={d.dteType} />
        </div>
      ),
    },
    {
      id: "date",
      header: (
        <SortableColumnHeader
          label="Fecha"
          field="date"
          sortField={sortField}
          sortDir={sortDir}
          onSort={handleSort}
        />
      ),
      width: "w-[100px]",
      cell: (d) => (
        <span className="font-mono text-xs tabular-nums">
          {formatCalendarDateDisplay(d.date, "dd MMM yyyy", es)}
        </span>
      ),
    },
    {
      id: "amount",
      header: (
        <SortableColumnHeader
          label="Monto"
          field="amount"
          sortField={sortField}
          sortDir={sortDir}
          onSort={handleSort}
          align="right"
        />
      ),
      width: "w-[160px]",
      align: "right",
      cell: (d) => (
        <div className="min-w-0">
          <div className="text-sm font-mono tabular-nums">{fmtCLP.format(d.netAmount)}</div>
          <div className="text-[11px] font-mono tabular-nums text-ds-text-3">
            {fmtCLP.format(d.totalAmount)} c/IVA
          </div>
        </div>
      ),
    },
    {
      id: "docs",
      header: "Docs",
      width: "w-[80px]",
      align: "center",
      cell: (d) => (
        <div className="flex items-center justify-center gap-1">
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
        </div>
      ),
    },
    ...(canIssue
      ? [
          {
            id: "actions",
            header: "",
            width: "w-[120px]",
            align: "right" as const,
            sticky: "right" as const,
            cell: (d: DraftListItem) => (
              <Button
                variant="default"
                size="sm"
                className="h-8 px-2.5 text-xs"
                disabled={issuing === d.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmingDraft(d);
                }}
              >
                {issuing === d.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <>
                    <Send className="h-3 w-3 mr-1" />
                    Emitir
                  </>
                )}
              </Button>
            ),
          },
        ]
      : []),
  ], [canIssue, handleSort, issuing, sortDir, sortField]);

  if (drafts === null || sortedDrafts === null) {
    return (
      <>
        <ul className="lg:hidden space-y-2" aria-busy="true">
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
        <div className="hidden lg:block">
          <DataTable<DraftListItem>
            columns={draftColumns}
            rows={[]}
            rowKey={(d) => d.id}
            loading
          />
        </div>
      </>
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

      {/* Mobile: cards apiladas */}
      <ul className="lg:hidden space-y-2 ds-list-cascade">
        {sortedDrafts.map((d) => {
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
                    {formatCalendarDateDisplay(d.date, "dd MMM yyyy", es)}
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

                {/* Plantilla (título) + receptor */}
                {d.templateName && (
                  <div className="flex items-center gap-1.5 text-sm font-medium text-tint-violet-fg min-w-0">
                    <Repeat className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{d.templateName}</span>
                  </div>
                )}
                <p
                  className={
                    d.templateName
                      ? "text-[12px] text-ds-text-3 truncate"
                      : "text-sm font-medium text-ds-text-1 truncate"
                  }
                >
                  {d.receiverName ?? "Sin cliente"}
                </p>
                {d.receiverRut && (
                  <p className="text-[12px] text-ds-text-4 font-mono">
                    {d.receiverRut}
                  </p>
                )}
                {/* Cliente / Instalación */}
                {d.crmAccountName && (
                  <div className="flex items-center gap-1.5 mt-1 text-[12px] text-ds-text-3 min-w-0">
                    <Building2 className="h-3 w-3 shrink-0" />
                    <span className="truncate">{d.crmAccountName}</span>
                  </div>
                )}
                {d.installationName && (
                  <div className="flex items-center gap-1.5 mt-1 text-[12px] text-ds-text-3 min-w-0">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                      {d.installationName}
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

      {/* Desktop: tabla compacta */}
      <div className="hidden lg:block">
        <DataTable<DraftListItem>
          columns={draftColumns}
          rows={sortedDrafts}
          layout="fixed"
          rowKey={(d) => d.id}
          onRowClick={(d) => setOpenDetailId(d.id)}
          empty={
            <EmptyState
              icon={FileText}
              tone="neutral"
              compact
              title="Sin borradores pendientes"
            />
          }
        />
      </div>

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
        title="¿Emitir al SII?"
        description={
          confirmingDraft ? (
            <>
              Vas a emitir al SII el DTE para{" "}
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
