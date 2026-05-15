"use client";

/**
 * RecibidosClient — listado y gestión de DTEs recibidos.
 *
 * Extraído de FacturacionClient.tsx (que ya pasaba de 2.6k líneas) para
 * mantener cada vista en su propio archivo y permitir migrarla al canon
 * Refined Industrial sin tocar el monolito.
 *
 * Comprende:
 *  - Tabla desktop con DataTable (layout="fixed")
 *  - Cards mobile sobre Surface
 *  - Dialog de detalle (slide-over) + acuse SII
 *  - Dialog de confirmación de acuse (notificar al SII vs. solo OPAI)
 *  - Drawer de filtros estructurados + dialog de registro manual
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Ban,
  Building,
  Download,
  ExternalLink,
  Eye,
  FileCode,
  FileInput,
  FilePlus,
  Loader2,
  MapPin,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import {
  DataTable,
  EmptyState,
  Surface,
  Tag,
  type DataTableColumn,
  type TagVariant,
} from "@/components/opai-ds";
import {
  DocumentTag,
  DtePaymentTag,
  fmtCLP,
  fmtCLPSmart,
  KpiStripReceived,
  buildPeriodOptions,
  sortDteRows,
  DTE_SORT_OPTIONS,
  DTE_TYPE_LABELS,
  DTE_TYPE_SHORT_LABELS,
} from "@/components/finance/dtes";
import type {
  CostCenterOption,
  DteSortKey,
  InstallationOption,
} from "@/components/finance/dtes/shared/types";
import { CostCenterEditor } from "@/components/finance/CostCenterEditor";
import { DteAgingBadge } from "@/components/finance/DteAgingBadge";
import { MobileFAB } from "@/components/finance/mobile";
import { PaginationControls } from "@/components/finance/PaginationControls";

import { useIsMobileViewport } from "@/hooks/useIsMobileViewport";
import { cn } from "@/lib/utils";
import { formatCalendarDateDisplay, formatDateOnlyUtcYmd } from "@/lib/fx-date";

/* ── Tipos locales ── */

interface ReceivedDteLine {
  id: string;
  lineNumber: number;
  itemCode: string | null;
  itemName: string;
  description: string | null;
  quantity: number | string;
  unit: string | null;
  unitPrice: number | string;
  netAmount: number | string;
  isExempt: boolean;
}

export interface ReceivedDteRow {
  id: string;
  dteType: number;
  folio: number;
  issuerRut: string;
  issuerName: string;
  date: string;
  createdAt?: string;
  dueDate: string | null;
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
  receptionStatus: string;
  paymentStatus: string;
  amountPaid: number;
  amountPending: number;
  supplier: { id: string; name: string; rut: string } | null;
  /** Líneas del DTE — pobladas cuando el XML está disponible. */
  lines?: ReceivedDteLine[];
  /** Centro de costo: cliente CRM + instalación. */
  crmAccountId?: string | null;
  installationId?: string | null;
  crmAccount?: { id: string; name: string; legalName: string | null } | null;
  installation?: { id: string; name: string; commune: string | null } | null;
  /** Última conciliación con cartola (post 2026-05). */
  lastReconciliation?: {
    paymentId: string;
    paymentCode: string;
    paymentDate: string;
    paymentStatus: string;
    bankTransactionId: string | null;
    bankTransactionDate: string | null;
    bankTransactionReference: string | null;
    bankTransactionDescription: string | null;
  } | null;
}

interface DteAttachment {
  id: string;
  kind: string;
  filename: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string;
}

export interface SupplierOption {
  id: string;
  rut: string;
  name: string;
}

/* ── Constantes locales ── */

const RECEPTION_STATUS_CONFIG: Record<string, { label: string; variant: TagVariant }> = {
  PENDING_REVIEW: { label: "Pendiente", variant: "warn" },
  ACCEPTED: { label: "Aceptado", variant: "ok" },
  CLAIMED: { label: "Reclamado", variant: "danger" },
  PARTIAL_CLAIM: { label: "Reclamo parcial", variant: "warn" },
};

const PAYMENT_STATUS_CONFIG: Record<string, { label: string; variant: TagVariant }> = {
  UNPAID: { label: "No pagado", variant: "danger" },
  PARTIAL: { label: "Parcial", variant: "warn" },
  PAID: { label: "Pagado", variant: "ok" },
};

const EMPTY_RECEIVED_FORM = {
  dteType: "33",
  folio: "",
  date: "",
  dueDate: "",
  issuerRut: "",
  issuerName: "",
  netAmount: "",
  taxAmount: "",
  totalAmount: "",
  supplierId: "",
  notes: "",
  receptionStatus: "PENDING_REVIEW",
};

/* ── RecibidosClient ── */

interface Props {
  suppliers: SupplierOption[];
  canManage: boolean;
}

