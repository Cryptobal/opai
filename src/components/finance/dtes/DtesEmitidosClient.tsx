"use client";

/**
 * DtesEmitidosClient — orquestador del listado de DTEs Emitidos.
 *
 * Reemplaza el `DtesTab` interno de `FacturacionClient.tsx`. Compone:
 *   - KpiStrip            (5 KPIs con sparkline)
 *   - DtesToolbar         (search + filtros + sort + emitir)
 *   - ActiveFilterChips   (chips removibles)
 *   - IssuedDtesTable     (desktop)
 *   - IssuedDtesMobileList (mobile)
 *   - PaginationControls  (server-side)
 *   - BulkActionBar       (acciones masivas)
 *   - FiltersDrawer       (sheet de filtros estructurado)
 *   - IssuedDteSlideOver  (detalle)
 *   - Modales auxiliares: NC/ND, Ceder, PdfPreview, SendEmail, EmisiónConfirm
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/opai-ds";
import { toast } from "sonner";
import { CederDteDialog } from "../factoring/CederDteDialog";
import { PdfPreviewDialog } from "../PdfPreviewDialog";
import { EmisionConfirmDialog } from "../EmisionConfirmDialog";
import { CreditNoteModal } from "../CreditNoteModal";
import { SendEmailDialog } from "../SendEmailDialog";
import { PaginationControls } from "../PaginationControls";
import { KpiStrip } from "./KpiStrip";
import { DtesToolbar } from "./DtesToolbar";
import { FiltersDrawer } from "./FiltersDrawer";
import { ActiveFilterChips } from "./ActiveFilterChips";
import { IssuedDtesTable } from "./IssuedDtesTable";
import { IssuedDtesMobileList } from "./IssuedDtesMobileList";
import { BulkActionBar } from "./BulkActionBar";
import { IssuedDteSlideOver } from "./IssuedDteSlideOver";
import { useDteFilters } from "./hooks/useDteFilters";
import { fmtCLP, sortDteRows } from "./shared/constants";
import type {
  DteRow,
  CostCenterOption,
  InstallationOption,
} from "./shared/types";

interface Props {
  dtes: DteRow[];
  issuedTotal: number;
  canManage: boolean;
  forcedSiiStatus?: string | null;
  forcedPaymentStatus?: string | null;
}

export function DtesEmitidosClient({
  dtes: initialDtes,
  issuedTotal,
  canManage,
  forcedSiiStatus = null,
  forcedPaymentStatus = null,
}: Props) {
  const router = useRouter();

  const {
    filters,
    setFilters,
    update,
    reset,
    removeOne,
    activeCount,
    debouncedSearch,
  } = useDteFilters({
    forcedSiiStatus,
    forcedPaymentStatus,
  });

  const [filtersOpen, setFiltersOpen] = useState(false);

  // Datos paginados (mismo patrón que tenía DtesTab).
  const [dtes, setDtes] = useState<DteRow[]>(initialDtes);
  const [total, setTotal] = useState(issuedTotal);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [accountOptions, setAccountOptions] = useState<CostCenterOption[]>([]);
  const [installationOptions, setInstallationOptions] = useState<InstallationOption[]>([]);
  const [tenantBackoffice, setTenantBackoffice] = useState<{
    emails: string[];
    alwaysSend: boolean;
  }>({ emails: [], alwaysSend: false });

  // Estados de modales y por-fila.
  const [noteModal, setNoteModal] = useState<{
    dteId: string;
    noteType: "credit" | "debit";
  } | null>(null);
  const [detailDteId, setDetailDteId] = useState<string | null>(null);
  const [cedeModalDteId, setCedeModalDteId] = useState<string | null>(null);
  const [previewDteId, setPreviewDteId] = useState<string | null>(null);
  const [emailDteId, setEmailDteId] = useState<string | null>(null);

  const [voiding, setVoiding] = useState<string | null>(null);
  const [sendingEmail] = useState<string | null>(null);
  const [checkingStatus, setCheckingStatus] = useState<string | null>(null);
  const [deletingDraft, setDeletingDraft] = useState<string | null>(null);

  const [issuingDraft, setIssuingDraft] = useState<{
    id: string;
    dteType: number;
    receiverName: string;
    receiverRut: string;
    receiverEmail: string | null;
    netAmount: number;
    taxAmount: number;
    totalAmount: number;
    currency: string;
    ufValueAtIssue: number | null;
    lines: Array<{
      itemName: string;
      quantity: number;
      unitPrice: number;
      unitPriceUf: number | null;
    }>;
  } | null>(null);
  const [issuingDraftLoading, setIssuingDraftLoading] = useState(false);

  // Selección masiva.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);
  const toggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const toggleAll = useCallback(
    (visibleIds: string[], allSelected: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (allSelected) {
          visibleIds.forEach((id) => next.delete(id));
        } else {
          visibleIds.forEach((id) => next.add(id));
        }
        return next;
      });
    },
    [],
  );

  // ── Effects ──

  useEffect(() => {
    fetch("/api/finance/config/dte-provider")
      .then((r) => r.json())
      .then((j) => {
        const cfg = j?.data?.config;
        if (cfg) {
          setTenantBackoffice({
            emails: cfg.defaultXmlRecipientEmails ?? [],
            alwaysSend: !!cfg.defaultXmlRecipientAlwaysSend,
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/finance/billing/accounts-with-dtes?direction=ISSUED&include=installations")
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        if (body.success) {
          if (Array.isArray(body.data?.accounts)) {
            setAccountOptions(body.data.accounts);
          }
          if (Array.isArray(body.data?.installations)) {
            setInstallationOptions(body.data.installations);
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Reset page=1 cuando cambian los filtros que se persisten en server.
  useEffect(() => {
    setPage(1);
  }, [
    debouncedSearch,
    filters.periodo,
    filters.accountId,
    filters.installationId,
    filters.sort,
  ]);

  // Fetch server-side cuando cambian filtros de servidor.
  useEffect(() => {
    if (
      page === 1 &&
      pageSize === 50 &&
      filters.periodo === "CURRENT_MONTH" &&
      filters.accountId === "ALL" &&
      filters.installationId === "ALL" &&
      filters.sort === "date_desc" &&
      debouncedSearch === ""
    ) {
      setDtes(initialDtes);
      setTotal(issuedTotal);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    (async () => {
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("pageSize", String(pageSize));
        if (filters.periodo !== "ALL") params.set("periodo", filters.periodo);
        if (debouncedSearch) params.set("search", debouncedSearch);
        if (filters.accountId !== "ALL")
          params.set("accountId", filters.accountId);
        if (filters.installationId !== "ALL")
          params.set("installationId", filters.installationId);
        params.set("sort", filters.sort);
        const res = await fetch(
          `/api/finance/billing/issued?${params.toString()}`,
          { signal: ctrl.signal },
        );
        if (!res.ok) throw new Error();
        const json = await res.json();
        const list: DteRow[] = Array.isArray(json?.data?.dtes)
          ? json.data.dtes.map((d: Record<string, unknown>) => ({
              id: String(d.id),
              dteType: Number(d.dteType),
              folio: Number(d.folio),
              receiverRut: String(d.receiverRut ?? ""),
              receiverName: String(d.receiverName ?? ""),
              receiverEmail: (d.receiverEmail as string | null) ?? null,
              netAmount: Number(d.netAmount),
              taxAmount: Number(d.taxAmount),
              totalAmount: Number(d.totalAmount),
              siiStatus: String(d.siiStatus ?? ""),
              currency: String(d.currency ?? "CLP"),
              linesCount: Array.isArray(d.lines)
                ? (d.lines as unknown[]).length
                : 0,
              createdAt: String(d.createdAt ?? ""),
              emailSentAt: (d.emailSentAt as string | null) ?? null,
              emailStatus: (d.emailStatus as string | null) ?? null,
              referenceType: (d.referenceType as number | null) ?? null,
              referenceFolio: (d.referenceFolio as number | null) ?? null,
              hasXml: Boolean(d.hasXml),
              crmAccountId: (d.crmAccountId as string | null) ?? null,
              installationId: (d.installationId as string | null) ?? null,
              crmAccount:
                (d.crmAccount as
                  | { id: string; name: string; legalName: string | null }
                  | null) ?? null,
              installation:
                (d.installation as
                  | { id: string; name: string; commune: string | null }
                  | null) ?? null,
              canBeCeded: Boolean(d.canBeCeded),
              activeCession:
                (d.activeCession as
                  | { id: string; code: string; status: string }
                  | null) ?? null,
              date:
                typeof d.date === "string" ? d.date : String(d.date ?? ""),
              dueDate: (d.dueDate as string | null) ?? null,
              paymentStatus: (d.paymentStatus as string | null) ?? null,
              linkedCreditNote:
                (d.linkedCreditNote as
                  | {
                      count: number;
                      hasFullAnnulment: boolean;
                      creditedNet: number;
                      primaryFolio: number;
                    }
                  | null) ?? null,
            }))
          : [];
        setDtes(list);
        if (typeof json?.data?.pagination?.total === "number") {
          setTotal(json.data.pagination.total);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          toast.error("Error al cargar DTEs emitidos");
        }
      } finally {
        setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [
    page,
    pageSize,
    filters.periodo,
    filters.accountId,
    filters.installationId,
    filters.sort,
    debouncedSearch,
    initialDtes,
    issuedTotal,
  ]);

  // ── Filtros client-side (los que NO van al server) ──
  const filtered = useMemo(() => {
    let list = dtes;
    if (filters.types.length) {
      list = list.filter((d) => filters.types.includes(d.dteType));
    }
    if (filters.siiStatuses.length) {
      list = list.filter((d) => filters.siiStatuses.includes(d.siiStatus));
    }
    if (filters.paymentStatuses.length) {
      list = list.filter((d) =>
        d.paymentStatus
          ? filters.paymentStatuses.includes(d.paymentStatus)
          : false,
      );
    }
    if (filters.amountMin != null) {
      list = list.filter((d) => d.totalAmount >= (filters.amountMin ?? 0));
    }
    if (filters.amountMax != null) {
      list = list.filter((d) => d.totalAmount <= (filters.amountMax ?? Infinity));
    }
    if (filters.onlyCeded) {
      list = list.filter((d) => !!d.activeCession);
    }
    if (filters.onlyWithCreditNotes) {
      list = list.filter((d) => !!d.linkedCreditNote);
    }
    if (filters.onlyEmailFailed) {
      list = list.filter((d) => d.emailStatus === "FAILED");
    }
    if (filters.excludeDrafts) {
      list = list.filter((d) => d.siiStatus !== "DRAFT");
    }
    return sortDteRows(list, filters.sort);
  }, [dtes, filters]);

  const filteredSumTotal = useMemo(
    () => filtered.reduce((acc, d) => acc + d.totalAmount, 0),
    [filtered],
  );

  // ── Per-row handlers (idénticos al DtesTab original) ──

  const handleDownloadPdf = async (id: string, folio: number) => {
    try {
      const res = await fetch(`/api/finance/billing/issued/${id}/pdf`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `DTE-${folio}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    }
  };

  const handleDownloadXml = async (id: string, folio: number) => {
    try {
      const res = await fetch(`/api/finance/billing/issued/${id}/xml`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `DTE-${folio}.xml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    }
  };

  const handleCheckStatus = async (id: string, folio: number) => {
    setCheckingStatus(id);
    try {
      const res = await fetch(`/api/finance/billing/issued/${id}/status`);
      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const newStatus = body.data?.status ?? "PENDING";
      const msg = body.data?.message ? ` (${body.data.message})` : "";
      toast.success(
        `DTE ${folio}: estado SII actualizado → ${newStatus}${msg}`,
      );
      router.refresh();
    } catch (err) {
      toast.error(`DTE ${folio}: ${(err as Error).message}`);
    } finally {
      setCheckingStatus(null);
    }
  };

  const handleResendEmail = (id: string) => {
    setEmailDteId(id);
  };

  const handleEditDraft = (id: string) => {
    router.push(`/finanzas/facturacion/emitir?draftId=${id}`);
  };

  const handleIssueDraft = async (id: string) => {
    try {
      const res = await fetch(`/api/finance/billing/drafts/${id}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Error al cargar borrador");
      }
      const json = await res.json();
      const d = json.data;
      if (!d) throw new Error("Borrador no encontrado");
      setIssuingDraft({
        id: d.id,
        dteType: Number(d.dteType),
        receiverName: String(d.receiverName ?? ""),
        receiverRut: String(d.receiverRut ?? ""),
        receiverEmail: (d.receiverEmail as string | null) ?? null,
        netAmount: Number(d.netAmount),
        taxAmount: Number(d.taxAmount),
        totalAmount: Number(d.totalAmount),
        currency: String(d.currency ?? "CLP"),
        ufValueAtIssue:
          d.ufValueAtIssue != null ? Number(d.ufValueAtIssue) : null,
        lines: Array.isArray(d.lines)
          ? d.lines.map((l: Record<string, unknown>) => ({
              itemName: String(l.itemName ?? ""),
              quantity: Number(l.quantity ?? 1),
              unitPrice: Number(l.unitPrice ?? 0),
              unitPriceUf:
                l.unitPriceUf != null ? Number(l.unitPriceUf) : null,
            }))
          : [],
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado");
    }
  };

  const submitIssueDraft = async (opts: {
    autoSendEmail: boolean;
    sendXmlToBackoffice: boolean;
  }) => {
    if (!issuingDraft) return;
    setIssuingDraftLoading(true);
    try {
      const res = await fetch(
        `/api/finance/billing/drafts/${issuingDraft.id}/issue`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(opts),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Error al emitir borrador");
      }
      toast.success("Borrador emitido al SII");
      setIssuingDraft(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setIssuingDraftLoading(false);
    }
  };

  const handleDeleteDraft = async (id: string) => {
    if (!confirm("¿Eliminar este borrador? Esta acción no es reversible."))
      return;
    setDeletingDraft(id);
    try {
      const res = await fetch(`/api/finance/billing/drafts/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Error al eliminar borrador");
      }
      toast.success("Borrador eliminado");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setDeletingDraft(null);
    }
  };

  const handleVoid = async (id: string) => {
    if (!confirm("¿Anular este DTE? Esta acción no se puede deshacer.")) return;
    setVoiding(id);
    try {
      const res = await fetch(`/api/finance/billing/issued/${id}/void`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al anular DTE");
      }
      toast.success("DTE anulado");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setVoiding(null);
    }
  };

  // ── Bulk handlers ──

  const handleBulkResendEmail = async () => {
    if (selectedIds.size === 0) return;
    if (
      !confirm(
        `¿Reenviar email a ${selectedIds.size} DTE(s)? Se enviará al receptor por defecto.`,
      )
    )
      return;
    try {
      const res = await fetch(
        "/api/finance/billing/issued/bulk-resend-email",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dteIds: Array.from(selectedIds) }),
        },
      );
      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const sent = body.data?.sent ?? 0;
      const failed = body.data?.failed?.length ?? 0;
      if (failed > 0) {
        toast.warning(
          `${sent} enviado(s), ${failed} falló(aron). Revisá el detalle.`,
        );
      } else {
        toast.success(`${sent} email(s) enviado(s).`);
      }
      clearSelection();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado");
    }
  };

  const handleBulkCheckStatus = async () => {
    if (selectedIds.size === 0) return;
    try {
      const res = await fetch(
        "/api/finance/billing/issued/bulk-check-status",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dteIds: Array.from(selectedIds) }),
        },
      );
      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const updated = body.data?.updated?.length ?? 0;
      const failed = body.data?.failed?.length ?? 0;
      if (failed > 0) {
        toast.warning(
          `${updated} actualizado(s), ${failed} falló(aron).`,
        );
      } else {
        toast.success(`Estado actualizado en ${updated} DTE(s).`);
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado");
    }
  };

  const handleBulkMarkPaid = async () => {
    if (selectedIds.size === 0) return;
    if (
      !confirm(
        `¿Marcar ${selectedIds.size} DTE(s) como pagados? Esta operación es administrativa y queda en el audit log.`,
      )
    )
      return;
    try {
      const res = await fetch("/api/finance/billing/issued/bulk-mark-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dteIds: Array.from(selectedIds),
          markAt: new Date().toISOString(),
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      toast.success(`${body.data?.updated ?? 0} DTE(s) marcados como pagados.`);
      clearSelection();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado");
    }
  };

  const buildCsvFromRows = (rows: typeof filtered) => {
    const header = [
      "Tipo",
      "Folio",
      "Fecha",
      "Receptor",
      "RUT",
      "Neto",
      "IVA",
      "Total",
      "Estado SII",
      "Estado Pago",
      "Centro de costo",
      "Instalación",
      "Cesión",
    ];
    const csvRows = rows.map((r) => [
      String(r.dteType),
      r.siiStatus === "DRAFT" ? "" : String(r.folio),
      r.date ? format(new Date(r.date), "yyyy-MM-dd", { locale: es }) : "",
      JSON.stringify(r.receiverName ?? ""),
      r.receiverRut,
      String(r.netAmount),
      String(r.taxAmount),
      String(r.totalAmount),
      r.siiStatus,
      r.paymentStatus ?? "",
      JSON.stringify(r.crmAccount?.name ?? ""),
      JSON.stringify(r.installation?.name ?? ""),
      r.activeCession?.code ?? "",
    ]);
    return [header, ...csvRows].map((cols) => cols.join(",")).join("\n");
  };

  const handleExportCsv = () => {
    if (filtered.length === 0) return;
    const csv = buildCsvFromRows(filtered);
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dtes-emitidos-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${filtered.length} DTE(s) exportados.`);
  };

  const handleBulkExportCsv = () => {
    if (selectedIds.size === 0) return;
    const selectedRows = filtered.filter((d) => selectedIds.has(d.id));
    const csv = buildCsvFromRows(selectedRows);
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dtes-emitidos-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${selectedRows.length} DTE(s) exportados.`);
  };

  // ── Lookups para modales ──
  const cedeDte = cedeModalDteId
    ? dtes.find((d) => d.id === cedeModalDteId)
    : null;
  const previewDte = previewDteId
    ? dtes.find((d) => d.id === previewDteId)
    : null;
  const emailDte = emailDteId ? dtes.find((d) => d.id === emailDteId) : null;

  return (
    <div className="space-y-4 pb-24 md:pb-4">
      <KpiStrip
        periodo={filters.periodo}
        accountId={filters.accountId}
        installationId={filters.installationId}
        onClickTotal={() => router.push("/finanzas/reportes/ventas")}
        onClickAccepted={() => update("siiStatuses", ["ACCEPTED"])}
        onClickPending={() => update("siiStatuses", ["PENDING"])}
        onClickAnnulled={() => update("siiStatuses", ["ANNULLED"])}
        onClickCeded={() => update("onlyCeded", true)}
      />

      <DtesToolbar
        filters={filters}
        update={update}
        activeCount={activeCount}
        onOpenFilters={() => setFiltersOpen(true)}
        canManage={canManage}
        onExport={handleExportCsv}
        exportDisabled={filtered.length === 0}
      />

      <ActiveFilterChips
        filters={filters}
        accounts={accountOptions}
        installations={installationOptions}
        onRemove={removeOne}
        onClearAll={reset}
      />

      <div className="flex items-center justify-between text-xs text-ds-text-3">
        <span>
          {filtered.length} {filtered.length === 1 ? "documento" : "documentos"}
          {filtered.length !== total && ` (de ${total} totales)`}
        </span>
        {filtered.length > 0 && (
          <span>
            Total filtrado:{" "}
            <strong className="text-ds-text-1 font-mono">
              {fmtCLP.format(filteredSumTotal)}
            </strong>
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Sin documentos"
          description="No hay DTEs emitidos en este período. Podés emitir uno desde cero o programar facturas recurrentes."
          action={
            canManage ? (
              <Link href="/finanzas/facturacion/emitir">
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Emitir DTE
                </Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="hidden md:block">
            <IssuedDtesTable
              rows={filtered}
              selectedIds={selectedIds}
              onToggleRow={toggleRow}
              onToggleAll={toggleAll}
              canManage={canManage}
              sendingEmail={sendingEmail}
              checkingStatus={checkingStatus}
              voiding={voiding}
              deletingDraft={deletingDraft}
              onViewDetail={(id) => setDetailDteId(id)}
              onPreviewPdf={(id) => setPreviewDteId(id)}
              onDownloadPdf={handleDownloadPdf}
              onDownloadXml={handleDownloadXml}
              onResendEmail={handleResendEmail}
              onCheckStatus={handleCheckStatus}
              onVoid={handleVoid}
              onCede={(id) => setCedeModalDteId(id)}
              onCreditNote={(id) =>
                setNoteModal({ dteId: id, noteType: "credit" })
              }
              onDebitNote={(id) =>
                setNoteModal({ dteId: id, noteType: "debit" })
              }
              onEditDraft={handleEditDraft}
              onIssueDraft={handleIssueDraft}
              onDeleteDraft={handleDeleteDraft}
            />
          </div>
          <div className="md:hidden">
            <IssuedDtesMobileList
              rows={filtered}
              selectedIds={selectedIds}
              onToggleRow={toggleRow}
              canManage={canManage}
              sendingEmail={sendingEmail}
              checkingStatus={checkingStatus}
              voiding={voiding}
              deletingDraft={deletingDraft}
              onViewDetail={(id) => setDetailDteId(id)}
              onPreviewPdf={(id) => setPreviewDteId(id)}
              onDownloadPdf={handleDownloadPdf}
              onDownloadXml={handleDownloadXml}
              onResendEmail={handleResendEmail}
              onCheckStatus={handleCheckStatus}
              onVoid={handleVoid}
              onCede={(id) => setCedeModalDteId(id)}
              onCreditNote={(id) =>
                setNoteModal({ dteId: id, noteType: "credit" })
              }
              onDebitNote={(id) =>
                setNoteModal({ dteId: id, noteType: "debit" })
              }
              onEditDraft={handleEditDraft}
              onIssueDraft={handleIssueDraft}
              onDeleteDraft={handleDeleteDraft}
            />
          </div>
          <PaginationControls
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
            loading={loading}
          />
        </>
      )}

      <FiltersDrawer
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        setFilters={setFilters}
        update={update}
        reset={reset}
        activeCount={activeCount}
        accounts={accountOptions}
        installations={installationOptions}
      />

      <BulkActionBar
        count={selectedIds.size}
        onClear={clearSelection}
        onResendEmail={handleBulkResendEmail}
        onCheckStatus={handleBulkCheckStatus}
        onMarkPaid={handleBulkMarkPaid}
        onExportCsv={handleBulkExportCsv}
        canResendEmail={canManage}
        canMarkPaid={canManage}
      />

      <CreditNoteModal
        open={noteModal !== null}
        onClose={() => setNoteModal(null)}
        referenceDteId={noteModal?.dteId ?? null}
        noteType={noteModal?.noteType ?? "credit"}
      />

      <IssuedDteSlideOver
        open={detailDteId !== null}
        onClose={() => setDetailDteId(null)}
        dteId={detailDteId}
        canManage={canManage}
        onEmitCreditNote={(id) =>
          setNoteModal({ dteId: id, noteType: "credit" })
        }
        onEmitDebitNote={(id) =>
          setNoteModal({ dteId: id, noteType: "debit" })
        }
      />

      {cedeDte && (
        <CederDteDialog
          open={cedeModalDteId !== null}
          onOpenChange={(o) => !o && setCedeModalDteId(null)}
          dte={{
            id: cedeDte.id,
            dteType: cedeDte.dteType,
            folio: cedeDte.folio,
            receiverName: cedeDte.receiverName,
            totalAmount: cedeDte.totalAmount,
          }}
        />
      )}

      {previewDte && (
        <PdfPreviewDialog
          open={previewDteId !== null}
          onOpenChange={(o) => !o && setPreviewDteId(null)}
          dteId={previewDte.id}
          folio={previewDte.folio}
          dteType={previewDte.dteType}
          onDownload={() =>
            handleDownloadPdf(previewDte.id, previewDte.folio)
          }
        />
      )}

      {emailDte && (
        <SendEmailDialog
          open={emailDteId !== null}
          onOpenChange={(o) => !o && setEmailDteId(null)}
          dteId={emailDte.id}
          folio={emailDte.folio}
          dteType={emailDte.dteType}
          defaultRecipient={emailDte.receiverEmail}
          defaultCc={[]}
          onSent={() => router.refresh()}
        />
      )}

      {issuingDraft && (
        <EmisionConfirmDialog
          open={issuingDraft !== null}
          onClose={() => setIssuingDraft(null)}
          onConfirm={submitIssueDraft}
          loading={issuingDraftLoading}
          dteType={issuingDraft.dteType}
          receiver={{
            name: issuingDraft.receiverName,
            rut: issuingDraft.receiverRut,
            email: issuingDraft.receiverEmail,
          }}
          totals={{
            netAmount: issuingDraft.netAmount,
            taxAmount: issuingDraft.taxAmount,
            totalAmount: issuingDraft.totalAmount,
            currency: issuingDraft.currency as "CLP" | "UF",
            ufValue: issuingDraft.ufValueAtIssue ?? undefined,
          }}
          lines={issuingDraft.lines}
          defaultBackofficeEmails={tenantBackoffice.emails}
          defaultBackofficeAlwaysSend={tenantBackoffice.alwaysSend}
        />
      )}
    </div>
  );
}
