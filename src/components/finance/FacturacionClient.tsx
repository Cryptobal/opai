"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable, EmptyState, type DataTableColumn } from "@/components/opai-ds";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  FileText,
  FileInput,
  Hash,
  Plus,
  Search,
  Download,
  Ban,
  FileMinus,
  FilePlus,
  Loader2,
  RefreshCw,
  Mail,
  FileCode,
  Eye,
  ExternalLink,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PaginationControls } from "./PaginationControls";
import { KPIRow, TrendChart } from "./FacturacionDashboardWidgets";
import { LibroIvaTab } from "./LibroIvaTab";
import { CostCenterEditor } from "./CostCenterEditor";

/* ── Types ── */

interface DteRow {
  id: string;
  dteType: number;
  folio: number;
  receiverRut: string;
  receiverName: string;
  receiverEmail: string | null;
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
  siiStatus: string;
  currency: string;
  linesCount: number;
  createdAt: string;
  emailSentAt: string | null;
  emailStatus: string | null;
  referenceType: number | null;
  referenceFolio: number | null;
  /** False para DTEs importados de CSV/RCV (no tienen XML local). */
  hasXml?: boolean;
  /** Centro de costo: cliente CRM + instalación. */
  crmAccountId?: string | null;
  installationId?: string | null;
  crmAccount?: { id: string; name: string; legalName: string | null } | null;
  installation?: { id: string; name: string; commune: string | null } | null;
}

interface FolioStatus {
  dteType: number;
  lastFolio: number;
  nextFolio: number;
  totalIssued: number;
}

interface ReceivedDteRow {
  id: string;
  dteType: number;
  folio: number;
  issuerRut: string;
  issuerName: string;
  date: string;
  dueDate: string | null;
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
  receptionStatus: string;
  paymentStatus: string;
  amountPaid: number;
  amountPending: number;
  supplier: { id: string; name: string; rut: string } | null;
  /** Centro de costo: cliente CRM + instalación. */
  crmAccountId?: string | null;
  installationId?: string | null;
  crmAccount?: { id: string; name: string; legalName: string | null } | null;
  installation?: { id: string; name: string; commune: string | null } | null;
}

interface SupplierOption {
  id: string;
  rut: string;
  name: string;
}

interface FacturacionKpis {
  ventasMes: number;
  ivaDebitoMes: number;
  pendientesSii: number;
  facturasMes: number;
  foliosDisponibles: number;
  foliosLowCount: number;
  comparison: { vs: string; pct: number };
}

interface Props {
  dtes: DteRow[];
  /**
   * Cantidad total de DTEs emitidos del tenant (para paginación). El SC
   * pre-carga la primera página de 50; este número permite calcular el
   * número de páginas y mostrar el rango completo "Mostrando X de Y".
   */
  issuedTotal?: number;
  canManage: boolean;
  suppliers?: SupplierOption[];
  kpis: FacturacionKpis;
}

/* ── Constants ── */

const TABS = [
  { id: "dtes", label: "DTEs Emitidos", icon: FileText },
  { id: "recibidos", label: "DTEs Recibidos", icon: FileInput },
  { id: "libro", label: "Libro IVA", icon: BookOpen },
  { id: "folios", label: "Folios", icon: Hash },
] as const;

type TabId = (typeof TABS)[number]["id"];

const DTE_TYPE_LABELS: Record<number, string> = {
  33: "Factura Electrónica",
  34: "Factura Exenta",
  39: "Boleta Electrónica",
  52: "Guía de Despacho",
  56: "Nota de Débito",
  61: "Nota de Crédito",
};

/** Etiqueta corta para badges en filas (mejor para mobile + densidad) */
const DTE_TYPE_SHORT_LABELS: Record<number, string> = {
  33: "Factura",
  34: "F. Exenta",
  39: "Boleta",
  52: "G. Despacho",
  56: "N. Débito",
  61: "N. Crédito",
};

/**
 * Tono semántico DS v3 por tipo de DTE.
 *   33 (Factura Afecta)  → tono brand (default azul, no se setea)
 *   34 (Factura Exenta)  → tono info para distinguir de afecta
 *   56 (Nota Débito)     → tono warn (corrige/aumenta NC)
 *   61 (Nota Crédito)    → tono danger (anula factura)
 *   39 (Boleta)          → tono ok suave
 */
const DTE_TYPE_BADGE_CLASS: Record<number, string> = {
  34: "bg-status-info-soft text-status-info-fg border-status-info-border",
  56: "bg-status-warn-soft text-status-warn-fg border-status-warn-border",
  61: "bg-status-danger-soft text-status-danger-fg border-status-danger-border",
};

const SII_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Pendiente", className: "bg-status-warn-soft text-status-warn-fg border-status-warn-border" },
  ACCEPTED: { label: "Aceptado", className: "bg-status-ok-soft text-status-ok-fg border-status-ok-border" },
  REJECTED: { label: "Rechazado", className: "bg-status-danger-soft text-status-danger-fg border-status-danger-border" },
  ANNULLED: { label: "Anulado", className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
};

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