export function RecibidosClient({ suppliers, canManage }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [receivedDtes, setReceivedDtes] = useState<ReceivedDteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  // El botón "Registrar DTE" del PageHero navega con ?registrar=1.
  // Cuando llega ese param, abrimos el modal y limpiamos la URL para que
  // refrescos posteriores no lo vuelvan a abrir.
  useEffect(() => {
    if (searchParams.get("registrar") === "1") {
      setDialogOpen(true);
      router.replace("/finanzas/facturacion/recibidos");
    }
  }, [searchParams, router]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_RECEIVED_FORM);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [receptionFilter, setReceptionFilter] = useState("ALL");
  const [paymentFilter, setPaymentFilter] = useState("ALL");
  const [sort, setSort] = useState<DteSortKey>("date_desc");
  const [accountFilter, setAccountFilter] = useState("ALL");
  const [installationFilter, setInstallationFilter] = useState("ALL");
  const [accountOptions, setAccountOptions] = useState<CostCenterOption[]>([]);
  const [installationOptions, setInstallationOptions] = useState<InstallationOption[]>([]);
  const [periodoFilter, setPeriodoFilter] = useState("ALL");
  const periodOptions = useMemo(() => buildPeriodOptions(36), []);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [detailDte, setDetailDte] = useState<ReceivedDteRow | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const activeFilterCount =
    (typeFilter !== "ALL" ? 1 : 0) +
    (receptionFilter !== "ALL" ? 1 : 0) +
    (paymentFilter !== "ALL" ? 1 : 0) +
    (periodoFilter !== "ALL" ? 1 : 0) +
    (accountFilter !== "ALL" ? 1 : 0) +
    (installationFilter !== "ALL" ? 1 : 0);

  const resetFilters = () => {
    setTypeFilter("ALL");
    setReceptionFilter("ALL");
    setPaymentFilter("ALL");
    setPeriodoFilter("ALL");
    setAccountFilter("ALL");
    setInstallationFilter("ALL");
  };

  // Deep link cross-módulo: si llega `?openDteId=...`, abrir el sheet de
  // detalle de ese DTE.
  const requestedDteId = searchParams.get("openDteId");
  useEffect(() => {
    if (!requestedDteId) return;
    const inList = receivedDtes.find((d) => d.id === requestedDteId);
    if (inList) {
      setDetailDte(inList);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/finance/billing/received/${requestedDteId}`,
        );
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled || !json?.success || !json.data) return;
        setDetailDte(json.data as ReceivedDteRow);
      } catch {
        // silencioso
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requestedDteId, receivedDtes]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/finance/billing/accounts-with-dtes?direction=RECEIVED&include=installations")
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        if (body.success) {
          if (Array.isArray(body.data?.accounts)) setAccountOptions(body.data.accounts);
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

  const loadReceivedDtes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (periodoFilter !== "ALL") params.set("periodo", periodoFilter);
      if (accountFilter !== "ALL") params.set("accountId", accountFilter);
      if (installationFilter !== "ALL") params.set("installationId", installationFilter);
      if (debouncedSearch) params.set("search", debouncedSearch);
      params.set("sort", sort);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (typeFilter !== "ALL") params.set("dteType", typeFilter);
      if (receptionFilter !== "ALL") params.set("receptionStatus", receptionFilter);
      if (paymentFilter !== "ALL") params.set("paymentStatus", paymentFilter);
      const res = await fetch(`/api/finance/billing/received?${params.toString()}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      const rawList = Array.isArray(json?.data)
        ? json.data
        : Array.isArray(json?.data?.dtes)
          ? json.data.dtes
          : [];
      // Prisma Decimal se serializa como string en JSON. Si no normalizamos,
      // los reduces de totales hacen concatenación de strings.
      const list: ReceivedDteRow[] = rawList.map((r: Record<string, unknown>) => ({
        ...(r as object),
        netAmount: Number(r.netAmount ?? 0),
        taxAmount: Number(r.taxAmount ?? 0),
        totalAmount: Number(r.totalAmount ?? 0),
        amountPaid: Number(r.amountPaid ?? 0),
        amountPending: Number(r.amountPending ?? 0),
      })) as ReceivedDteRow[];
      setReceivedDtes(list);
      const t =
        typeof json?.data?.pagination?.total === "number"
          ? json.data.pagination.total
          : list.length;
      setTotal(t);
    } catch {
      toast.error("Error al cargar DTEs recibidos");
      setReceivedDtes([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [
    page,
    pageSize,
    periodoFilter,
    accountFilter,
    installationFilter,
    sort,
    debouncedSearch,
    typeFilter,
    receptionFilter,
    paymentFilter,
  ]);

  useEffect(() => { loadReceivedDtes(); }, [loadReceivedDtes]);

  // Reset page=1 cuando cambia el período, filtros o búsqueda.
  useEffect(() => {
    setPage(1);
  }, [
    periodoFilter,
    accountFilter,
    installationFilter,
    sort,
    debouncedSearch,
    typeFilter,
    receptionFilter,
    paymentFilter,
  ]);

  // Post 2026-05: el server ya filtra por type/reception/payment.
  const filtered = useMemo(() => {
    if (!Array.isArray(receivedDtes)) return [];
    return sortDteRows(receivedDtes, sort);
  }, [receivedDtes, sort]);

  const handleExportCsv = () => {
    if (filtered.length === 0) return;
    const header = [
      "Tipo",
      "Folio",
      "Fecha",
      "Vencimiento",
      "Emisor",
      "RUT",
      "Neto",
      "IVA",
      "Total",
      "Pagado",
      "Pendiente",
      "Estado recepción",
      "Estado pago",
    ];
    const rows = filtered.map((r) => [
      String(r.dteType),
      String(r.folio),
      r.date ? formatDateOnlyUtcYmd(new Date(r.date)) : "",
      r.dueDate ? formatDateOnlyUtcYmd(new Date(r.dueDate)) : "",
      JSON.stringify(r.issuerName ?? ""),
      r.issuerRut,
      String(r.netAmount),
      String(r.taxAmount),
      String(r.totalAmount),
      String(r.amountPaid ?? 0),
      String(r.amountPending ?? 0),
      r.receptionStatus ?? "",
      r.paymentStatus ?? "",
    ]);
    const csv = [header, ...rows].map((cols) => cols.join(",")).join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dtes-recibidos-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${filtered.length} DTE(s) exportados.`);
  };

  // Auto-calc total when net or tax changes
  const updateFormField = (field: string, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "netAmount" || field === "taxAmount") {
        const net = parseFloat(next.netAmount) || 0;
        const tax = parseFloat(next.taxAmount) || 0;
        next.totalAmount = String(net + tax);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = {
        dteType: Number(form.dteType),
        folio: Number(form.folio),
        date: form.date,
        dueDate: form.dueDate || null,
        issuerRut: form.issuerRut,
        issuerName: form.issuerName,
        netAmount: parseFloat(form.netAmount) || 0,
        taxAmount: parseFloat(form.taxAmount) || 0,
        totalAmount: parseFloat(form.totalAmount) || 0,
        supplierId: form.supplierId || null,
        notes: form.notes || null,
        receptionStatus: form.receptionStatus,
      };
      const res = await fetch("/api/finance/billing/received", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al registrar DTE recibido");
      }
      toast.success("DTE recibido registrado");
      setDialogOpen(false);
      setForm(EMPTY_RECEIVED_FORM);
      loadReceivedDtes();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-ds-text-3" />
      </div>
    );
  }

  const columns: DataTableColumn<ReceivedDteRow>[] = [
    {
      id: "dteType",
      header: "Tipo",
      width: "w-[100px]",
      cell: (row) => <DocumentTag dteType={row.dteType} />,
    },
    {
      id: "folio",
      header: "Folio",
      width: "w-[88px]",
      cell: (row) => (
        <span className="font-mono tabular-nums text-xs">{row.folio}</span>
      ),
    },
    {
      id: "issuerName",
      header: "Emisor",
      width: "w-[232px]",
      cell: (row) => (
        <div className="min-w-0">
          <div
            className="text-sm font-medium text-ds-text-1 truncate"
            title={row.issuerName}
          >
            {row.issuerName}
          </div>
          <div className="text-xs text-ds-text-4 font-mono tabular-nums truncate">
            {row.issuerRut}
          </div>
        </div>
      ),
    },
    {
      id: "date",
      header: "Fecha",
      width: "w-[88px]",
      cell: (row) => (
        <span className="text-ds-text-3 text-xs font-mono tabular-nums">
          {formatCalendarDateDisplay(row.date, "dd MMM yyyy", es)}
        </span>
      ),
    },
    {
      id: "netAmount",
      header: "Neto",
      align: "right",
      width: "w-[108px]",
      cell: (row) => (
        <span className="font-mono tabular-nums">{fmtCLP.format(row.netAmount)}</span>
      ),
    },
    {
      id: "taxAmount",
      header: "IVA",
      align: "right",
      width: "w-[100px]",
      cell: (row) => (
        <span className="font-mono tabular-nums">{fmtCLP.format(row.taxAmount)}</span>
      ),
    },
    {
      id: "totalAmount",
      header: "Total",
      align: "right",
      width: "w-[120px]",
      cell: (row) => (
        <span className="font-medium font-mono tabular-nums">
          {fmtCLP.format(row.totalAmount)}
        </span>
      ),
    },
    {
      id: "receptionStatus",
      header: "Recepción",
      width: "w-[112px]",
      cell: (row) => {
        const cfg =
          RECEPTION_STATUS_CONFIG[row.receptionStatus] ??
          { label: row.receptionStatus, variant: "neutral" as TagVariant };
        return (
          <Tag variant={cfg.variant} size="sm" dot>
            {cfg.label}
          </Tag>
        );
      },
    },
    {
      id: "paymentStatus",
      header: "Pago",
      width: "w-[132px]",
      cell: (row) => (
        <div className="flex items-center gap-1.5 flex-wrap">
          <DtePaymentTag
            paymentStatus={row.paymentStatus}
            totalAmount={row.totalAmount}
            amountPaid={row.amountPaid}
            amountPending={row.amountPending}
            lastReconciliation={row.lastReconciliation}
          />
          {row.date && row.paymentStatus !== "PAID" && (
            <DteAgingBadge
              date={row.date}
              dueDate={row.dueDate}
              paymentStatus={row.paymentStatus}
              siiStatus="ACCEPTED"
            />
          )}
        </div>
      ),
    },
    {
      id: "centroCosto",
      header: "Centro de costo",
      width: "w-[168px]",
      cell: (row) => {
        if (!row.crmAccount) {
          return <span className="text-xs text-ds-text-4 italic">Sin asignar</span>;
        }
        return (
          <div className="min-w-0 text-xs space-y-0.5">
            <div
              className="flex items-center gap-1 min-w-0"
              title={row.crmAccount.name}
            >
              <Building className="h-3 w-3 shrink-0 text-ds-text-4" />
              <span className="truncate font-medium">{row.crmAccount.name}</span>
            </div>
            {row.installation && (
              <div
                className="flex items-center gap-1 min-w-0 text-ds-text-3"
                title={row.installation.name}
              >
                <MapPin className="h-3 w-3 shrink-0 text-ds-text-4" />
                <span className="truncate">{row.installation.name}</span>
              </div>
            )}
          </div>
        );
      },
    },
    {
      id: "actions",
      header: "",
      align: "right",
      width: "w-[52px]",
      cell: (row) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={(e) => {
            e.stopPropagation();
            setDetailDte(row);
          }}
          aria-label="Ver detalle"
        >
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4 pb-24 md:pb-4">
      <KpiStripReceived
        periodo={periodoFilter}
        accountId={accountFilter}
        installationId={installationFilter}
        onClickTotal={() => router.push("/finanzas/reportes/compras")}
        onClickAccepted={() => setReceptionFilter("ACCEPTED")}
        onClickPending={() => setReceptionFilter("PENDING_REVIEW")}
        onClickClaimed={() => setReceptionFilter("CLAIMED")}
        onClickToPay={() => setPaymentFilter("UNPAID")}
      />

      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ds-text-4" />
          <Input
            placeholder="Buscar por folio, RUT, emisor o monto…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-10"
          />
        </div>

        {/* Filtros (drawer estructurado) */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setFiltersOpen(true)}
          className={cn(
            "h-10 gap-2",
            activeFilterCount > 0 && "border-primary/40 text-primary",
          )}
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span className="hidden sm:inline">Filtros</span>
          {activeFilterCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 rounded-full bg-primary/15 text-primary text-xs font-medium px-1.5">
              {activeFilterCount}
            </span>
          )}
        </Button>

        {/* Sort (desktop) */}
        <div className="hidden md:block">
          <Select value={sort} onValueChange={(v) => setSort(v as DteSortKey)}>
            <SelectTrigger className="w-48 h-10">
              <SelectValue placeholder="Ordenar" />
            </SelectTrigger>
            <SelectContent>
              {DTE_SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Export CSV — descarga lo filtrado actualmente. */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCsv}
          disabled={filtered.length === 0}
          title={filtered.length === 0 ? "No hay datos para exportar" : "Exportar CSV"}
          className="hidden md:inline-flex h-10 w-10 p-0 justify-center"
          aria-label="Exportar"
        >
          <Download className="h-4 w-4" />
        </Button>
      </div>

      {/* Quick filter: estado de pago. Acceso inmediato sin abrir drawer. */}
      <div className="flex flex-wrap items-center gap-1.5 -mt-1">
        <span className="text-xs font-mono uppercase tracking-wide text-ds-text-4 mr-1">
          Pago:
        </span>
        {[
          { value: "ALL", label: "Todos" },
          { value: "UNPAID", label: "Pendiente" },
          { value: "PARTIAL", label: "Parcial" },
          { value: "PAID", label: "Pagado" },
          { value: "OVERDUE", label: "Vencido" },
        ].map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setPaymentFilter(opt.value)}
            className={cn(
              "h-7 px-2.5 rounded-full border text-xs font-medium transition-colors",
              paymentFilter === opt.value
                ? opt.value === "PAID"
                  ? "bg-status-ok-soft border-status-ok-border text-status-ok-fg"
                  : opt.value === "OVERDUE"
                    ? "bg-status-danger-soft border-status-danger-border text-status-danger-fg"
                    : opt.value === "PARTIAL"
                      ? "bg-status-warn-soft border-status-warn-border text-status-warn-fg"
                      : "bg-ds-surface-3 border-ds-border-default text-ds-text-1"
                : "bg-ds-surface-2 border-ds-border-default text-ds-text-3 hover:bg-ds-surface-3",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {typeFilter !== "ALL" && (
            <ActiveChip
              label={`Tipo: ${DTE_TYPE_SHORT_LABELS[Number(typeFilter)] ?? typeFilter}`}
              onRemove={() => setTypeFilter("ALL")}
            />
          )}
          {receptionFilter !== "ALL" && (
            <ActiveChip
              label={`Recepción: ${RECEPTION_STATUS_CONFIG[receptionFilter]?.label ?? receptionFilter}`}
              onRemove={() => setReceptionFilter("ALL")}
            />
          )}
          {paymentFilter !== "ALL" && (
            <ActiveChip
              label={`Pago: ${PAYMENT_STATUS_CONFIG[paymentFilter]?.label ?? paymentFilter}`}
              onRemove={() => setPaymentFilter("ALL")}
            />
          )}
          {periodoFilter !== "ALL" && (
            <ActiveChip
              label={`Período: ${periodOptions.find((p) => p.value === periodoFilter)?.label ?? periodoFilter}`}
              onRemove={() => setPeriodoFilter("ALL")}
            />
          )}
          {accountFilter !== "ALL" && (
            <ActiveChip
              label={`Centro: ${
                accountFilter === "NONE"
                  ? "Sin asignar"
                  : accountOptions.find((a) => a.id === accountFilter)?.name ?? "—"
              }`}
              onRemove={() => setAccountFilter("ALL")}
            />
          )}
          {installationFilter !== "ALL" && (
            <ActiveChip
              label={`Instalación: ${
                installationFilter === "NONE"
                  ? "Sin instalación"
                  : installationOptions.find((i) => i.id === installationFilter)?.name ?? "—"
              }`}
              onRemove={() => setInstallationFilter("ALL")}
            />
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            className="h-7 px-2 text-xs text-ds-text-3 hover:text-ds-text-1"
          >
            Limpiar todo
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-ds-text-3">
        <span className="truncate min-w-0">
          {total > 0
            ? `${filtered.length.toLocaleString("es-CL")} de ${total.toLocaleString("es-CL")} documento(s)`
            : `${filtered.length} documento(s) recibido(s)`}
        </span>
        {filtered.length > 0 && (
          <span className="truncate min-w-0">
            Total filtrado:{" "}
            <strong className="text-ds-text-1 font-mono tabular-nums">
              {fmtCLP.format(filtered.reduce((acc, d) => acc + Number(d.totalAmount ?? 0), 0))}
            </strong>
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={FileInput}
          title="Sin documentos recibidos"
          description="No hay DTEs recibidos registrados."
          action={
            canManage ? (
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                Registrar DTE
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Desktop: tabla */}
          <div className="hidden md:block">
            <DataTable<ReceivedDteRow>
              columns={columns}
              rows={filtered}
              layout="fixed"
              rowKey={(row) => row.id}
              onRowClick={(row) => setDetailDte(row)}
              empty={<EmptyState icon={FileInput} title="Sin documentos recibidos" compact />}
            />
          </div>

          {/* Mobile: cards (paridad con DTEs Emitidos). */}
          <ul className="md:hidden space-y-2 ds-list-cascade">
            {(Array.isArray(filtered) ? filtered : []).map((d) => (
              <ReceivedDteMobileCard
                key={d.id}
                dte={d}
                onClick={() => setDetailDte(d)}
              />
            ))}
          </ul>

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

      <ReceivedDteDetailDialog
        dte={detailDte}
        onClose={() => setDetailDte(null)}
        suppliers={suppliers}
        canManage={canManage}
        onDecided={() => {
          loadReceivedDtes();
        }}
      />

      {/* Filtros estructurados (drawer) — consistente con DTEs Emitidos. */}
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
          <SheetHeader className="px-6 pt-6 pb-3 border-b border-ds-border-subtle">
            <SheetTitle>Filtros</SheetTitle>
            <SheetDescription className="text-xs text-ds-text-3">
              Refiná la lista de DTEs recibidos por tipo, estado y centro de costo.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-ds-text-3">
                Tipo de DTE
              </Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos los tipos</SelectItem>
                  <SelectItem value="33">Factura</SelectItem>
                  <SelectItem value="34">Factura Exenta</SelectItem>
                  <SelectItem value="56">Nota Débito</SelectItem>
                  <SelectItem value="61">Nota Crédito</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-ds-text-3">
                Estado de recepción
              </Label>
              <Select value={receptionFilter} onValueChange={setReceptionFilter}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Recepción" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  {Object.entries(RECEPTION_STATUS_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-ds-text-3">
                Estado de pago
              </Label>
              <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Pago" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  {Object.entries(PAYMENT_STATUS_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-ds-text-3">
                Período
              </Label>
              <Select value={periodoFilter} onValueChange={setPeriodoFilter}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent className="max-h-[400px]">
                  <SelectItem value="ALL">Todos los períodos</SelectItem>
                  {periodOptions.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-ds-text-3">
                Centro de costo
              </Label>
              <Select value={accountFilter} onValueChange={setAccountFilter}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Centro de costo" />
                </SelectTrigger>
                <SelectContent className="max-h-[400px]">
                  <SelectItem value="ALL">Todos los centros</SelectItem>
                  <SelectItem value="NONE">Sin asignar</SelectItem>
                  {accountOptions.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.legalName || a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-ds-text-3">
                Instalación
              </Label>
              <Select value={installationFilter} onValueChange={setInstallationFilter}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Instalación" />
                </SelectTrigger>
                <SelectContent className="max-h-[400px]">
                  <SelectItem value="ALL">Todas las instalaciones</SelectItem>
                  <SelectItem value="NONE">Sin instalación</SelectItem>
                  {installationOptions.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                      {i.commune ? ` · ${i.commune}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-ds-border-subtle px-6 py-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              disabled={activeFilterCount === 0}
            >
              Limpiar
            </Button>
            <Button size="sm" onClick={() => setFiltersOpen(false)}>
              Aplicar
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Dialog: Registrar DTE Recibido */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar DTE recibido</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo DTE</Label>
                <Select value={form.dteType} onValueChange={(v) => updateFormField("dteType", v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="33">Factura</SelectItem>
                    <SelectItem value="34">Factura Exenta</SelectItem>
                    <SelectItem value="56">Nota Débito</SelectItem>
                    <SelectItem value="61">Nota Crédito</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Folio</Label>
                <Input
                  type="number"
                  placeholder="Ej: 1234"
                  value={form.folio}
                  onChange={(e) => updateFormField("folio", e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fecha emisión</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => updateFormField("date", e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label>Fecha vencimiento</Label>
                <Input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => updateFormField("dueDate", e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>RUT emisor</Label>
                <Input
                  placeholder="Ej: 76.123.456-7"
                  value={form.issuerRut}
                  onChange={(e) => updateFormField("issuerRut", e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label>Nombre emisor</Label>
                <Input
                  placeholder="Razón social"
                  value={form.issuerName}
                  onChange={(e) => updateFormField("issuerName", e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Monto neto</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={form.netAmount}
                  onChange={(e) => updateFormField("netAmount", e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label>IVA</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={form.taxAmount}
                  onChange={(e) => updateFormField("taxAmount", e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label>Total</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={form.totalAmount}
                  readOnly
                  className="h-9 bg-ds-surface-2"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Proveedor</Label>
                <Select value={form.supplierId} onValueChange={(v) => updateFormField("supplierId", v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} ({s.rut})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Estado recepción</Label>
                <Select value={form.receptionStatus} onValueChange={(v) => updateFormField("receptionStatus", v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(RECEPTION_STATUS_CONFIG).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea
                placeholder="Observaciones opcionales..."
                value={form.notes}
                onChange={(e) => updateFormField("notes", e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {canManage && (
        <MobileFAB
          icon={<Plus className="h-5 w-5" />}
          label="Registrar DTE"
          extended
          onClick={() => setDialogOpen(true)}
        />
      )}
    </div>
  );
}

/* ── Componentes auxiliares ── */

function ActiveChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 h-7 px-2 pr-1 rounded-md border border-ds-border-default bg-ds-surface-2 text-xs text-ds-text-1">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="h-4 w-4 inline-flex items-center justify-center rounded-sm text-ds-text-3 hover:bg-ds-surface-3 hover:text-ds-text-1"
        aria-label={`Quitar ${label}`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

/**
 * Card mobile para un DTE Recibido. Mismo layout que IssuedDtesMobileList
 * (DTEs Emitidos) para mantener paridad visual entre ambas vistas.
 */
function ReceivedDteMobileCard({
  dte,
  onClick,
}: {
  dte: ReceivedDteRow;
  onClick: () => void;
}) {
  const recCfg =
    RECEPTION_STATUS_CONFIG[dte.receptionStatus] ??
    { label: dte.receptionStatus, variant: "neutral" as TagVariant };
  return (
    <li>
      <Surface elevation={1} padding="sm" tappable onClick={onClick}>
        <div className="flex items-start gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <DocumentTag dteType={dte.dteType} />
              <span className="font-mono tabular-nums text-xs text-ds-text-2">
                #{dte.folio}
              </span>
              <Tag variant={recCfg.variant} size="sm" dot>
                {recCfg.label}
              </Tag>
              <DtePaymentTag
                paymentStatus={dte.paymentStatus}
                totalAmount={dte.totalAmount}
                amountPaid={dte.amountPaid}
                amountPending={dte.amountPending}
                lastReconciliation={dte.lastReconciliation}
              />
              {dte.date && dte.paymentStatus !== "PAID" && (
                <DteAgingBadge
                  date={dte.date}
                  dueDate={dte.dueDate}
                  paymentStatus={dte.paymentStatus}
                  siiStatus="ACCEPTED"
                />
              )}
            </div>
            <p className="text-sm font-medium text-ds-text-1 truncate">
              {dte.issuerName}
            </p>
            <p className="text-xs text-ds-text-4 font-mono tabular-nums">
              {dte.issuerRut}
            </p>
            <div className="flex items-center justify-between gap-2 mt-2">
              <span
                className="font-mono text-sm font-semibold tabular-nums truncate"
                title={dte.totalAmount.toLocaleString("es-CL")}
              >
                {fmtCLPSmart(dte.totalAmount)}
              </span>
              <span className="text-xs text-ds-text-3 shrink-0 font-mono tabular-nums">
                {formatCalendarDateDisplay(dte.date, "dd MMM yyyy", es)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-1 mt-3 pt-3 border-t border-ds-border-subtle">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            className="flex-1 justify-center h-11"
          >
            <Eye className="h-3.5 w-3.5 mr-1.5" />
            Detalle
          </Button>
        </div>
      </Surface>
    </li>
  );
}

/**
 * ReceivedDteDetailDialog — modal de detalle de un DTE recibido.
 *
 * El SII NO expone re-descarga del XML/PDF de DTEs recibidos. El proveedor
 * está obligado a enviarte el XML por email; el documento "vive" en tu
 * correo. Este modal ofrece datos del DTE, link al visor SII y sección de
 * adjuntos para guardar XML/PDF/EML que llegan por mail.
 */
function ReceivedDteDetailDialog({
  dte,
  onClose,
  suppliers,
  canManage,
  onDecided,
}: {
  dte: ReceivedDteRow | null;
  onClose: () => void;
  suppliers: SupplierOption[];
  canManage: boolean;
  /**
   * Callback que se dispara después de un acuse SII exitoso. El caller
   * debe refrescar la lista para que el nuevo `receptionStatus` se vea
   * reflejado en la tabla y filtros.
   */
  onDecided?: () => void;
}) {
  const isMobileViewport = useIsMobileViewport();
  const [attachments, setAttachments] = useState<DteAttachment[]>([]);
  const [loadingAtt, setLoadingAtt] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [acuseLoading, setAcuseLoading] = useState<
    null | "ACCEPT" | "CLAIM_CONTENT" | "CLAIM_PARTIAL" | "CLAIM_TOTAL"
  >(null);
  // IMPORTANTE: este `useState` debe ir junto con los otros hooks ANTES
  // del `if (!dte) return null` para no violar las reglas de hooks.
  const [acusePending, setAcusePending] = useState<{
    action: "ACCEPT" | "CLAIM_CONTENT" | "CLAIM_PARTIAL" | "CLAIM_TOTAL";
    notifySii: boolean;
    reason: string;
  } | null>(null);

  useEffect(() => {
    if (!dte) {
      setAttachments([]);
      return;
    }
    const ctrl = new AbortController();
    setLoadingAtt(true);
    fetch(`/api/finance/billing/dte/${dte.id}/attachments`, {
      signal: ctrl.signal,
    })
      .then((r) => r.json())
      .then((j) => {
        if (j?.success && Array.isArray(j.data)) setAttachments(j.data);
      })
      .catch(() => {})
      .finally(() => setLoadingAtt(false));
    return () => ctrl.abort();
  }, [dte]);

  if (!dte) return null;
  const supplier = suppliers.find((s) => s.rut === dte.issuerRut);

  async function handleUpload(file: File) {
    if (!dte) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error(`Archivo demasiado grande (${Math.round(file.size / 1024)}KB). Máx 5MB.`);
      return;
    }
    setUploading(true);
    try {
      const isXml =
        file.name.toLowerCase().endsWith(".xml") ||
        file.type === "application/xml" ||
        file.type === "text/xml";

      if (isXml) {
        // Ruta especializada: valida identidad SII y backfillea
        // FinanceDteLine desde <Detalle> si el DTE no tenía líneas.
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(
          `/api/finance/billing/received/${dte.id}/attach-xml`,
          { method: "POST", body: fd },
        );
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error ?? "Error al subir XML");
        }
        const refreshed = await fetch(
          `/api/finance/billing/dte/${dte.id}/attachments`,
        );
        const refreshedJson = await refreshed.json();
        if (refreshedJson?.success && Array.isArray(refreshedJson.data)) {
          setAttachments(refreshedJson.data);
        }
        const msg = json.data?.linesBackfilled
          ? `XML adjuntado. ${json.data.linesBackfilled} línea${json.data.linesBackfilled === 1 ? "" : "s"} cargada${json.data.linesBackfilled === 1 ? "" : "s"} del detalle.`
          : "XML adjuntado.";
        toast.success(msg);
        onDecided?.();
      } else {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(`/api/finance/billing/dte/${dte.id}/attachments`, {
          method: "POST",
          body: fd,
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error ?? "Error al subir");
        setAttachments((prev) => [json.data, ...prev]);
        toast.success(`${file.name} adjuntado`);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(attId: string) {
    if (!dte) return;
    if (!confirm("¿Eliminar este adjunto?")) return;
    setDeleting(attId);
    try {
      const res = await fetch(
        `/api/finance/billing/dte/${dte.id}/attachments/${attId}`,
        { method: "DELETE" },
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Error al eliminar");
      setAttachments((prev) => prev.filter((a) => a.id !== attId));
      toast.success("Adjunto eliminado");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDeleting(null);
    }
  }

  function openAcuseConfirm(
    action: "ACCEPT" | "CLAIM_CONTENT" | "CLAIM_PARTIAL" | "CLAIM_TOTAL",
  ) {
    setAcusePending({ action, notifySii: true, reason: "" });
  }

  async function confirmAcuse() {
    if (!dte || !acusePending) return;
    const { action, notifySii, reason } = acusePending;

    setAcuseLoading(action);
    try {
      const res = await fetch(
        `/api/finance/billing/received/${dte.id}/acuse`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            notifySii,
            reason: reason.trim() || undefined,
          }),
        },
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Error al procesar la acción");
      }
      toast.success(json.data?.message ?? "Acción registrada correctamente");
      setAcusePending(null);
      onDecided?.();
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAcuseLoading(null);
    }
  }

  const dateStr = formatCalendarDateDisplay(dte.date, "dd 'de' MMMM yyyy", es);
  const dueStr = dte.dueDate
    ? formatCalendarDateDisplay(dte.dueDate, "dd 'de' MMMM yyyy", es)
    : "Sin fecha de vencimiento";
  const recCfg =
    RECEPTION_STATUS_CONFIG[dte.receptionStatus] ??
    { label: dte.receptionStatus, variant: "neutral" as TagVariant };
  const payCfg =
    PAYMENT_STATUS_CONFIG[dte.paymentStatus] ??
    { label: dte.paymentStatus, variant: "neutral" as TagVariant };
  const siiViewerUrl = `https://www4.sii.cl/consdcvinternetui/#/index`;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side={isMobileViewport ? "bottom" : "right"}
        className={cn(
          "!p-0 flex flex-col w-full",
          isMobileViewport ? "max-h-[92vh] rounded-t-2xl" : "sm:max-w-xl",
        )}
      >
        {isMobileViewport && (
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1.5 rounded-full bg-ds-border-default/60" />
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <FileInput className="h-5 w-5 text-primary" />
              {DTE_TYPE_LABELS[dte.dteType] ?? `Tipo ${dte.dteType}`} N° {dte.folio}
            </SheetTitle>
            <SheetDescription className="sr-only">
              Detalle del DTE recibido: estado de recepción, datos del emisor, montos,
              adjuntos y acuse al SII.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 py-2">
            <div className="flex flex-wrap gap-2">
              <Tag variant={recCfg.variant} size="sm" dot>
                Recepción: {recCfg.label}
              </Tag>
              <Tag variant={payCfg.variant} size="sm" dot>
                Pago: {payCfg.label}
              </Tag>
            </div>

            {/* Botones de Acuse al SII — solo cuando el DTE está
                PENDING_REVIEW y el usuario tiene permisos. */}
            {canManage && dte.receptionStatus === "PENDING_REVIEW" && (
              <Surface
                elevation={1}
                padding="sm"
                className="border-status-info-border bg-status-info-soft space-y-2"
              >
                <p className="text-xs font-medium text-status-info-fg">
                  Acuse al SII
                </p>
                <p className="text-xs text-status-info-fg/80">
                  Notifica oficialmente al SII tu decisión sobre este DTE.
                  Aceptar habilita el uso del crédito IVA. Reclamar antes de
                  los 8 días corridos te permite objetar el documento.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => openAcuseConfirm("ACCEPT")}
                    disabled={acuseLoading !== null}
                    className="h-9"
                  >
                    Aceptar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openAcuseConfirm("CLAIM_CONTENT")}
                    disabled={acuseLoading !== null}
                    className="h-9 border-status-danger-border text-status-danger-fg hover:bg-status-danger-soft"
                  >
                    Reclamar contenido
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openAcuseConfirm("CLAIM_PARTIAL")}
                    disabled={acuseLoading !== null}
                    className="h-9 border-status-warn-border text-status-warn-fg hover:bg-status-warn-soft"
                  >
                    Falta parcial
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openAcuseConfirm("CLAIM_TOTAL")}
                    disabled={acuseLoading !== null}
                    className="h-9 border-status-danger-border text-status-danger-fg hover:bg-status-danger-soft"
                  >
                    Falta total
                  </Button>
                </div>
              </Surface>
            )}

            <Surface elevation={1} padding="sm" className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-ds-text-3">
                Emisor
              </p>
              <p className="font-medium text-ds-text-1">{dte.issuerName}</p>
              <p className="text-sm font-mono tabular-nums text-ds-text-3">
                {dte.issuerRut}
              </p>
              {supplier && (
                <p className="text-xs text-ds-text-3">
                  Proveedor vinculado en OPAI:{" "}
                  <span className="font-medium text-ds-text-1">{supplier.name}</span>
                </p>
              )}
            </Surface>

            {/* Centro de costo */}
            <Surface elevation={1} padding="sm" className="space-y-2">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-xs uppercase tracking-wide text-ds-text-3">
                  Centro de costo
                </p>
                <span className="text-xs text-ds-text-4 italic">
                  Click para editar
                </span>
              </div>
              <p className="text-xs text-ds-text-3 mb-2">
                Cliente e instalación a los que se imputa este gasto. Útil
                para reportes de P&L por instalación.
              </p>
              <CostCenterEditor
                dteId={dte.id}
                currentAccountId={dte.crmAccountId}
                currentAccountName={dte.crmAccount?.name ?? null}
                currentInstallationId={dte.installationId}
                currentInstallationName={dte.installation?.name ?? null}
                canEdit={canManage}
                onChange={() => {
                  // El usuario debe refrescar la lista para ver el cambio.
                }}
              />
            </Surface>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-ds-text-3">
                  Emisión
                </p>
                <p className="text-sm">{dateStr}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-ds-text-3">
                  Vencimiento
                </p>
                <p className="text-sm">{dueStr}</p>
              </div>
            </div>

            <Surface elevation={1} padding="sm" className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-ds-text-3 mb-2">
                Montos
              </p>
              <div className="flex justify-between text-sm">
                <span className="text-ds-text-3">Neto</span>
                <span className="font-mono tabular-nums">{fmtCLP.format(dte.netAmount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-ds-text-3">IVA (19%)</span>
                <span className="font-mono tabular-nums">{fmtCLP.format(dte.taxAmount)}</span>
              </div>
              <div className="flex justify-between text-base font-medium pt-2 border-t border-ds-border-subtle">
                <span>Total</span>
                <span className="font-mono tabular-nums">{fmtCLP.format(dte.totalAmount)}</span>
              </div>
            </Surface>

            {/* Detalle de líneas — disponible solo cuando el XML del DTE
                fue ingerido. */}
            {dte.lines && dte.lines.length > 0 && (
              <Surface elevation={1} padding="sm" className="space-y-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-xs uppercase tracking-wide text-ds-text-3">
                    Detalle del documento
                  </p>
                  <span className="text-xs text-ds-text-3">
                    {dte.lines.length} línea{dte.lines.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-xs">
                    <thead className="text-ds-text-3">
                      <tr className="border-b border-ds-border-subtle">
                        <th className="text-left font-medium pb-1.5 pr-2 w-8">#</th>
                        <th className="text-left font-medium pb-1.5 pr-2">Ítem</th>
                        <th className="text-right font-medium pb-1.5 pr-2">Cant.</th>
                        <th className="text-left font-medium pb-1.5 pr-2">Un.</th>
                        <th className="text-right font-medium pb-1.5 pr-2">P. unit.</th>
                        <th className="text-right font-medium pb-1.5">Neto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dte.lines.map((l) => {
                        const qty = Number(l.quantity);
                        const price = Number(l.unitPrice);
                        const net = Number(l.netAmount);
                        return (
                          <tr key={l.id} className="border-b border-ds-border-subtle/40 last:border-0 align-top">
                            <td className="py-1.5 pr-2 text-ds-text-3 font-mono tabular-nums">
                              {l.lineNumber}
                            </td>
                            <td className="py-1.5 pr-2">
                              <p className="text-sm leading-tight">{l.itemName}</p>
                              {l.itemCode && (
                                <p className="text-xs text-ds-text-3 font-mono mt-0.5">
                                  {l.itemCode}
                                </p>
                              )}
                              {l.description && (
                                <p className="text-xs text-ds-text-3 mt-0.5 line-clamp-2">
                                  {l.description}
                                </p>
                              )}
                              {l.isExempt && (
                                <span className="inline-block mt-0.5 text-xs font-mono uppercase tracking-[0.08em] text-ds-text-4 border border-ds-border-default rounded px-1 py-0.5">
                                  Exenta
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 pr-2 text-right font-mono tabular-nums">
                              {Number.isFinite(qty)
                                ? qty.toLocaleString("es-CL", {
                                    maximumFractionDigits: 2,
                                  })
                                : "—"}
                            </td>
                            <td className="py-1.5 pr-2 text-ds-text-3">
                              {l.unit ?? "—"}
                            </td>
                            <td className="py-1.5 pr-2 text-right font-mono tabular-nums">
                              {Number.isFinite(price)
                                ? fmtCLP.format(price)
                                : "—"}
                            </td>
                            <td className="py-1.5 text-right font-mono tabular-nums">
                              {Number.isFinite(net) ? fmtCLP.format(net) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Surface>
            )}

            {/* Movimiento bancario conciliado — clickeable, deep link al
                drawer de conciliación del módulo Bancos. */}
            {dte.lastReconciliation?.bankTransactionId && (
              <a
                href={`/finanzas/bancos?txId=${dte.lastReconciliation.bankTransactionId}`}
                className="block rounded-ds-lg border border-status-ok-border bg-status-ok-soft p-4 space-y-2 hover:bg-status-ok-soft/70 transition-colors group"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-wide text-status-ok-fg font-medium">
                    Movimiento bancario conciliado
                  </p>
                  <ExternalLink className="h-3.5 w-3.5 text-status-ok-fg opacity-70 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {dte.lastReconciliation.bankTransactionDate && (
                    <div>
                      <p className="text-xs text-status-ok-fg/70 mb-0.5">Fecha</p>
                      <p className="font-mono tabular-nums font-medium text-status-ok-fg">
                        {format(
                          new Date(dte.lastReconciliation.bankTransactionDate),
                          "dd MMM yyyy",
                          { locale: es },
                        )}
                      </p>
                    </div>
                  )}
                  {dte.lastReconciliation.bankTransactionReference && (
                    <div>
                      <p className="text-xs text-status-ok-fg/70 mb-0.5">Referencia</p>
                      <p className="font-mono text-xs text-status-ok-fg truncate">
                        {dte.lastReconciliation.bankTransactionReference}
                      </p>
                    </div>
                  )}
                </div>
                {dte.lastReconciliation.bankTransactionDescription && (
                  <p className="text-sm text-status-ok-fg/90 truncate">
                    {dte.lastReconciliation.bankTransactionDescription}
                  </p>
                )}
                <p className="text-xs text-status-ok-fg/70 italic">
                  Click para ver el movimiento en Bancos →
                </p>
              </a>
            )}

            <Surface
              elevation={1}
              padding="sm"
              className="border-status-info-border bg-status-info-soft text-xs text-status-info-fg"
            >
              <p className="font-medium mb-1">Nota sobre el documento original</p>
              <p>
                El SII no expone re-descarga del XML/PDF de DTEs recibidos. El
                proveedor está obligado a enviarte el XML por email. Subí acá
                el archivo recibido para tenerlo guardado junto al DTE, y/o
                ingresá al visor SII para ver el detalle oficial:
              </p>
            </Surface>

            <Button variant="outline" size="sm" asChild>
              <a href={siiViewerUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Ver en visor SII
              </a>
            </Button>

            {/* Sección de adjuntos */}
            <div className="border-t border-ds-border-subtle pt-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium">Adjuntos</h3>
                  <p className="text-xs text-ds-text-3 mt-0.5">
                    XML, PDF o EML del proveedor (máx 5MB).
                  </p>
                </div>
                {canManage && (
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept=".xml,.pdf,.eml,application/xml,text/xml,application/pdf,message/rfc822,image/png,image/jpeg"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUpload(f);
                        e.target.value = "";
                      }}
                      disabled={uploading}
                    />
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md border border-ds-border-default px-2.5 py-1.5 text-xs font-medium transition-colors",
                        uploading
                          ? "bg-ds-surface-2 text-ds-text-3 cursor-wait"
                          : "bg-ds-surface-1 hover:bg-ds-surface-2",
                      )}
                    >
                      {uploading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FilePlus className="h-3.5 w-3.5" />
                      )}
                      {uploading ? "Subiendo…" : "Adjuntar archivo"}
                    </span>
                  </label>
                )}
              </div>

              {loadingAtt ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin text-ds-text-3" />
                </div>
              ) : attachments.length === 0 ? (
                <p className="text-xs text-ds-text-3 italic py-3 text-center">
                  Sin adjuntos. Si el proveedor te envió el XML por email,
                  subilo acá.
                </p>
              ) : (
                <ul className="divide-y divide-ds-border-subtle rounded-ds-lg border border-ds-border-default">
                  {attachments.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-2 p-2.5"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <FileCode className="h-4 w-4 text-ds-text-3 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm truncate" title={a.filename}>
                            {a.filename}
                          </p>
                          <p className="text-xs text-ds-text-3">
                            {a.kind} · {Math.round(a.size / 1024)} KB ·{" "}
                            {format(new Date(a.uploadedAt), "dd MMM yyyy HH:mm", {
                              locale: es,
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          asChild
                        >
                          <a
                            href={`/api/finance/billing/dte/${dte.id}/attachments/${a.id}`}
                            download={a.filename}
                            aria-label={`Descargar ${a.filename}`}
                          >
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                        {canManage && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-status-danger-fg hover:text-status-danger-fg"
                            onClick={() => handleDelete(a.id)}
                            disabled={deleting === a.id}
                            aria-label={`Eliminar ${a.filename}`}
                          >
                            {deleting === a.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Ban className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
        <div className="border-t border-ds-border-subtle px-6 py-3 flex items-center justify-between gap-2 shrink-0">
          <Button variant="outline" size="sm" asChild className="gap-1.5">
            <a href={siiViewerUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              Ver en SII
            </a>
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </SheetContent>

      <AcuseConfirmDialog
        pending={acusePending}
        loading={acuseLoading !== null}
        dteFolio={dte.folio}
        dteIssuer={dte.issuerName}
        onChange={(p) => setAcusePending(p)}
        onConfirm={confirmAcuse}
        onCancel={() => setAcusePending(null)}
      />
    </Sheet>
  );
}

/**
 * Modal de confirmación de Acuse al SII para DTEs recibidos.
 *
 * Por default `notifySii=true`. Si destildea, la operación queda solo
 * registrada localmente en OPAI sin tocar el SII — útil para validaciones
 * internas o para marcar facturas legítimas que ya fueron aceptadas por
 * otro canal.
 */
function AcuseConfirmDialog({
  pending,
  loading,
  dteFolio,
  dteIssuer,
  onChange,
  onConfirm,
  onCancel,
}: {
  pending: {
    action: "ACCEPT" | "CLAIM_CONTENT" | "CLAIM_PARTIAL" | "CLAIM_TOTAL";
    notifySii: boolean;
    reason: string;
  } | null;
  loading: boolean;
  dteFolio: number;
  dteIssuer: string;
  onChange: (
    p: {
      action: "ACCEPT" | "CLAIM_CONTENT" | "CLAIM_PARTIAL" | "CLAIM_TOTAL";
      notifySii: boolean;
      reason: string;
    } | null,
  ) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!pending) return null;

  const actionMeta: Record<
    typeof pending.action,
    { title: string; verb: string; tone: "ok" | "warn" | "danger" }
  > = {
    ACCEPT: {
      title: "Aceptar factura recibida",
      verb: "ACEPTAR",
      tone: "ok",
    },
    CLAIM_CONTENT: {
      title: "Reclamar contenido del DTE",
      verb: "RECLAMAR el contenido (RCD)",
      tone: "danger",
    },
    CLAIM_PARTIAL: {
      title: "Reportar falta parcial de mercaderías",
      verb: "reportar FALTA PARCIAL (RFP)",
      tone: "warn",
    },
    CLAIM_TOTAL: {
      title: "Reportar falta total de mercaderías",
      verb: "reportar FALTA TOTAL (RFT)",
      tone: "danger",
    },
  };
  const meta = actionMeta[pending.action];
  const showReason = pending.action !== "ACCEPT";

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{meta.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-ds-text-3">
            Estás por <span className="font-semibold text-ds-text-1">{meta.verb}</span>{" "}
            la factura folio{" "}
            <span className="font-mono tabular-nums text-ds-text-1">{dteFolio}</span>{" "}
            de <span className="font-medium text-ds-text-1">{dteIssuer}</span>.
          </p>

          {/* Toggle Notificar al SII */}
          <div
            className={cn(
              "rounded-ds-lg border p-3",
              pending.notifySii
                ? "border-status-info-border bg-status-info-soft"
                : "border-ds-border-default bg-ds-surface-2",
            )}
          >
            <div className="flex items-start gap-3">
              <Switch
                checked={pending.notifySii}
                onCheckedChange={(v) =>
                  onChange({ ...pending, notifySii: v })
                }
                disabled={loading}
                className="mt-0.5"
                aria-label="Notificar al SII"
              />
              <div className="flex-1 min-w-0">
                <Label className="text-sm font-medium cursor-pointer">
                  Notificar al SII (Servicio de Impuestos Internos)
                </Label>
                <p className="text-xs text-ds-text-3 mt-1">
                  {pending.notifySii ? (
                    <>
                      Se enviará la decisión al SII vía SimpleAPI.{" "}
                      <span className="font-medium text-status-danger-fg">
                        Esta acción es IRREVERSIBLE legalmente.
                      </span>{" "}
                      {pending.action === "ACCEPT" &&
                        "Aceptar habilita el uso del crédito IVA."}
                    </>
                  ) : (
                    <>
                      Solo se cambiará el estado en OPAI como clasificación
                      interna. <span className="font-medium">No se tocará el SII</span>.
                      Útil para marcar facturas que ya fueron acusadas por
                      otro canal o para clasificación administrativa interna.
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>

          {showReason && (
            <div className="space-y-1.5">
              <Label className="text-sm">
                Motivo del reclamo{" "}
                <span className="text-xs font-normal text-ds-text-3">
                  (opcional, se guarda en notas)
                </span>
              </Label>
              <Textarea
                value={pending.reason}
                onChange={(e) =>
                  onChange({ ...pending, reason: e.target.value })
                }
                disabled={loading}
                rows={3}
                placeholder="Ej: Productos no recibidos en bodega, montos no coinciden con OC..."
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              meta.tone === "ok" && "bg-status-ok-fg hover:bg-status-ok-fg/90",
              meta.tone === "danger" &&
                "bg-status-danger-fg hover:bg-status-danger-fg/90 text-white",
              meta.tone === "warn" &&
                "bg-status-warn-fg hover:bg-status-warn-fg/90",
            )}
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            {pending.notifySii
              ? "Confirmar y notificar al SII"
              : "Confirmar (solo OPAI)"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
