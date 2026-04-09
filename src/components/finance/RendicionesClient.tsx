"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DateRangePicker, type DateRange } from "@/components/ui/date-range-picker";
import { PagosTab } from "@/components/finance/PagosTab";
import type { Payment, PendingRendicion } from "@/components/finance/PagosTab";
import { EmptyState, DataTable, type DataTableColumn } from "@/components/opai";
import {
  Plus,
  Receipt,
  Car,
  CheckCircle2,
  XCircle,
  Wallet,
  Loader2,
  CreditCard,
  Landmark,
  ArrowRight,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Types ── */

interface RendicionRow {
  id: string;
  code: string;
  date: string;
  type: string;
  amount: number;
  status: string;
  description: string | null;
  itemName: string | null;
  costCenterName: string | null;
  submitterName: string;
  submitterId: string;
  beneficiaryName: string | null;
  createdAt: string;
}

interface ItemOption {
  id: string;
  name: string;
}

interface RendicionesClientProps {
  rendiciones: RendicionRow[];
  items: ItemOption[];
  canSubmit: boolean;
  canApprove: boolean;
  canPay: boolean;
  currentUserId: string;
  payments: Payment[];
  pendingRendiciones: PendingRendicion[];
}

/* ── Constants ── */

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  DRAFT: {
    label: "Borrador",
    className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  },
  SUBMITTED: {
    label: "Enviada",
    className: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  },
  IN_APPROVAL: {
    label: "En aprobación",
    className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
  APPROVED: {
    label: "Aprobada",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  REJECTED: {
    label: "Rechazada",
    className: "bg-red-500/15 text-red-400 border-red-500/30",
  },
  PAID: {
    label: "Pagada",
    className: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  },
};

const TYPE_LABELS: Record<string, string> = {
  PURCHASE: "Compra",
  MILEAGE: "Kilometraje",
};

const STATUS_TABS = [
  { value: "ALL", label: "Todos" },
  { value: "SUBMITTED", label: "Enviadas" },
  { value: "IN_APPROVAL", label: "En aprobación" },
  { value: "APPROVED", label: "Aprobadas" },
  { value: "REJECTED", label: "Rechazadas" },
  { value: "PAID", label: "Pagadas" },
];

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

function extractFilenameFromDisposition(
  contentDisposition: string | null,
  fallback: string
): string {
  if (!contentDisposition) return fallback;
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }
  const asciiMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return asciiMatch?.[1] ?? fallback;
}

const isSelectable = (status: string) =>
  ["SUBMITTED", "IN_APPROVAL", "APPROVED"].includes(status);

/* ── Inner Component ── */

function RendicionesClientInner({
  rendiciones,
  items,
  canSubmit,
  canApprove,
  canPay,
  currentUserId,
  payments,
  pendingRendiciones,
}: RendicionesClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Tab state
  const [activeTab, setActiveTab] = useState<"rendiciones" | "pagos">(
    searchParams.get("tab") === "pagos" ? "pagos" : "rendiciones"
  );

  // Filter state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [submitterFilter, setSubmitterFilter] = useState("ALL");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Bulk action dialogs
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [bulkComment, setBulkComment] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [paymentType, setPaymentType] = useState("MANUAL");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [processing, setProcessing] = useState(false);

  /* ── Derived: submitter options ── */

  const submitters = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rendiciones) map.set(r.submitterId, r.submitterName);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rendiciones]);

  /* ── Filtering ── */

  const filtered = useMemo(() => {
    let list = rendiciones;
    if (statusFilter !== "ALL") list = list.filter((r) => r.status === statusFilter);
    if (submitterFilter !== "ALL") list = list.filter((r) => r.submitterId === submitterFilter);
    if (dateRange?.from) list = list.filter((r) => new Date(r.date) >= dateRange.from!);
    if (dateRange?.to) list = list.filter((r) => new Date(r.date) <= dateRange.to!);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.code.toLowerCase().includes(q) ||
          r.description?.toLowerCase().includes(q) ||
          r.submitterName.toLowerCase().includes(q) ||
          r.itemName?.toLowerCase().includes(q) ||
          r.beneficiaryName?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [rendiciones, statusFilter, submitterFilter, dateRange, search]);

  const clearFilters = useCallback(() => {
    setSearch("");
    setStatusFilter("ALL");
    setSubmitterFilter("ALL");
    setDateRange(undefined);
  }, []);

  const hasActiveFilters =
    statusFilter !== "ALL" ||
    submitterFilter !== "ALL" ||
    !!dateRange ||
    search.trim() !== "";

  /* ── Selection ── */

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    const selectableIds = filtered.filter((r) => isSelectable(r.status)).map((r) => r.id);
    const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableIds));
    }
  }, [filtered, selectedIds]);

  const selectedRendiciones = useMemo(
    () => rendiciones.filter((r) => selectedIds.has(r.id)),
    [rendiciones, selectedIds]
  );

  const selectedAmount = useMemo(
    () => selectedRendiciones.reduce((sum, r) => sum + r.amount, 0),
    [selectedRendiciones]
  );

  const selectedApprovable = useMemo(
    () => selectedRendiciones.filter((r) => ["SUBMITTED", "IN_APPROVAL"].includes(r.status)),
    [selectedRendiciones]
  );

  const selectedPayable = useMemo(
    () => selectedRendiciones.filter((r) => r.status === "APPROVED"),
    [selectedRendiciones]
  );

  const beneficiarySummary = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number }>();
    for (const r of selectedPayable) {
      const name = r.beneficiaryName || r.submitterName;
      const entry = map.get(name) ?? { name, total: 0, count: 0 };
      entry.total += r.amount;
      entry.count += 1;
      map.set(name, entry);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [selectedPayable]);

  /* ── "Pagar aprobadas" shortcut ── */

  const approvedCount = rendiciones.filter((r) => r.status === "APPROVED").length;

  const handlePayApproved = useCallback(() => {
    setStatusFilter("APPROVED");
    const approvedIds = rendiciones.filter((r) => r.status === "APPROVED").map((r) => r.id);
    setSelectedIds(new Set(approvedIds));
  }, [rendiciones]);

  /* ── Bulk Actions ── */

  const handleBulkApprove = useCallback(async () => {
    if (selectedApprovable.length === 0) return;
    setProcessing(true);
    try {
      const res = await fetch("/api/finance/rendiciones/bulk-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rendicionIds: selectedApprovable.map((r) => r.id),
          comment: bulkComment || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Error al aprobar");

      toast.success(`${selectedApprovable.length} rendición(es) aprobada(s)`);
      setApproveDialogOpen(false);
      setBulkComment("");
      setSelectedIds(new Set());
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al aprobar");
    } finally {
      setProcessing(false);
    }
  }, [selectedApprovable, bulkComment, router]);

  const handleBulkReject = useCallback(async () => {
    if (selectedApprovable.length === 0 || !rejectReason.trim()) return;
    setProcessing(true);
    try {
      const res = await fetch("/api/finance/rendiciones/bulk-reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rendicionIds: selectedApprovable.map((r) => r.id),
          reason: rejectReason,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Error al rechazar");

      toast.success(`${selectedApprovable.length} rendición(es) rechazada(s)`);
      setRejectDialogOpen(false);
      setRejectReason("");
      setSelectedIds(new Set());
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al rechazar");
    } finally {
      setProcessing(false);
    }
  }, [selectedApprovable, rejectReason, router]);

  const handleCreatePayment = useCallback(async () => {
    if (selectedPayable.length === 0) return;
    setProcessing(true);
    try {
      const res = await fetch("/api/finance/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: paymentType,
          rendicionIds: selectedPayable.map((r) => r.id),
          notes: paymentNotes || undefined,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        data?: { id?: string; code?: string };
      };
      if (!res.ok) throw new Error(data.error || "Error al crear pago");

      const paymentId = data.data?.id;
      const paymentCode = data.data?.code ?? "sin-codigo";

      if (paymentType === "BATCH_SANTANDER" && paymentId) {
        const exportRes = await fetch(
          `/api/finance/payments/${paymentId}/export-santander`,
          { method: "GET" }
        );
        if (exportRes.ok) {
          const blob = await exportRes.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = extractFilenameFromDisposition(
            exportRes.headers.get("Content-Disposition"),
            `${paymentCode}-santander.xlsx`
          );
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          toast.success(
            `Pago ${paymentCode} creado y archivo Santander descargado`
          );
        } else {
          toast.success(
            `Pago ${paymentCode} creado (no se pudo descargar archivo Santander)`
          );
        }
      } else {
        toast.success(
          `Pago ${paymentCode} creado con ${selectedPayable.length} rendición(es)`
        );
      }

      setPayDialogOpen(false);
      setPaymentNotes("");
      setSelectedIds(new Set());
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear pago");
    } finally {
      setProcessing(false);
    }
  }, [selectedPayable, paymentType, paymentNotes, router]);

  /* ── Table columns ── */

  const showSelection = canApprove || canPay;

  const tableColumns: DataTableColumn[] = useMemo(
    () => [
      ...(showSelection
        ? [
            {
              key: "_select",
              label: "",
              className: "w-10",
              render: (_: unknown, row: RendicionRow) => {
                if (!isSelectable(row.status)) return <div className="w-4" />;
                return (
                  <div
                    role="checkbox"
                    aria-checked={selectedIds.has(row.id)}
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelect(row.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === " " || e.key === "Enter") {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleSelect(row.id);
                      }
                    }}
                    className={cn(
                      "h-4 w-4 rounded border flex items-center justify-center cursor-pointer shrink-0",
                      selectedIds.has(row.id)
                        ? "bg-primary border-primary"
                        : "border-muted-foreground/40 hover:border-muted-foreground"
                    )}
                  >
                    {selectedIds.has(row.id) && (
                      <svg
                        className="h-3 w-3 text-primary-foreground"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                );
              },
            } satisfies DataTableColumn,
          ]
        : []),
      {
        key: "code",
        label: "Código",
        render: (value: string, row: RendicionRow) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/finanzas/rendiciones/${row.id}`);
            }}
            className="font-mono text-xs text-primary underline hover:text-primary/80"
          >
            {value}
          </button>
        ),
      },
      {
        key: "date",
        label: "Fecha",
        render: (value: string) => (
          <span className="text-muted-foreground">
            {format(new Date(value), "dd MMM yyyy", { locale: es })}
          </span>
        ),
      },
      {
        key: "type",
        label: "Tipo",
        render: (value: string) => (
          <span className="inline-flex items-center gap-1 text-xs">
            {value === "MILEAGE" ? (
              <Car className="h-3 w-3" />
            ) : (
              <Receipt className="h-3 w-3" />
            )}
            {TYPE_LABELS[value] ?? value}
          </span>
        ),
      },
      {
        key: "itemName",
        label: "Ítem",
        render: (value: string | null) => (
          <span className="text-muted-foreground">{value ?? "—"}</span>
        ),
      },
      {
        key: "description",
        label: "Motivo",
        render: (value: string | null) =>
          value ? (
            <span
              className="text-muted-foreground text-xs max-w-[150px] truncate block"
              title={value}
            >
              {value}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        key: "amount",
        label: "Monto",
        className: "text-right",
        render: (value: number) => (
          <span className="font-medium tabular-nums">
            {fmtCLP.format(value)}
          </span>
        ),
      },
      {
        key: "status",
        label: "Estado",
        render: (value: string) => {
          const statusCfg = STATUS_CONFIG[value] ?? {
            label: value,
            className: "bg-muted text-muted-foreground",
          };
          return (
            <Badge className={statusCfg.className}>{statusCfg.label}</Badge>
          );
        },
      },
      {
        key: "submitterName",
        label: "Solicitante",
        render: (value: string) => (
          <span className="text-muted-foreground text-xs">{value}</span>
        ),
      },
      {
        key: "beneficiaryName",
        label: "Destinatario",
        render: (value: string | null) =>
          value ? (
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <ArrowRight className="h-3 w-3" />
              {value}
            </span>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          ),
      },
    ],
    [showSelection, selectedIds, toggleSelect, router]
  );

  return (
    <div className={cn("space-y-4", selectedIds.size > 0 && "pb-20")}>
      {/* ── Tabs: Rendiciones | Pagos ── */}
      <div className="flex gap-1 border-b border-border pb-2">
        {([
          { value: "rendiciones" as const, label: "Rendiciones", count: rendiciones.length },
          { value: "pagos" as const, label: "Pagos", count: payments.length },
        ]).map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors relative",
              activeTab === tab.value
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            <span
              className={cn(
                "ml-1.5 text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center",
                activeTab === tab.value
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {tab.count}
            </span>
            {activeTab === tab.value && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary -mb-2" />
            )}
          </button>
        ))}
      </div>

      {/* ── Tab: Rendiciones ── */}
      {activeTab === "rendiciones" && (
        <>
          {/* Filters row */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar código, descripción, solicitante..."
                className="pl-9 h-9 bg-background text-foreground border-input"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Select value={submitterFilter} onValueChange={setSubmitterFilter}>
                <SelectTrigger className="h-9 w-[160px] text-xs">
                  <SelectValue placeholder="Solicitante" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  {submitters.map(([id, name]) => (
                    <SelectItem key={id} value={id}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DateRangePicker
                value={dateRange}
                onChange={setDateRange}
                placeholder="Rango de fechas"
              />
              {canSubmit && (
                <Link href="/finanzas/rendiciones/nueva">
                  <Button size="icon" variant="secondary" className="h-9 w-9 shrink-0">
                    <Plus className="h-4 w-4" />
                    <span className="sr-only">Nueva rendición</span>
                  </Button>
                </Link>
              )}
            </div>
          </div>

          {/* Status pills */}
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
            {STATUS_TABS.map((tab) => {
              const count =
                tab.value === "ALL"
                  ? rendiciones.length
                  : rendiciones.filter((r) => r.status === tab.value).length;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setStatusFilter(tab.value)}
                  className={cn(
                    "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors shrink-0 flex items-center gap-1.5",
                    statusFilter === tab.value
                      ? "bg-primary/15 text-primary border border-primary/30"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground border border-transparent"
                  )}
                >
                  {tab.label}
                  <span
                    className={cn(
                      "text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center",
                      statusFilter === tab.value
                        ? "bg-primary/20 text-primary"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* "Pagar aprobadas" button */}
          {canPay && approvedCount > 0 && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={handlePayApproved}>
                <Wallet className="h-3.5 w-3.5 mr-1.5" />
                Pagar aprobadas ({approvedCount})
              </Button>
            </div>
          )}

          {/* Count */}
          <p className="text-xs text-muted-foreground">
            {filtered.length} rendición(es)
          </p>

          {/* Table / empty */}
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Receipt className="h-10 w-10" />}
              title="Sin rendiciones"
              description={
                hasActiveFilters
                  ? "No se encontraron rendiciones con los filtros seleccionados."
                  : "No hay rendiciones registradas aún."
              }
              action={
                canSubmit && !hasActiveFilters ? (
                  <Link href="/finanzas/rendiciones/nueva">
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-1.5" />
                      Crear rendición
                    </Button>
                  </Link>
                ) : hasActiveFilters ? (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    Limpiar filtros
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block">
                <DataTable
                  columns={tableColumns}
                  data={filtered}
                  onRowClick={(row) =>
                    isSelectable(row.status) ? toggleSelect(row.id) : undefined
                  }
                  compact
                />
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-2">
                {filtered.map((r) => {
                  const statusCfg = STATUS_CONFIG[r.status] ?? {
                    label: r.status,
                    className: "bg-muted text-muted-foreground",
                  };
                  const selectable = isSelectable(r.status);
                  const isSelected = selectedIds.has(r.id);
                  return (
                    <div
                      key={r.id}
                      role={selectable ? "button" : undefined}
                      tabIndex={selectable ? 0 : undefined}
                      onClick={selectable ? () => toggleSelect(r.id) : undefined}
                      className={cn(
                        "rounded-lg border border-border p-3 transition-colors",
                        selectable && "cursor-pointer hover:bg-accent/30",
                        isSelected && "border-primary/40 bg-primary/5"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {showSelection && selectable && (
                              <div
                                className={cn(
                                  "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                                  isSelected
                                    ? "bg-primary border-primary"
                                    : "border-muted-foreground/40"
                                )}
                              >
                                {isSelected && (
                                  <svg
                                    className="h-3 w-3 text-primary-foreground"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={3}
                                  >
                                    <path d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/finanzas/rendiciones/${r.id}`);
                              }}
                              className="font-mono text-xs text-primary underline hover:text-primary/80"
                            >
                              {r.code}
                            </button>
                            <Badge className={cn("text-[10px]", statusCfg.className)}>
                              {statusCfg.label}
                            </Badge>
                          </div>
                          <p className="text-sm font-medium truncate">
                            {r.description || r.itemName || TYPE_LABELS[r.type]}
                          </p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span>{format(new Date(r.date), "dd MMM yyyy", { locale: es })}</span>
                            <span>·</span>
                            <span className="inline-flex items-center gap-1">
                              {r.type === "MILEAGE" ? <Car className="h-3 w-3" /> : <Receipt className="h-3 w-3" />}
                              {TYPE_LABELS[r.type]}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span>{r.submitterName}</span>
                            {r.beneficiaryName && (
                              <span className="text-emerald-400">
                                → {r.beneficiaryName}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-sm font-semibold tabular-nums shrink-0">
                          {fmtCLP.format(r.amount)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* ── Tab: Pagos ── */}
      {activeTab === "pagos" && (
        <PagosTab payments={payments} pendingRendiciones={pendingRendiciones} />
      )}

      {/* ── Sticky bottom action bar ── */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-sm px-4 py-3 md:left-[var(--sidebar-width,0px)]">
          <div className="mx-auto max-w-screen-xl flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-sm">
              <button
                type="button"
                onClick={toggleSelectAll}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                {filtered.filter((r) => isSelectable(r.status)).every((r) => selectedIds.has(r.id))
                  ? "Deseleccionar todo"
                  : "Seleccionar todo"}
              </button>
              <span className="text-muted-foreground">
                {selectedIds.size} seleccionada(s) ={" "}
                <span className="font-medium text-foreground">
                  {fmtCLP.format(selectedAmount)}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              {canApprove && selectedApprovable.length > 0 && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                    onClick={() => setApproveDialogOpen(true)}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                    Aprobar ({selectedApprovable.length})
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-400 border-red-500/30 hover:bg-red-500/10"
                    onClick={() => setRejectDialogOpen(true)}
                  >
                    <XCircle className="h-3.5 w-3.5 mr-1.5" />
                    Rechazar ({selectedApprovable.length})
                  </Button>
                </>
              )}
              {canPay && selectedPayable.length > 0 && (
                <Button
                  size="sm"
                  onClick={() => setPayDialogOpen(true)}
                >
                  <Wallet className="h-3.5 w-3.5 mr-1.5" />
                  Crear pago ({selectedPayable.length})
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Approve dialog ── */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aprobar rendiciones</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Rendiciones a aprobar</span>
                <span className="font-medium">{selectedApprovable.length}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-muted-foreground">Monto total</span>
                <span className="font-semibold">
                  {fmtCLP.format(selectedApprovable.reduce((s, r) => s + r.amount, 0))}
                </span>
              </div>
            </div>

            {selectedRendiciones.length > selectedApprovable.length && (
              <p className="text-xs text-amber-400">
                {selectedRendiciones.length - selectedApprovable.length} rendición(es)
                seleccionada(s) no están en estado aprobable y serán ignoradas.
              </p>
            )}

            <div className="max-h-40 overflow-y-auto space-y-1">
              {selectedApprovable.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-xs py-1">
                  <span className="text-muted-foreground">
                    {r.code} — {r.submitterName}
                  </span>
                  <span className="tabular-nums">{fmtCLP.format(r.amount)}</span>
                </div>
              ))}
            </div>

            <div>
              <Label htmlFor="approveComment">Comentario (opcional)</Label>
              <textarea
                id="approveComment"
                value={bulkComment}
                onChange={(e) => setBulkComment(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Comentario de aprobación..."
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setApproveDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleBulkApprove}
                disabled={processing}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {processing ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                )}
                Aprobar {selectedApprovable.length}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Reject dialog ── */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar rendiciones</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Rendiciones a rechazar</span>
                <span className="font-medium">{selectedApprovable.length}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-muted-foreground">Monto total</span>
                <span className="font-semibold">
                  {fmtCLP.format(selectedApprovable.reduce((s, r) => s + r.amount, 0))}
                </span>
              </div>
            </div>

            <div className="max-h-40 overflow-y-auto space-y-1">
              {selectedApprovable.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-xs py-1">
                  <span className="text-muted-foreground">
                    {r.code} — {r.submitterName}
                  </span>
                  <span className="tabular-nums">{fmtCLP.format(r.amount)}</span>
                </div>
              ))}
            </div>

            <div>
              <Label htmlFor="rejectReason">Motivo de rechazo *</Label>
              <textarea
                id="rejectReason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Indica el motivo del rechazo..."
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setRejectDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={handleBulkReject}
                disabled={processing || !rejectReason.trim()}
              >
                {processing ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4 mr-1.5" />
                )}
                Rechazar {selectedApprovable.length}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Payment dialog ── */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Crear pago</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-muted/30 border border-border">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Rendiciones</span>
                <span>{selectedPayable.length}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-muted-foreground">Monto total</span>
                <span className="font-semibold">
                  {fmtCLP.format(selectedPayable.reduce((s, r) => s + r.amount, 0))}
                </span>
              </div>
            </div>

            {selectedRendiciones.length > selectedPayable.length && (
              <p className="text-xs text-amber-400">
                {selectedRendiciones.length - selectedPayable.length} rendición(es)
                seleccionada(s) no están aprobadas y serán ignoradas.
              </p>
            )}

            {/* Beneficiary summary */}
            {beneficiarySummary.length > 0 && (
              <div>
                <Label className="text-xs text-muted-foreground">Resumen por destinatario</Label>
                <div className="mt-1.5 space-y-1 max-h-32 overflow-y-auto">
                  {beneficiarySummary.map((b) => (
                    <div
                      key={b.name}
                      className="flex items-center justify-between text-xs py-1 px-2 rounded bg-muted/20"
                    >
                      <span>
                        {b.name}
                        <span className="text-muted-foreground ml-1">
                          ({b.count})
                        </span>
                      </span>
                      <span className="font-medium tabular-nums">
                        {fmtCLP.format(b.total)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <Label>Tipo de pago</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setPaymentType("MANUAL")}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border p-3 text-left transition-colors text-sm",
                    paymentType === "MANUAL"
                      ? "border-primary/50 bg-primary/10"
                      : "border-border hover:bg-accent/30"
                  )}
                >
                  <CreditCard className="h-4 w-4" />
                  Manual
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentType("BATCH_SANTANDER")}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border p-3 text-left transition-colors text-sm",
                    paymentType === "BATCH_SANTANDER"
                      ? "border-primary/50 bg-primary/10"
                      : "border-border hover:bg-accent/30"
                  )}
                >
                  <Landmark className="h-4 w-4" />
                  Santander
                </button>
              </div>
            </div>

            <div>
              <Label htmlFor="paymentNotes">Notas (opcional)</Label>
              <textarea
                id="paymentNotes"
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                rows={2}
                placeholder="Observaciones del pago..."
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setPayDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button onClick={handleCreatePayment} disabled={processing}>
                {processing ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Wallet className="h-4 w-4 mr-1.5" />
                )}
                Crear pago
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Exported wrapper with Suspense ── */

export function RendicionesClient(props: RendicionesClientProps) {
  return (
    <Suspense fallback={null}>
      <RendicionesClientInner {...props} />
    </Suspense>
  );
}