/**
 * Lista de períodos para los selectores de mes (DTEs Emit/Recib).
 * Formato value: "YYYY-MM". Label: "Mes Año" (ej: "Mayo 2026").
 * Devuelve los últimos N meses incluyendo el corriente.
 */
function buildPeriodOptions(monthsBack = 36): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  const mesNames = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    out.push({
      value: `${y}-${String(m).padStart(2, "0")}`,
      label: `${mesNames[m - 1]} ${y}`,
    });
  }
  return out;
}

const RECEPTION_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  PENDING_REVIEW: { label: "Pendiente", className: "bg-status-warn-soft text-status-warn-fg border-status-warn-border" },
  ACCEPTED: { label: "Aceptado", className: "bg-status-ok-soft text-status-ok-fg border-status-ok-border" },
  CLAIMED: { label: "Reclamado", className: "bg-status-danger-soft text-status-danger-fg border-status-danger-border" },
  PARTIAL_CLAIM: { label: "Reclamo parcial", className: "bg-status-warn-soft text-status-warn-fg border-status-warn-border" },
};

const PAYMENT_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  UNPAID: { label: "No pagado", className: "bg-status-danger-soft text-status-danger-fg border-status-danger-border" },
  PARTIAL: { label: "Parcial", className: "bg-status-warn-soft text-status-warn-fg border-status-warn-border" },
  PAID: { label: "Pagado", className: "bg-status-ok-soft text-status-ok-fg border-status-ok-border" },
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

/* ── Component ── */

