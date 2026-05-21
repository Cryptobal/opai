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
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/opai-ds";
import { MobileFAB } from "@/components/finance/mobile";
import { toast } from "sonner";
import { CederDteDialog } from "../factoring/CederDteDialog";
import { BulkCederDteDialog } from "../factoring/BulkCederDteDialog";
import { PdfPreviewDialog } from "../PdfPreviewDialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatDateOnlyUtcYmd } from "@/lib/fx-date";
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
import { BillingDocSendModal } from "@/components/finance/billing-doc-send/BillingDocSendModal";
import { IssuedDteSlideOver } from "./IssuedDteSlideOver";
import { useDteFilters } from "./hooks/useDteFilters";
import { fmtCLP, sortDteRows } from "./shared/constants";
import type {
  DteRow,
  CostCenterOption,
  InstallationOption,
  DteFilters,
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
    setQuickFilter,
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

  // Deep link cross-módulo (?openDteId=...): cuando viene de un drawer
  // de Bancos, abrir el slide-over del DTE automáticamente.
  const searchParams = useSearchParams();
  const requestedDteId = searchParams.get("openDteId");
  useEffect(() => {
    if (requestedDteId && requestedDteId !== detailDteId) {
      setDetailDteId(requestedDteId);
    }
    // Solo se evalúa al cambiar el query param; setDetailDteId es estable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedDteId]);
  const [cedeModalDteId, setCedeModalDteId] = useState<string | null>(null);
  const [bulkCedeOpen, setBulkCedeOpen] = useState(false);
  const [previewDteId, setPreviewDteId] = useState<string | null>(null);
  const [emailDteId, setEmailDteId] = useState<string | null>(null);
  // ── "Enviar como…" (Proforma / Estado de Pago) ──
  const [sendAsModal, setSendAsModal] = useState<{
    dteId: string;
    target: "draft" | "issued";
    defaultVariant: "PROFORMA" | "ESTADO_DE_PAGO";
    defaultRecipientEmail: string | null;
    receiverName: string;
  } | null>(null);

  const [voiding, setVoiding] = useState<string | null>(null);
  const [sendingEmail] = useState<string | null>(null);
  const [checkingStatus, setCheckingStatus] = useState<string | null>(null);
  const [deletingDraft, setDeletingDraft] = useState<string | null>(null);
  const [cloningDraft, setCloningDraft] = useState<string | null>(null);

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
  // Post 2026-05: incluimos los filtros que antes vivían en cliente
  // (types, siiStatuses, paymentStatuses, montos, flags) porque ahora
  // viajan al server y cada cambio requiere repaginar desde 1.
  useEffect(() => {
    setPage(1);
  }, [
    debouncedSearch,
    filters.periodo,
    filters.accountId,
    filters.installationId,
    filters.sort,
    filters.types,
    filters.siiStatuses,
    filters.paymentStatuses,
    filters.amountMin,
    filters.amountMax,
    filters.onlyCeded,
    filters.onlyWithCreditNotes,
    filters.onlyEmailFailed,
    filters.excludeDrafts,
  ]);

  // Fetch server-side: TODOS los filtros se envían al backend (post
  // 2026-05). Antes los filtros tipo/pago/SII/montos/flags vivían en
  // cliente sobre el array de la página actual, lo que rompía la
  // paginación cuando había filtros (el `total` venía sin filtrar y los
  // botones de página se desincronizaban con la lista visible).
  useEffect(() => {
    const noServerFilters =
      page === 1 &&
      pageSize === 50 &&
      filters.periodo === "ALL" &&
      filters.accountId === "ALL" &&
      filters.installationId === "ALL" &&
      filters.sort === "date_desc" &&
      debouncedSearch === "" &&
      filters.types.length === 0 &&
      filters.siiStatuses.length === 0 &&
      filters.paymentStatuses.length === 0 &&
      filters.amountMin == null &&
      filters.amountMax == null &&
      !filters.onlyCeded &&
      !filters.onlyWithCreditNotes &&
      !filters.onlyEmailFailed &&
      !filters.excludeDrafts;

    if (noServerFilters) {
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
        // Filtros nuevos (server-side).
        if (filters.types.length > 0)
          params.set("dteType", filters.types.join(","));
        if (filters.siiStatuses.length > 0)
          params.set("siiStatus", filters.siiStatuses.join(","));
        if (filters.quickFilter === "DRAFT") {
          params.set("status", "draft");
        } else if (filters.quickFilter !== "ALL") {
          params.set("paymentStatus", filters.quickFilter);
          params.set("status", "issued");
        }
        if (filters.amountMin != null)
          params.set("amountMin", String(filters.amountMin));
        if (filters.amountMax != null)
          params.set("amountMax", String(filters.amountMax));
        if (filters.onlyCeded) params.set("onlyCeded", "1");
        if (filters.onlyWithCreditNotes)
          params.set("onlyWithCreditNotes", "1");
        if (filters.onlyEmailFailed) params.set("onlyEmailFailed", "1");
        if (filters.excludeDrafts) params.set("excludeDrafts", "1");
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
              receiverEmailCc: Array.isArray(d.receiverEmailCc)
                ? (d.receiverEmailCc as string[])
                : [],
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
                  | {
                      id: string;
                      code: string;
                      status: string;
                      factoringCompany?: string | null;
                    }
                  | null) ?? null,
              date:
                typeof d.date === "string" ? d.date : String(d.date ?? ""),
              dueDate: (d.dueDate as string | null) ?? null,
              paymentStatus: (d.paymentStatus as string | null) ?? null,
              lastReconciliation:
                (d.lastReconciliation as DteRow["lastReconciliation"]) ?? null,
              linkedCreditNote:
                (d.linkedCreditNote as
                  | {
                      count: number;
                      hasFullAnnulment: boolean;
                      creditedNet: number;
                      primaryFolio: number;
                    }
                  | null) ?? null,
              voidedByCreditNoteId:
                (d.voidedByCreditNoteId as string | null) ?? null,
              voidedAt: (d.voidedAt as string | null) ?? null,
              creditedNetAmount:
                d.creditedNetAmount != null
                  ? Number(d.creditedNetAmount)
                  : 0,
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
    filters.types,
    filters.siiStatuses,
    filters.paymentStatuses,
    filters.amountMin,
    filters.amountMax,
    filters.onlyCeded,
    filters.onlyWithCreditNotes,
    filters.onlyEmailFailed,
    filters.excludeDrafts,
    debouncedSearch,
    initialDtes,
    issuedTotal,
  ]);

  // Post 2026-05: el server ya devuelve los DTE filtrados y ordenados, así
  // que `filtered` es prácticamente `dtes`. Mantenemos el cliente-sort
  // como red de seguridad porque algunos casos (ej. sort por aging
  // computado) aún no están en el server, y para no romper APIs.
  const filtered = useMemo(() => sortDteRows(dtes, filters.sort), [dtes, filters.sort]);

  const filteredSumTotal = useMemo(
    () =>
      filtered.reduce((acc, d) => {
        // NCs: restan del total (contra-asiento contra facturas).
        if (d.dteType === 61) return acc - d.totalAmount;
        // Anuladas por NC total (CodRef=1): 0 al total.
        if (d.voidedByCreditNoteId) return acc;
        // Parcial por NC (CodRef=3): descontar el bruto acreditado.
        const credited = Number(d.creditedNetAmount ?? 0);
        if (credited > 0 && d.netAmount > 0) {
          const ratio = d.totalAmount / d.netAmount;
          return acc + (d.totalAmount - credited * ratio);
        }
        return acc + d.totalAmount;
      }, 0),
    [filtered],
  );

  // ── Per-row handlers (idénticos al DtesTab original) ──

  // Sanitiza un string para usarlo en un nombre de archivo: acentos quitados,
  // caracteres no [a-zA-Z0-9-_ ] reemplazados por "-", espacios colapsados.
  const sanitizeForFilename = (s: string): string =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9_\s-]/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 60);

  const buildDtePdfFilename = (id: string, folio: number): string => {
    const row = dtes.find((d) => d.id === id);
    const parts: string[] = [`F${folio}`];
    const clientName =
      row?.crmAccount?.name || row?.crmAccount?.legalName || row?.receiverName;
    if (clientName) parts.push(sanitizeForFilename(clientName));
    if (row?.installation?.name)
      parts.push(sanitizeForFilename(row.installation.name));
    return `${parts.join("-")}.pdf`;
  };

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
      a.download = buildDtePdfFilename(id, folio);
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

  const handleCloneDraft = async (id: string) => {
    setCloningDraft(id);
    try {
      const res = await fetch(`/api/finance/billing/drafts/${id}/duplicate`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Error al duplicar borrador");
      }
      const newId = json.data?.id as string | undefined;
      if (!newId) throw new Error("Respuesta inválida del servidor");
      toast.success("Borrador duplicado");
      router.push(`/finanzas/facturacion/emitir?draftId=${newId}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setCloningDraft(null);
    }
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
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Error al emitir borrador");
      }
      toast.success("Borrador emitido al SII");
      // Reportar resultado del auto-send email (lo devuelve issueDte ahora).
      const emailStatus = json?.data?.emailStatus as
        | "sent"
        | "failed"
        | "no_receiver"
        | "skipped"
        | undefined;
      if (emailStatus === "sent") {
        toast.success("Email enviado al receptor");
      } else if (emailStatus === "failed") {
        toast.warning(
          `Email automático no se envió: ${json?.data?.emailError ?? "error desconocido"}. Reenviá manualmente desde la fila.`,
          { duration: 8000 },
        );
      } else if (emailStatus === "no_receiver") {
        toast.warning(
          "No se envió email: el receptor no tiene dirección registrada.",
          { duration: 6000 },
        );
      }
      setIssuingDraft(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setIssuingDraftLoading(false);
    }
  };

  // Confirmación de borrado de borrador. Antes usaba window.confirm() pero
  // algunos navegadores lo bloquean silenciosamente (especialmente cuando el
  // usuario marcó "evitar más diálogos" en una sesión previa), lo que dejaba
  // el botón aparentando que no funcionaba. Ahora abrimos un ConfirmDialog
  // controlado por estado.
  const [draftToDelete, setDraftToDelete] = useState<string | null>(null);

  const handleDeleteDraft = (id: string) => {
    setDraftToDelete(id);
  };

  const confirmDeleteDraft = async () => {
    if (!draftToDelete) return;
    const id = draftToDelete;
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
      setDraftToDelete(null);
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

  const handleUnreconcile = async (id: string) => {
    if (
      !confirm(
        "¿Desconciliar este DTE? Se borrará el link al movimiento bancario. La factura sigue marcada como pagada — usá 'Desmarcar como pagada' por separado si también querés revertir el estado.",
      )
    ) {
      return;
    }
    try {
      const res = await fetch(
        `/api/finance/billing/issued/${id}/unreconcile`,
        { method: "POST" },
      );
      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body.error ?? "Error al desconciliar");
      }
      toast.success("DTE desconciliado");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    }
  };

  const handleMarkUnpaid = async (id: string) => {
    if (
      !confirm(
        "¿Desmarcar este DTE como pagado? Volverá a estado 'Sin pagar'. Si tiene conciliación bancaria, primero hay que desconciliar.",
      )
    ) {
      return;
    }
    try {
      const res = await fetch(
        `/api/finance/billing/issued/${id}/mark-unpaid`,
        { method: "POST" },
      );
      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body.error ?? "Error al desmarcar como pagada");
      }
      toast.success("DTE desmarcado como pagado");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
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
      "Fecha",
      "Tipo",
      "Folio",
      "Receptor",
      "RUT",
      "Neto",
      "IVA",
      "Total",
      "Estado SII",
      "Estado Pago",
      "Cliente",
      "Instalación",
      "Cesión",
    ];
    const csvRows = rows.map((r) => [
      r.date ? formatDateOnlyUtcYmd(new Date(r.date)) : "",
      String(r.dteType),
      r.siiStatus === "DRAFT" ? "" : String(r.folio),
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

      {/* Quick filter: estado de pago + borradores. Radio (solo uno
          activo a la vez). 'Todos' es el reset. */}
      <div className="flex flex-wrap items-center gap-1.5 -mt-1">
        <span className="text-xs font-mono uppercase tracking-wide text-ds-text-4 mr-1">
          Vista:
        </span>
        {[
          { value: "ALL", label: "Todos", tone: "neutral" },
          { value: "UNPAID", label: "Por cobrar", tone: "neutral" },
          { value: "PARTIAL", label: "Parcial", tone: "warn" },
          { value: "PAID", label: "Pagado", tone: "ok" },
          { value: "OVERDUE", label: "Vencido", tone: "danger" },
          { value: "DRAFT", label: "Borradores", tone: "info" },
        ].map((opt) => {
          const active = filters.quickFilter === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setQuickFilter(opt.value as DteFilters["quickFilter"])}
              className={[
                "h-7 px-2.5 rounded-full border text-xs font-medium transition-colors",
                active
                  ? opt.tone === "ok"
                    ? "bg-status-ok-soft border-status-ok-border text-status-ok-fg"
                    : opt.tone === "danger"
                      ? "bg-status-danger-soft border-status-danger-border text-status-danger-fg"
                      : opt.tone === "warn"
                        ? "bg-status-warn-soft border-status-warn-border text-status-warn-fg"
                        : opt.tone === "info"
                          ? "bg-status-info-soft border-status-info-border text-status-info-fg"
                          : "bg-ds-surface-3 border-ds-border-default text-ds-text-1"
                  : "bg-ds-surface-2 border-ds-border-default text-ds-text-3 hover:bg-ds-surface-3",
              ].join(" ")}
              aria-pressed={active}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

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
          {/* Tabla solo en pantallas xl+ (≥1280px). En md/lg (tablet y laptops
              13") la tabla con todas sus columnas (~1340px contenido + paddings)
              hace overflow horizontal y los iconos del extremo derecho se
              cortan. La lista mobile (cards) cabe a partir de mobile chico y
              es la opción legible hasta xl. */}
          <div className="hidden xl:block">
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
              cloningDraft={cloningDraft}
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
              onCloneDraft={handleCloneDraft}
              onUnreconcile={handleUnreconcile}
              onMarkUnpaid={handleMarkUnpaid}
            />
          </div>
          <div className="xl:hidden">
            <IssuedDtesMobileList
              rows={filtered}
              selectedIds={selectedIds}
              onToggleRow={toggleRow}
              canManage={canManage}
              sendingEmail={sendingEmail}
              checkingStatus={checkingStatus}
              voiding={voiding}
              deletingDraft={deletingDraft}
              cloningDraft={cloningDraft}
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
              onCloneDraft={handleCloneDraft}
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
        onCedeFactoring={() => setBulkCedeOpen(true)}
        canResendEmail={canManage}
        canMarkPaid={canManage}
        canSendAs={canManage}
        canCedeFactoring={canManage}
        onSendAs={() => {
          if (selectedIds.size !== 1) return;
          const [dteId] = Array.from(selectedIds);
          const row = dtes.find((d) => d.id === dteId);
          if (!row) return;
          const isDraft = row.siiStatus === "DRAFT";
          setSendAsModal({
            dteId,
            target: isDraft ? "draft" : "issued",
            defaultVariant: isDraft ? "PROFORMA" : "ESTADO_DE_PAGO",
            defaultRecipientEmail: row.receiverEmail ?? null,
            receiverName: row.receiverName,
          });
        }}
      />

      {sendAsModal && (
        <BillingDocSendModal
          open={true}
          onOpenChange={(o) => !o && setSendAsModal(null)}
          dteId={sendAsModal.dteId}
          target={sendAsModal.target}
          defaultVariant={sendAsModal.defaultVariant}
          defaultRecipientEmail={sendAsModal.defaultRecipientEmail}
          receiverName={sendAsModal.receiverName}
          onSent={() => {
            setSendAsModal(null);
            // Refrescar listado para reflejar nuevo proformaStatus.
            setDtes((prev) => prev.slice());
          }}
        />
      )}

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
            receiverEmail: cedeDte.receiverEmail,
            receiverEmailCc: cedeDte.receiverEmailCc ?? [],
            totalAmount: cedeDte.totalAmount,
            date: cedeDte.date,
          }}
        />
      )}

      <BulkCederDteDialog
        open={bulkCedeOpen}
        onOpenChange={setBulkCedeOpen}
        dtes={filtered
          .filter((d) => selectedIds.has(d.id))
          .map((d) => ({
            id: d.id,
            dteType: d.dteType,
            folio: d.folio,
            receiverName: d.receiverName,
            totalAmount: d.totalAmount,
          }))}
        onCompleted={() => {
          clearSelection();
          setBulkCedeOpen(false);
        }}
      />

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
          crmAccountId={emailDte.crmAccountId}
          receiverRut={emailDte.receiverRut}
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

      <ConfirmDialog
        open={draftToDelete !== null}
        onOpenChange={(o) => !o && setDraftToDelete(null)}
        title="Eliminar borrador"
        description="¿Eliminar este borrador? Esta acción no es reversible."
        confirmLabel="Eliminar"
        loading={deletingDraft !== null}
        onConfirm={confirmDeleteDraft}
      />

      {/* FAB mobile para emitir DTE. Solo visible bajo md y cuando el
          BulkActionBar no está activo (que ocupa el bottom). */}
      {canManage && selectedIds.size === 0 && (
        <MobileFAB
          icon={<Plus className="h-5 w-5" />}
          label="Emitir DTE"
          extended
          onClick={() => router.push("/finanzas/facturacion/emitir")}
        />
      )}
    </div>
  );
}