export function FacturacionClient({
  dtes,
  issuedTotal,
  canManage,
  suppliers = [],
  kpis,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("dtes");

  return (
    <div className="space-y-4">
      {/* Dashboard widgets */}
      <KPIRow kpis={kpis} />
      <TrendChart />

      {/* Tab navigation */}
      <nav className="-mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors shrink-0 flex items-center gap-1.5",
                  isActive
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground border border-transparent"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>

      {activeTab === "dtes" && (
        <DtesTab
          dtes={dtes}
          issuedTotal={issuedTotal ?? dtes.length}
          canManage={canManage}
        />
      )}
      {activeTab === "recibidos" && <RecibidosTab suppliers={suppliers} canManage={canManage} />}
      {activeTab === "libro" && <LibroIvaTab />}
      {activeTab === "folios" && <FoliosTab canManage={canManage} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Tab 1: DTEs Emitidos
   ═══════════════════════════════════════════════ */

function DtesTab({
  dtes: initialDtes,
  issuedTotal,
  canManage,
}: {
  dtes: DteRow[];
  issuedTotal: number;
  canManage: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  /** Filtro por período "YYYY-MM" o "ALL". Default ALL = sin filtro. */
  const [periodoFilter, setPeriodoFilter] = useState("ALL");
  const periodOptions = useMemo(() => buildPeriodOptions(36), []);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);
  // Paginación server-side. La SC pre-carga la primera página (50);
  // si el usuario cambia page o pageSize, refetch al endpoint paginado.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [dtes, setDtes] = useState<DteRow[]>(initialDtes);
  const [total, setTotal] = useState(issuedTotal);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Si NO hay filtro y son los defaults de paginación, usar el SSR data.
    if (page === 1 && pageSize === 50 && periodoFilter === "ALL") {
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
        if (periodoFilter !== "ALL") params.set("periodo", periodoFilter);
        const res = await fetch(`/api/finance/billing/issued?${params.toString()}`, {
          signal: ctrl.signal,
        });
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
              linesCount: Array.isArray(d.lines) ? (d.lines as unknown[]).length : 0,
              createdAt: String(d.createdAt ?? ""),
              emailSentAt: (d.emailSentAt as string | null) ?? null,
              emailStatus: (d.emailStatus as string | null) ?? null,
              referenceType: (d.referenceType as number | null) ?? null,
              referenceFolio: (d.referenceFolio as number | null) ?? null,
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
  }, [page, pageSize, periodoFilter, initialDtes, issuedTotal]);

  // Reset page=1 cuando cambia el período (para no quedar en página vacía).
  useEffect(() => {
    setPage(1);
  }, [periodoFilter]);

  const filtered = useMemo(() => {
    let list = dtes;
    if (typeFilter !== "ALL") list = list.filter((d) => String(d.dteType) === typeFilter);
    if (statusFilter !== "ALL") list = list.filter((d) => d.siiStatus === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (d) =>
          String(d.folio).includes(q) ||
          d.receiverRut.toLowerCase().includes(q) ||
          d.receiverName.toLowerCase().includes(q)
      );
    }
    return list;
  }, [dtes, typeFilter, statusFilter, search]);

  const handleDownloadPdf = async (id: string, folio: number) => {
    try {
      const res = await fetch(`/api/finance/billing/issued/${id}/pdf`);
      if (!res.ok) {
        // El backend retorna JSON con { success:false, error:"..." }.
        // Ej: "DTE importado del SII no tiene XML local — solo emisiones
        // hechas desde OPAI tienen el XML guardado para regenerar PDF."
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

  // Estado para tracking de "Actualizar estado SII" por fila.
  const [checkingStatus, setCheckingStatus] = useState<string | null>(null);
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
      toast.success(`DTE ${folio}: estado SII actualizado → ${newStatus}${msg}`);
      router.refresh();
    } catch (err) {
      toast.error(`DTE ${folio}: ${(err as Error).message}`);
    } finally {
      setCheckingStatus(null);
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

  const handleResendEmail = async (id: string) => {
    setSendingEmail(id);
    try {
      const res = await fetch(`/api/finance/billing/issued/${id}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await res.json();
      if (res.ok && body.success) {
        toast.success("Email enviado");
        router.refresh();
      } else {
        toast.error(body.error ?? "Error enviando email");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setSendingEmail(null);
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
          <div className="relative flex-1 max-w-sm min-w-0">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar folio, RUT, nombre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-40 h-9">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los tipos</SelectItem>
              {Object.entries(DTE_TYPE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-36 h-9">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              {Object.entries(SII_STATUS_CONFIG).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={periodoFilter} onValueChange={setPeriodoFilter}>
            <SelectTrigger className="w-full sm:w-44 h-9">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent className="max-h-[400px]">
              <SelectItem value="ALL">Todos los períodos</SelectItem>
              {periodOptions.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {canManage && (
          <Link href="/finanzas/facturacion/emitir">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1.5" />
              Emitir DTE
            </Button>
          </Link>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} documento(s)</p>

      {filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Sin documentos"
          description="No hay DTEs emitidos."
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
          {/* Desktop table */}
          <div className="hidden md:block">
            <DataTable<DteRow>
              columns={[
                {
                  id: "dteType",
                  header: "Tipo",
                  cell: (row) => {
                    const typeClass = DTE_TYPE_BADGE_CLASS[row.dteType];
                    return (
                      <Badge variant="outline" className={cn("text-xs", typeClass)}>
                        {DTE_TYPE_SHORT_LABELS[row.dteType] ?? `Tipo ${row.dteType}`}
                      </Badge>
                    );
                  },
                },
                {
                  id: "folio",
                  header: "Folio",
                  cell: (row) => (
                    <div>
                      <div className="font-mono text-xs">{row.folio}</div>
                      {row.referenceFolio != null && row.referenceType != null && (
                        <div className="text-[12px] text-ds-text-3 font-mono mt-0.5">
                          Ref: {row.referenceType}-{row.referenceFolio}
                        </div>
                      )}
                    </div>
                  ),
                },
                {
                  id: "receiverName",
                  header: "Receptor",
                  cell: (row) => (
                    <div>
                      <div>{row.receiverName}</div>
                      <div className="text-xs text-muted-foreground font-mono">{row.receiverRut}</div>
                    </div>
                  ),
                },
                {
                  id: "netAmount",
                  header: "Neto",
                  align: "right",
                  cell: (row) => fmtCLP.format(row.netAmount),
                },
                {
                  id: "taxAmount",
                  header: "IVA",
                  align: "right",
                  cell: (row) => fmtCLP.format(row.taxAmount),
                },
                {
                  id: "totalAmount",
                  header: "Total",
                  align: "right",
                  cell: (row) => <span className="font-medium">{fmtCLP.format(row.totalAmount)}</span>,
                },
                {
                  id: "siiStatus",
                  header: "Estado SII",
                  cell: (row) => {
                    const stCfg = SII_STATUS_CONFIG[row.siiStatus] ?? { label: row.siiStatus, className: "bg-muted" };
                    return (
                      <Badge variant="outline" className={cn("text-xs", stCfg.className)}>
                        {stCfg.label}
                      </Badge>
                    );
                  },
                },
                {
                  id: "createdAt",
                  header: "Fecha",
                  cell: (row) => (
                    <span className="text-muted-foreground text-xs">
                      {format(new Date(row.createdAt), "dd MMM yyyy", { locale: es })}
                    </span>
                  ),
                },
                {
                  id: "emailStatus",
                  header: "Email",
                  cell: (row) => {
                    if (row.emailSentAt) {
                      return (
                        <Badge variant="outline" className="text-xs bg-status-ok-soft text-status-ok-fg border-status-ok-border">
                          Enviado {format(new Date(row.emailSentAt), "dd MMM", { locale: es })}
                        </Badge>
                      );
                    }
                    if (row.emailStatus === "FAILED") {
                      return (
                        <Badge variant="outline" className="text-xs bg-status-danger-soft text-status-danger-fg border-status-danger-border">
                          Falló
                        </Badge>
                      );
                    }
                    return (
                      <Badge variant="outline" className="text-xs">
                        Pendiente
                      </Badge>
                    );
                  },
                },
                {
                  id: "centroCosto",
                  header: "Centro de costo",
                  cell: (row) => (
                    <CostCenterEditor
                      dteId={row.id}
                      currentAccountId={row.crmAccountId}
                      currentAccountName={row.crmAccount?.name ?? null}
                      currentInstallationId={row.installationId}
                      currentInstallationName={row.installation?.name ?? null}
                      canEdit={canManage}
                      onChange={(next) => {
                        // Actualizar la fila en el state local para feedback inmediato.
                        setDtes((prev) =>
                          prev.map((d) =>
                            d.id === row.id
                              ? {
                                  ...d,
                                  crmAccountId: next.crmAccountId,
                                  installationId: next.installationId,
                                  crmAccount: next.crmAccountId && next.accountName
                                    ? { id: next.crmAccountId, name: next.accountName, legalName: null }
                                    : null,
                                  installation: next.installationId && next.installationName
                                    ? { id: next.installationId, name: next.installationName, commune: null }
                                    : null,
                                }
                              : d,
                          ),
                        );
                      }}
                    />
                  ),
                },
                {
                  id: "_actions",
                  header: "",
                  cell: (row) => {
                    // Reglas SII para acciones según estado y tipo:
                    //   - PDF/XML: solo si tenemos el XML guardado (hasXml).
                    //     Los DTEs importados de CSV/RCV no lo tienen.
                    //   - Anular: SOLO si el SII aún no aceptó (PENDING/SENT).
                    //     Una vez ACCEPTED, el SII NO permite anular: hay que
                    //     emitir una Nota de Crédito (CodRef=1).
                    //   - NC: aplica a 33 (Factura), 34 (Factura Exenta),
                    //     39 (Boleta), 41 (Boleta Exenta), 56 (Nota Débito).
                    //   - ND: SOLO aplica a 61 (Nota de Crédito) — la ND se
                    //     usa exclusivamente para anular una NC emitida por
                    //     error. Para corregir/anular facturas se usa NC,
                    //     no ND.
                    const canAnular =
                      row.siiStatus === "PENDING" || row.siiStatus === "SENT";
                    const canCreditNote =
                      [33, 34, 39, 41, 56].includes(row.dteType) &&
                      row.siiStatus !== "ANNULLED";
                    const canDebitNote =
                      row.dteType === 61 && row.siiStatus !== "ANNULLED";
                    const hasXml = row.hasXml !== false; // default true (compat)
                    return (
                      <div className="flex items-center gap-1">
                        {hasXml && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); handleDownloadPdf(row.id, row.folio); }}
                              title="Descargar PDF"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); handleDownloadXml(row.id, row.folio); }}
                              title="Descargar XML"
                            >
                              <FileCode className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        {!hasXml && (
                          <span
                            className="text-xs text-muted-foreground italic px-1"
                            title="DTE importado del SII — sin XML local. Solo emisiones desde OPAI tienen XML/PDF descargable."
                          >
                            (importado)
                          </span>
                        )}
                        {canManage && row.receiverEmail && hasXml && row.siiStatus !== "ANNULLED" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); handleResendEmail(row.id); }}
                            disabled={sendingEmail === row.id}
                            title={row.emailSentAt ? "Reenviar email" : "Enviar email"}
                          >
                            {sendingEmail === row.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Mail className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        )}
                        {canManage && (row.siiStatus === "PENDING" || row.siiStatus === "SENT") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); handleCheckStatus(row.id, row.folio); }}
                            disabled={checkingStatus === row.id}
                            title="Consultar estado SII (manual)"
                          >
                            {checkingStatus === row.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        )}
                        {canManage && canAnular && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); handleVoid(row.id); }}
                            disabled={voiding === row.id}
                            title="Anular (solo si aún no fue aceptado por SII)"
                          >
                            {voiding === row.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Ban className="h-3.5 w-3.5 text-destructive" />
                            )}
                          </Button>
                        )}
                        {canManage && canCreditNote && (
                          <Link href={`/finanzas/facturacion/notas/credito?referenceDteId=${row.id}`}>
                            <Button variant="ghost" size="sm" title="Emitir Nota de Crédito">
                              <FileMinus className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                        )}
                        {canManage && canDebitNote && (
                          <Link href={`/finanzas/facturacion/notas/debito?referenceDteId=${row.id}`}>
                            <Button variant="ghost" size="sm" title="Emitir Nota de Débito">
                              <FilePlus className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                        )}
                      </div>
                    );
                  },
                },
              ] satisfies DataTableColumn<DteRow>[]}
              rows={filtered}
              rowKey={(row) => row.id}
              empty={<EmptyState icon={FileText} title="Sin documentos" compact />}
            />
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {filtered.map((d) => {
              const stCfg = SII_STATUS_CONFIG[d.siiStatus] ?? { label: d.siiStatus, className: "bg-muted" };
              return (
                <Card key={d.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge
                            variant="outline"
                            className={cn("text-xs", DTE_TYPE_BADGE_CLASS[d.dteType])}
                          >
                            {DTE_TYPE_SHORT_LABELS[d.dteType] ?? `Tipo ${d.dteType}`}
                          </Badge>
                          <span className="font-mono text-xs">#{d.folio}</span>
                          <Badge variant="outline" className={cn("text-xs", stCfg.className)}>
                            {stCfg.label}
                          </Badge>
                        </div>
                        {d.referenceFolio != null && d.referenceType != null && (
                          <p className="text-[12px] text-ds-text-3 font-mono mb-1">
                            Ref: {d.referenceType}-{d.referenceFolio}
                          </p>
                        )}
                        <p className="font-medium text-sm">{d.receiverName}</p>
                        <p className="text-xs text-muted-foreground font-mono">{d.receiverRut}</p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="font-mono text-sm font-medium">{fmtCLP.format(d.totalAmount)}</span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(d.createdAt), "dd MMM yyyy", { locale: es })}
                          </span>
                        </div>
                      </div>
                    </div>
                    {(d.emailSentAt || d.emailStatus === "FAILED") && (
                      <div className="mt-2">
                        {d.emailSentAt ? (
                          <Badge variant="outline" className="text-xs bg-status-ok-soft text-status-ok-fg border-status-ok-border">
                            Email enviado {format(new Date(d.emailSentAt), "dd MMM", { locale: es })}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs bg-status-danger-soft text-status-danger-fg border-status-danger-border">
                            Email falló
                          </Badge>
                        )}
                      </div>
                    )}
                    {(() => {
                      // Mismas reglas que en desktop, ver comentario arriba.
                      const canAnular = d.siiStatus === "PENDING" || d.siiStatus === "SENT";
                      const canCreditNote = [33, 34, 39, 41, 56].includes(d.dteType) && d.siiStatus !== "ANNULLED";
                      // ND SOLO aplica a NC (regla SII): se usa para anular
                      // una NC emitida por error. NO va a facturas.
                      const canDebitNote = d.dteType === 61 && d.siiStatus !== "ANNULLED";
                      const hasXml = d.hasXml !== false;
                      return (
                        <div className="flex gap-1 mt-3 pt-3 border-t border-border flex-wrap">
                          {hasXml ? (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => handleDownloadPdf(d.id, d.folio)}>
                                <Download className="h-3.5 w-3.5 mr-1" />
                                PDF
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDownloadXml(d.id, d.folio)}>
                                <FileCode className="h-3.5 w-3.5 mr-1" />
                                XML
                              </Button>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground italic px-2 py-1.5">
                              Importado del SII (sin XML local)
                            </span>
                          )}
                          {canManage && d.receiverEmail && hasXml && d.siiStatus !== "ANNULLED" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleResendEmail(d.id)}
                              disabled={sendingEmail === d.id}
                            >
                              {sendingEmail === d.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                              ) : (
                                <Mail className="h-3.5 w-3.5 mr-1" />
                              )}
                              {d.emailSentAt ? "Reenviar" : "Email"}
                            </Button>
                          )}
                          {canManage && (d.siiStatus === "PENDING" || d.siiStatus === "SENT") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCheckStatus(d.id, d.folio)}
                              disabled={checkingStatus === d.id}
                            >
                              {checkingStatus === d.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                              ) : (
                                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                              )}
                              Estado SII
                            </Button>
                          )}
                          {canManage && canAnular && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleVoid(d.id)}
                              disabled={voiding === d.id}
                              title="Anular (solo si SII no aceptó aún)"
                            >
                              {voiding === d.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                              ) : (
                                <Ban className="h-3.5 w-3.5 mr-1 text-destructive" />
                              )}
                              Anular
                            </Button>
                          )}
                          {canManage && canCreditNote && (
                            <Link href={`/finanzas/facturacion/notas/credito?referenceDteId=${d.id}`}>
                              <Button variant="ghost" size="sm">
                                <FileMinus className="h-3.5 w-3.5 mr-1" />
                                NC
                              </Button>
                            </Link>
                          )}
                          {canManage && canDebitNote && (
                            <Link href={`/finanzas/facturacion/notas/debito?referenceDteId=${d.id}`}>
                              <Button variant="ghost" size="sm">
                                <FilePlus className="h-3.5 w-3.5 mr-1" />
                                ND
                              </Button>
                            </Link>
                          )}
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              );
            })}
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

    </div>
  );
}

/* ═══════════════════════════════════════════════
   Tab 2: Folios
   ═══════════════════════════════════════════════ */

function FoliosTab({ canManage }: { canManage: boolean }) {
  const [folios, setFolios] = useState<FolioStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFolios = useCallback(async () => {
    try {
      const res = await fetch("/api/finance/billing/folios");
      if (!res.ok) throw new Error();
      const json = await res.json();
      setFolios(json.data ?? []);
    } catch {
      toast.error("Error al cargar folios");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFolios(); }, [loadFolios]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Estado de folios por tipo de DTE</p>

      {folios.length === 0 ? (
        <EmptyState
          icon={Hash}
          title="Sin datos de folios"
          description="No hay información de folios disponible."
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <DataTable<FolioStatus>
              columns={[
                {
                  id: "dteType",
                  header: "Tipo DTE",
                  cell: (row) => <>{DTE_TYPE_LABELS[row.dteType] ?? `Tipo ${row.dteType}`}</>,
                },
                {
                  id: "lastFolio",
                  header: "Último folio",
                  align: "center",
                  cell: (row) => <span className="font-mono text-xs">{row.lastFolio || "—"}</span>,
                },
                {
                  id: "nextFolio",
                  header: "Siguiente folio",
                  align: "center",
                  cell: (row) => <span className="font-mono text-xs">{row.nextFolio}</span>,
                },
                {
                  id: "totalIssued",
                  header: "Total emitidos",
                  align: "center",
                  cell: (row) => <span className="font-mono text-xs">{row.totalIssued}</span>,
                },
              ] satisfies DataTableColumn<FolioStatus>[]}
              rows={folios}
              rowKey={(row) => String(row.dteType)}
              empty={<EmptyState icon={Hash} title="Sin datos de folios" compact />}
            />
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {folios.map((f) => (
              <Card key={f.dteType}>
                <CardContent className="p-4">
                  <p className="text-sm font-medium mb-2">
                    {DTE_TYPE_LABELS[f.dteType] ?? `Tipo ${f.dteType}`}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Último</span>
                      <p className="font-mono">{f.lastFolio || "—"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Siguiente</span>
                      <p className="font-mono">{f.nextFolio}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Emitidos</span>
                      <p className="font-mono">{f.totalIssued}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Tab 3: DTEs Recibidos
   ═══════════════════════════════════════════════ */

function RecibidosTab({ suppliers, canManage }: { suppliers: SupplierOption[]; canManage: boolean }) {
  const router = useRouter();
  const [receivedDtes, setReceivedDtes] = useState<ReceivedDteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_RECEIVED_FORM);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [receptionFilter, setReceptionFilter] = useState("ALL");
  const [paymentFilter, setPaymentFilter] = useState("ALL");
  /** Filtro por período "YYYY-MM" o "ALL". Default ALL = sin filtro. */
  const [periodoFilter, setPeriodoFilter] = useState("ALL");
  const periodOptions = useMemo(() => buildPeriodOptions(36), []);
  // Paginación server-side (selector 10/25/50/100/200) + modal detalle.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [detailDte, setDetailDte] = useState<ReceivedDteRow | null>(null);

  const loadReceivedDtes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (periodoFilter !== "ALL") params.set("periodo", periodoFilter);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const res = await fetch(`/api/finance/billing/received?${params.toString()}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      // El endpoint devuelve { data: { dtes: [...], pagination: {...} } }.
      // Defensivo: aceptamos también la forma plana { data: [...] } por si
      // algún wrapper futuro lo cambia.
      const list = Array.isArray(json?.data)
        ? json.data
        : Array.isArray(json?.data?.dtes)
          ? json.data.dtes
          : [];
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
  }, [page, pageSize, periodoFilter]);

  useEffect(() => { loadReceivedDtes(); }, [loadReceivedDtes]);

  // Reset page=1 cuando cambia el período (para no quedar en página vacía).
  useEffect(() => {
    setPage(1);
  }, [periodoFilter]);

  const filtered = useMemo(() => {
    // Defensa: si por alguna razón el state quedó corrupto, devolvemos [].
    if (!Array.isArray(receivedDtes)) return [];
    let list = receivedDtes;
    if (typeFilter !== "ALL") list = list.filter((d) => String(d.dteType) === typeFilter);
    if (receptionFilter !== "ALL") list = list.filter((d) => d.receptionStatus === receptionFilter);
    if (paymentFilter !== "ALL") list = list.filter((d) => d.paymentStatus === paymentFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (d) =>
          String(d.folio).includes(q) ||
          d.issuerRut.toLowerCase().includes(q) ||
          d.issuerName.toLowerCase().includes(q)
      );
    }
    return list;
  }, [receivedDtes, typeFilter, receptionFilter, paymentFilter, search]);

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
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
          <div className="relative flex-1 max-w-sm min-w-0">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar folio, RUT, emisor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-40 h-9">
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
          <Select value={receptionFilter} onValueChange={setReceptionFilter}>
            <SelectTrigger className="w-full sm:w-36 h-9">
              <SelectValue placeholder="Recepción" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              {Object.entries(RECEPTION_STATUS_CONFIG).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger className="w-full sm:w-36 h-9">
              <SelectValue placeholder="Pago" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              {Object.entries(PAYMENT_STATUS_CONFIG).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={periodoFilter} onValueChange={setPeriodoFilter}>
            <SelectTrigger className="w-full sm:w-44 h-9">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent className="max-h-[400px]">
              <SelectItem value="ALL">Todos los períodos</SelectItem>
              {periodOptions.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Registrar DTE
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {total > 0
          ? `${filtered.length.toLocaleString("es-CL")} de ${total.toLocaleString("es-CL")} documento(s)`
          : `${filtered.length} documento(s) recibido(s)`}
      </p>

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
          {/* Desktop table */}
          <div className="hidden md:block">
            <DataTable<ReceivedDteRow>
              columns={[
                {
                  id: "dteType",
                  header: "Tipo",
                  cell: (row) => (
                    <span className="text-xs">{DTE_TYPE_LABELS[row.dteType] ?? `Tipo ${row.dteType}`}</span>
                  ),
                },
                {
                  id: "folio",
                  header: "Folio",
                  cell: (row) => <span className="font-mono text-xs">{row.folio}</span>,
                },
                {
                  id: "issuerName",
                  header: "Emisor",
                  cell: (row) => (
                    <div>
                      <div>{row.issuerName}</div>
                      <div className="text-xs text-muted-foreground font-mono">{row.issuerRut}</div>
                    </div>
                  ),
                },
                {
                  id: "date",
                  header: "Fecha",
                  cell: (row) => (
                    <span className="text-muted-foreground text-xs">
                      {format(new Date(row.date), "dd MMM yyyy", { locale: es })}
                    </span>
                  ),
                },
                {
                  id: "netAmount",
                  header: "Neto",
                  align: "right",
                  cell: (row) => fmtCLP.format(row.netAmount),
                },
                {
                  id: "taxAmount",
                  header: "IVA",
                  align: "right",
                  cell: (row) => fmtCLP.format(row.taxAmount),
                },
                {
                  id: "totalAmount",
                  header: "Total",
                  align: "right",
                  cell: (row) => <span className="font-medium">{fmtCLP.format(row.totalAmount)}</span>,
                },
                {
                  id: "receptionStatus",
                  header: "Recepción",
                  cell: (row) => {
                    const recCfg = RECEPTION_STATUS_CONFIG[row.receptionStatus] ?? { label: row.receptionStatus, className: "bg-muted" };
                    return (
                      <Badge variant="outline" className={cn("text-xs", recCfg.className)}>
                        {recCfg.label}
                      </Badge>
                    );
                  },
                },
                {
                  id: "paymentStatus",
                  header: "Pago",
                  cell: (row) => {
                    const payCfg = PAYMENT_STATUS_CONFIG[row.paymentStatus] ?? { label: row.paymentStatus, className: "bg-muted" };
                    return (
                      <Badge variant="outline" className={cn("text-xs", payCfg.className)}>
                        {payCfg.label}
                      </Badge>
                    );
                  },
                },
                {
                  id: "centroCosto",
                  header: "Centro de costo",
                  cell: (row) => (
                    <CostCenterEditor
                      dteId={row.id}
                      currentAccountId={row.crmAccountId}
                      currentAccountName={row.crmAccount?.name ?? null}
                      currentInstallationId={row.installationId}
                      currentInstallationName={row.installation?.name ?? null}
                      canEdit={canManage}
                      onChange={(next) => {
                        setReceivedDtes((prev) =>
                          prev.map((d) =>
                            d.id === row.id
                              ? {
                                  ...d,
                                  crmAccountId: next.crmAccountId,
                                  installationId: next.installationId,
                                  crmAccount: next.crmAccountId && next.accountName
                                    ? { id: next.crmAccountId, name: next.accountName, legalName: null }
                                    : null,
                                  installation: next.installationId && next.installationName
                                    ? { id: next.installationId, name: next.installationName, commune: null }
                                    : null,
                                }
                              : d,
                          ),
                        );
                      }}
                    />
                  ),
                },
                {
                  id: "actions",
                  header: "",
                  align: "right",
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
              ] satisfies DataTableColumn<ReceivedDteRow>[]}
              rows={filtered}
              rowKey={(row) => row.id}
              empty={<EmptyState icon={FileInput} title="Sin documentos recibidos" compact />}
            />
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {(Array.isArray(filtered) ? filtered : []).map((d) => {
              const recCfg = RECEPTION_STATUS_CONFIG[d.receptionStatus] ?? { label: d.receptionStatus, className: "bg-muted" };
              const payCfg = PAYMENT_STATUS_CONFIG[d.paymentStatus] ?? { label: d.paymentStatus, className: "bg-muted" };
              return (
                <Card
                  key={d.id}
                  className="cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setDetailDte(d)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs text-muted-foreground">
                            {DTE_TYPE_LABELS[d.dteType] ?? `Tipo ${d.dteType}`}
                          </span>
                          <span className="font-mono text-xs">#{d.folio}</span>
                          <Badge variant="outline" className={cn("text-[10px]", recCfg.className)}>
                            {recCfg.label}
                          </Badge>
                          <Badge variant="outline" className={cn("text-[10px]", payCfg.className)}>
                            {payCfg.label}
                          </Badge>
                        </div>
                        <p className="font-medium text-sm">{d.issuerName}</p>
                        <p className="text-xs text-muted-foreground font-mono">{d.issuerRut}</p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="font-mono text-sm font-medium">{fmtCLP.format(d.totalAmount)}</span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(d.date), "dd MMM yyyy", { locale: es })}
                          </span>
                        </div>
                      </div>
                      <Eye className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
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

      <ReceivedDteDetailDialog
        dte={detailDte}
        onClose={() => setDetailDte(null)}
        suppliers={suppliers}
        canManage={canManage}
      />



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
                  className="h-9 bg-muted"
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
    </div>
  );
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

/**
 * ReceivedDteDetailDialog — modal de detalle de un DTE recibido.
 *
 * El SII NO expone re-descarga del XML/PDF de DTEs recibidos. El
 * proveedor está obligado a enviarte el XML por email; el documento
 * "vive" en tu correo. Este modal ofrece:
 *   - Datos del DTE que tenemos del RCV (folio, emisor, montos, estados)
 *   - Link al visor web del SII (requiere sesión SII abierta)
 *   - Sección de adjuntos: subir/descargar/eliminar XML, PDF, etc del
 *     proveedor (lo que llegó por email).
 */
function ReceivedDteDetailDialog({
  dte,
  onClose,
  suppliers,
  canManage,
}: {
  dte: ReceivedDteRow | null;
  onClose: () => void;
  suppliers: SupplierOption[];
  canManage: boolean;
}) {
  const [attachments, setAttachments] = useState<DteAttachment[]>([]);
  const [loadingAtt, setLoadingAtt] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Cargar adjuntos al abrir el modal.
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

  const dateStr = format(new Date(dte.date), "dd 'de' MMMM yyyy", { locale: es });
  const dueStr = dte.dueDate
    ? format(new Date(dte.dueDate), "dd 'de' MMMM yyyy", { locale: es })
    : "Sin fecha de vencimiento";
  const recCfg = RECEPTION_STATUS_CONFIG[dte.receptionStatus] ?? {
    label: dte.receptionStatus,
    className: "bg-muted",
  };
  const payCfg = PAYMENT_STATUS_CONFIG[dte.paymentStatus] ?? {
    label: dte.paymentStatus,
    className: "bg-muted",
  };
  const siiViewerUrl = `https://www4.sii.cl/consdcvinternetui/#/index`;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileInput className="h-5 w-5 text-primary" />
            {DTE_TYPE_LABELS[dte.dteType] ?? `Tipo ${dte.dteType}`} N° {dte.folio}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className={cn("text-xs", recCfg.className)}>
              Recepción: {recCfg.label}
            </Badge>
            <Badge variant="outline" className={cn("text-xs", payCfg.className)}>
              Pago: {payCfg.label}
            </Badge>
          </div>

          <div className="rounded-md border border-border bg-muted/30 p-4 space-y-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Emisor
            </p>
            <p className="font-medium">{dte.issuerName}</p>
            <p className="text-sm font-mono text-muted-foreground">{dte.issuerRut}</p>
            {supplier && (
              <p className="text-xs text-muted-foreground">
                Proveedor vinculado en OPAI:{" "}
                <span className="font-medium">{supplier.name}</span>
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Emisión
              </p>
              <p className="text-sm">{dateStr}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Vencimiento
              </p>
              <p className="text-sm">{dueStr}</p>
            </div>
          </div>

          <div className="rounded-md border border-border p-4 space-y-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              Montos
            </p>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Neto</span>
              <span className="font-mono">{fmtCLP.format(dte.netAmount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">IVA (19%)</span>
              <span className="font-mono">{fmtCLP.format(dte.taxAmount)}</span>
            </div>
            <div className="flex justify-between text-base font-medium pt-2 border-t border-border">
              <span>Total</span>
              <span className="font-mono">{fmtCLP.format(dte.totalAmount)}</span>
            </div>
          </div>

          <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-950/30 p-3 text-xs text-blue-900 dark:text-blue-200">
            <p className="font-medium mb-1">Nota sobre el documento original</p>
            <p>
              El SII no expone re-descarga del XML/PDF de DTEs recibidos. El
              proveedor está obligado a enviarte el XML por email. Subí acá
              el archivo recibido para tenerlo guardado junto al DTE, y/o
              ingresá al visor SII para ver el detalle oficial:
            </p>
          </div>

          <Button variant="outline" size="sm" asChild>
            <a href={siiViewerUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Ver en visor SII
            </a>
          </Button>

          {/* Sección de adjuntos */}
          <div className="border-t border-border pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium">Adjuntos</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
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
                      "inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium transition-colors",
                      uploading
                        ? "bg-muted text-muted-foreground cursor-wait"
                        : "bg-background hover:bg-muted",
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
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : attachments.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-3 text-center">
                Sin adjuntos. Si el proveedor te envió el XML por email,
                subilo acá.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-md border border-border">
                {attachments.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-2 p-2.5"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <FileCode className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm truncate" title={a.filename}>
                          {a.filename}
                        </p>
                        <p className="text-xs text-muted-foreground">
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
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
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

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
