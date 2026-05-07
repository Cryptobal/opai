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
  FileEdit,
} from "lucide-react";
import { CederDteDialog } from "./factoring/CederDteDialog";
import { PdfPreviewDialog } from "./PdfPreviewDialog";
import { DteActionsMenu } from "./DteActionsMenu";
import { EmisionConfirmDialog } from "./EmisionConfirmDialog";
import { FoliosKpiCards } from "./FoliosKpiCards";
import { FoliosDetailTable } from "./FoliosDetailTable";
import { DteAgingBadge } from "./DteAgingBadge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PaginationControls } from "./PaginationControls";
import { KPIRow, TrendChart } from "./FacturacionDashboardWidgets";
import { LibroIvaTab } from "./LibroIvaTab";
import { BorradoresTab } from "./BorradoresTab";
import { CostCenterEditor } from "./CostCenterEditor";
import { CreditNoteModal } from "./CreditNoteModal";
import { IssuedDteDetailDialog } from "./IssuedDteDetailDialog";
import { SendEmailDialog } from "./SendEmailDialog";
import { SaludFinancieraHero } from "./SaludFinancieraHero";
import { Building, MapPin } from "lucide-react";

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
  /** Factoring: indica si el DTE puede ser cedido (33/34/43/46 + ACCEPTED + XML + sin cesión activa). */
  canBeCeded?: boolean;
  /** Cesión activa asociada al DTE (si existe). */
  activeCession?: { id: string; code: string; status: string } | null;
  /** Fecha tributaria del DTE (para aging y filtros). */
  date?: string;
  /** Vencimiento (opcional). */
  dueDate?: string | null;
  /** Estado de pago (UNPAID / PARTIAL / PAID / OVERDUE / WRITTEN_OFF). */
  paymentStatus?: string | null;
}

interface FolioStatus {
  dteType: number;
  cafId: string | null;
  folioDesde: number | null;
  folioHasta: number | null;
  nextFolio: number;
  consumidos: number;
  disponibles: number;
  totalCAF: number;
  porcentajeUsado: number;
  lowStock: boolean;
  cafExpiraEn: string | null;
  ultimoFolio: number;
  totalEmitidos: number;
  // Aliases legacy
  lastFolio: number;
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
  /** Etiqueta del período en curso ("Mayo 2026", "Últimos 12 meses"). */
  periodLabel?: string;
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
  /** KPIs calculados en SSR para el mes actual — sirven de hidratación inicial. */
  initialKpis: FacturacionKpis;
}

/* ── Constants ── */

// Orden optimizado para flujo real:
// 1. DTEs Emitidos (default) — es la vista que más se abre.
// 2. DTEs Recibidos — segunda más usada (compras).
// 3. Programación — borradores libres + plantillas recurrentes que
//    generan borradores automáticamente. Conserva el id "borradores"
//    para no romper deeplinks ni bookmarks existentes.
// 4. Libro IVA — solo lectura mensual, baja frecuencia.
// 5. Folios — solo cuando hay alerta de stock bajo.
const TABS = [
  { id: "dtes", label: "DTEs Emitidos", icon: FileText },
  { id: "recibidos", label: "DTEs Recibidos", icon: FileInput },
  { id: "borradores", label: "Programación", icon: FileEdit },
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
  DRAFT: { label: "Borrador", className: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
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
  initialKpis,
}: Props) {
  // Tab inicial: ?tab=borradores en URL para abrir directo en borradores
  // (lo usa el "Guardar como borrador" del DteForm tras crear).
  const initialTab: TabId = (() => {
    if (typeof window === "undefined") return "dtes";
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && (TABS as readonly { id: string }[]).some((tab) => tab.id === t)) {
      return t as TabId;
    }
    return "dtes";
  })();
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  // Filtro de período compartido entre KPIs, TrendChart y DtesTab.
  // "ALL" = últimos 12 meses agregados; "YYYY-MM" = mes específico.
  // Default "ALL" coincide con el comportamiento previo de la tabla.
  const [periodoFilter, setPeriodoFilter] = useState("ALL");
  // KPIs como state: SSR provee hidratación para el mes actual; el cliente
  // refetchea al endpoint /api/finance/billing/kpis cuando cambia el período.
  const [kpis, setKpis] = useState<FacturacionKpis>(initialKpis);
  const [kpisLoading, setKpisLoading] = useState(false);
  // Skip el primer fetch si el filtro coincide con el default del SSR (mes
  // actual). Cuando el usuario cambia a otro período, refetch.
  const [hasFetchedKpis, setHasFetchedKpis] = useState(false);

  useEffect(() => {
    // El SSR calcula el mes actual; "ALL" agrega últimos 12 meses, así que
    // SIEMPRE difiere del SSR y requiere fetch. Aplicamos fetch en cada
    // cambio.
    const ctrl = new AbortController();
    setKpisLoading(true);
    (async () => {
      try {
        const params = new URLSearchParams();
        params.set("periodo", periodoFilter);
        const res = await fetch(
          `/api/finance/billing/kpis?${params.toString()}`,
          { signal: ctrl.signal },
        );
        if (!res.ok) throw new Error();
        const json = await res.json();
        if (json?.success && json.data) {
          setKpis(json.data as FacturacionKpis);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          // Silencioso: mantenemos los KPIs previos en pantalla.
          console.error("[FacturacionClient] KPIs refetch failed:", err);
        }
      } finally {
        setKpisLoading(false);
        setHasFetchedKpis(true);
      }
    })();
    return () => ctrl.abort();
  }, [periodoFilter]);

  // Estado intermedio: cuando el usuario hace click en "Pendientes SII"
  // del KPI, queremos cambiar al tab Emitidos Y aplicar el filtro de
  // estado. Comunicamos a DtesTab vía prop forcedStatusFilter.
  const [forcedStatusFilter, setForcedStatusFilter] = useState<string | null>(
    null,
  );

  return (
    <div className="space-y-4">
      {/* Hero "Salud financiera del mes": panel arriba de los KPIs.
          Cobrado vs facturado, aging buckets, IVA neto, margen, mini
          chart de cobro vs facturación últimos 6 meses. Es lo PRIMERO
          que el usuario ve al entrar al módulo. */}
      <SaludFinancieraHero
        periodo={periodoFilter}
        onClickVencidas={() => {
          setActiveTab("dtes");
          // Filtro por OVERDUE (Tabla emitidos lo soporta vía
          // statusFilter normal de SII, pero "vencidas" es payment, no
          // SII status — por ahora solo cambia tab y deja al usuario
          // filtrar manualmente. Mejora futura: filtro propio de pago).
        }}
      />

      {/* Dashboard widgets */}
      <KPIRow
        kpis={kpis}
        loading={kpisLoading && !hasFetchedKpis}
        actions={{
          onClickPendientesSii: () => {
            setActiveTab("dtes");
            setForcedStatusFilter("PENDING");
          },
          onClickFolios: () => setActiveTab("folios"),
          onClickIva: () => setActiveTab("libro"),
        }}
      />
      <TrendChart periodo={periodoFilter} />

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

      {activeTab === "borradores" && <BorradoresTab canManage={canManage} />}
      {activeTab === "dtes" && (
        <DtesTab
          dtes={dtes}
          issuedTotal={issuedTotal ?? dtes.length}
          canManage={canManage}
          periodoFilter={periodoFilter}
          onPeriodoFilterChange={setPeriodoFilter}
          forcedStatusFilter={forcedStatusFilter}
          onForcedStatusFilterConsumed={() => setForcedStatusFilter(null)}
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
  periodoFilter,
  onPeriodoFilterChange,
  forcedStatusFilter,
  onForcedStatusFilterConsumed,
}: {
  dtes: DteRow[];
  issuedTotal: number;
  canManage: boolean;
  /** Filtro de período compartido (KPIs + TrendChart + tabla). */
  periodoFilter: string;
  onPeriodoFilterChange: (v: string) => void;
  /**
   * Si viene "PENDING" o "ACCEPTED", el tab aplica ese filtro al cargar
   * y luego limpia el estado para no quedarse pegado. Lo usa el KPI
   * "Pendientes SII" del KPIRow para hacer click-through.
   */
  forcedStatusFilter?: string | null;
  onForcedStatusFilterConsumed?: () => void;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Click-through desde el KPI: si el padre pide forzar un filtro, lo
  // aplicamos y avisamos para que limpie el estado. Esto permite que el
  // usuario pueda cambiarlo libremente después.
  useEffect(() => {
    if (forcedStatusFilter && forcedStatusFilter !== statusFilter) {
      setStatusFilter(forcedStatusFilter);
      onForcedStatusFilterConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forcedStatusFilter]);
  /** Filtro por centro de costo: "ALL" | "NONE" | uuid de cuenta. */
  const [accountFilter, setAccountFilter] = useState("ALL");
  const [accountOptions, setAccountOptions] = useState<
    { id: string; name: string; legalName: string | null }[]
  >([]);
  const periodOptions = useMemo(() => buildPeriodOptions(36), []);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);
  /** Modal de NC/ND. Cuando hay un dteId + noteType, está abierto. */
  const [noteModal, setNoteModal] = useState<{
    dteId: string;
    noteType: "credit" | "debit";
  } | null>(null);
  /** Modal de detalle de DTE emitido. */
  const [detailDteId, setDetailDteId] = useState<string | null>(null);
  /** Modal de cesión a factoring desde la fila. */
  const [cedeModalDteId, setCedeModalDteId] = useState<string | null>(null);
  /** Modal de vista previa PDF. */
  const [previewDteId, setPreviewDteId] = useState<string | null>(null);
  /** Modal de envío de email con TO/CC/BCC. Reemplaza el envío directo. */
  const [emailDteId, setEmailDteId] = useState<string | null>(null);
  /** Modal de confirmación de emisión SII para un borrador. Cuando hay
   *  data, está abierto. */
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
  const [tenantBackoffice, setTenantBackoffice] = useState<{
    emails: string[];
    alwaysSend: boolean;
  }>({ emails: [], alwaysSend: false });
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);
  // Paginación server-side. La SC pre-carga la primera página (50);
  // si el usuario cambia page o pageSize, refetch al endpoint paginado.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [dtes, setDtes] = useState<DteRow[]>(initialDtes);
  const [total, setTotal] = useState(issuedTotal);
  const [loading, setLoading] = useState(false);

  // Búsqueda con debounce: trim + 300ms para reducir requests al server.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Cargar config del backoffice del tenant — la usa el dialog de
  // emisión cuando el usuario emite un borrador desde la fila.
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

  // Cargar lista de cuentas CRM con DTEs emitidos para el selector de filtro.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/finance/billing/accounts-with-dtes")
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        if (body.success && Array.isArray(body.data)) {
          setAccountOptions(body.data);
        }
      })
      .catch(() => {
        // silencioso: el filtro queda con sólo Todos / Sin asignar
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Si NO hay filtros (paginación default + sin búsqueda + sin cuenta),
    // usar SSR data para evitar un request innecesario.
    if (
      page === 1 &&
      pageSize === 50 &&
      periodoFilter === "ALL" &&
      accountFilter === "ALL" &&
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
        if (periodoFilter !== "ALL") params.set("periodo", periodoFilter);
        if (debouncedSearch) params.set("search", debouncedSearch);
        if (accountFilter !== "ALL") params.set("accountId", accountFilter);
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
              hasXml: Boolean(d.hasXml),
              crmAccountId: (d.crmAccountId as string | null) ?? null,
              installationId: (d.installationId as string | null) ?? null,
              crmAccount: (d.crmAccount as
                | { id: string; name: string; legalName: string | null }
                | null) ?? null,
              installation: (d.installation as
                | { id: string; name: string; commune: string | null }
                | null) ?? null,
              canBeCeded: Boolean(d.canBeCeded),
              activeCession: (d.activeCession as
                | { id: string; code: string; status: string }
                | null) ?? null,
              date: typeof d.date === "string" ? d.date : String(d.date ?? ""),
              dueDate: (d.dueDate as string | null) ?? null,
              paymentStatus: (d.paymentStatus as string | null) ?? null,
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
  }, [page, pageSize, periodoFilter, accountFilter, debouncedSearch, initialDtes, issuedTotal]);

  // Reset page=1 cuando cambia el período, la búsqueda o el centro de costo.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    setPage(1);
  }, [periodoFilter]);

  useEffect(() => {
    setPage(1);
  }, [accountFilter]);

  const filtered = useMemo(() => {
    // Búsqueda por nombre/RUT/folio se hace server-side (ver useEffect arriba).
    // Acá solo filtros de tipo y estado SII (operan sobre la página cargada).
    let list = dtes;
    if (typeFilter !== "ALL") list = list.filter((d) => String(d.dteType) === typeFilter);
    if (statusFilter !== "ALL") list = list.filter((d) => d.siiStatus === statusFilter);
    return list;
  }, [dtes, typeFilter, statusFilter]);

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

  // Reenviar email ahora SIEMPRE abre el SendEmailDialog para que el
  // usuario confirme TO/CC/BCC. Antes mandaba inmediato sin elegir
  // destinatarios y eso causó envíos accidentales.
  const handleResendEmail = (id: string) => {
    setEmailDteId(id);
  };

  /** Editar un borrador: redirige al form con `?draftId=`. */
  const handleEditDraft = (id: string) => {
    router.push(`/finanzas/facturacion/emitir?draftId=${id}`);
  };

  /** Abre el dialog de emisión SII para un borrador. Carga el detalle
   *  completo del draft (lines + totales) para alimentar el dialog. */
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
        ufValueAtIssue: d.ufValueAtIssue != null ? Number(d.ufValueAtIssue) : null,
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
    if (!confirm("¿Eliminar este borrador? Esta acción no es reversible.")) return;
    setDeletingDraftId(id);
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
      setDeletingDraftId(null);
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
    <div className="space-y-3">
      {/* Barra de búsqueda fuzzy global, prominente */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por folio, RUT, cliente o monto…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-10"
          />
        </div>
        {canManage && (
          <Link href="/finanzas/facturacion/emitir">
            <Button size="sm" className="h-10">
              <Plus className="h-4 w-4 mr-1.5" />
              Emitir DTE
            </Button>
          </Link>
        )}
      </div>

      {/* Toolbar secundaria con filtros granulares */}
      <div className="flex flex-wrap items-center gap-2">
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
        <Select value={periodoFilter} onValueChange={onPeriodoFilterChange}>
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
        <Select value={accountFilter} onValueChange={setAccountFilter}>
          <SelectTrigger className="w-full sm:w-56 h-9">
            <SelectValue placeholder="Centro de costo" />
          </SelectTrigger>
          <SelectContent className="max-h-[400px]">
            <SelectItem value="ALL">Todos los centros</SelectItem>
            <SelectItem value="NONE">Sin asignar</SelectItem>
            {accountOptions.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} documento(s)</p>

      {filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Sin documentos"
          description="No hay DTEs emitidos en este período. Podés emitir uno desde cero o programar facturas recurrentes (mensuales, quincenales, etc) que generen borradores automáticamente."
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
                      <div className="font-mono text-xs">
                        {row.siiStatus === "DRAFT" ? "—" : row.folio}
                      </div>
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
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className={cn("text-xs", stCfg.className)}>
                          {stCfg.label}
                        </Badge>
                        {row.date && (
                          <DteAgingBadge
                            date={row.date}
                            dueDate={row.dueDate}
                            paymentStatus={row.paymentStatus}
                            siiStatus={row.siiStatus}
                          />
                        )}
                      </div>
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
                  cell: (row) => {
                    if (!row.crmAccount) {
                      return <span className="text-xs text-muted-foreground italic">Sin asignar</span>;
                    }
                    return (
                      <div className="text-xs space-y-0.5">
                        <div className="flex items-center gap-1 truncate" title={row.crmAccount.name}>
                          <Building className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <span className="truncate font-medium">{row.crmAccount.name}</span>
                        </div>
                        {row.installation && (
                          <div className="flex items-center gap-1 truncate text-muted-foreground" title={row.installation.name}>
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{row.installation.name}</span>
                          </div>
                        )}
                      </div>
                    );
                  },
                },
                {
                  id: "_actions",
                  header: "",
                  cell: (row) => (
                    <DteActionsMenu
                      row={row}
                      canManage={canManage}
                      sendingEmail={sendingEmail}
                      checkingStatus={checkingStatus}
                      voiding={voiding}
                      deletingDraft={deletingDraftId}
                      onViewDetail={() => setDetailDteId(row.id)}
                      onPreviewPdf={() => setPreviewDteId(row.id)}
                      onDownloadPdf={() => handleDownloadPdf(row.id, row.folio)}
                      onDownloadXml={() => handleDownloadXml(row.id, row.folio)}
                      onResendEmail={() => handleResendEmail(row.id)}
                      onCheckStatus={() => handleCheckStatus(row.id, row.folio)}
                      onVoid={() => handleVoid(row.id)}
                      onCede={() => setCedeModalDteId(row.id)}
                      onCreditNote={() => setNoteModal({ dteId: row.id, noteType: "credit" })}
                      onDebitNote={() => setNoteModal({ dteId: row.id, noteType: "debit" })}
                      onEditDraft={() => handleEditDraft(row.id)}
                      onIssueDraft={() => handleIssueDraft(row.id)}
                      onDeleteDraft={() => handleDeleteDraft(row.id)}
                    />
                  ),
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
              const isDraftRow = d.siiStatus === "DRAFT";
              return (
                <Card
                  key={d.id}
                  className="cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() =>
                    isDraftRow ? handleEditDraft(d.id) : setDetailDteId(d.id)
                  }
                >
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
                          {!isDraftRow && (
                            <span className="font-mono text-xs">#{d.folio}</span>
                          )}
                          <Badge variant="outline" className={cn("text-xs", stCfg.className)}>
                            {stCfg.label}
                          </Badge>
                          {d.date && (
                            <DteAgingBadge
                              date={d.date}
                              dueDate={d.dueDate}
                              paymentStatus={d.paymentStatus}
                              siiStatus={d.siiStatus}
                            />
                          )}
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
                    <div
                      className="flex gap-1 mt-3 pt-3 border-t border-border"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isDraftRow ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditDraft(d.id)}
                          className="flex-1 justify-center"
                        >
                          <FileEdit className="h-3.5 w-3.5 mr-1.5" />
                          Editar
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDetailDteId(d.id)}
                          className="flex-1 justify-center"
                        >
                          <Eye className="h-3.5 w-3.5 mr-1.5" />
                          Detalle
                        </Button>
                      )}
                      <DteActionsMenu
                        row={d}
                        canManage={canManage}
                        sendingEmail={sendingEmail}
                        checkingStatus={checkingStatus}
                        voiding={voiding}
                        deletingDraft={deletingDraftId}
                        onViewDetail={() => setDetailDteId(d.id)}
                        onPreviewPdf={() => setPreviewDteId(d.id)}
                        onDownloadPdf={() => handleDownloadPdf(d.id, d.folio)}
                        onDownloadXml={() => handleDownloadXml(d.id, d.folio)}
                        onResendEmail={() => handleResendEmail(d.id)}
                        onCheckStatus={() => handleCheckStatus(d.id, d.folio)}
                        onVoid={() => handleVoid(d.id)}
                        onCede={() => setCedeModalDteId(d.id)}
                        onCreditNote={() =>
                          setNoteModal({ dteId: d.id, noteType: "credit" })
                        }
                        onDebitNote={() =>
                          setNoteModal({ dteId: d.id, noteType: "debit" })
                        }
                        onEditDraft={() => handleEditDraft(d.id)}
                        onIssueDraft={() => handleIssueDraft(d.id)}
                        onDeleteDraft={() => handleDeleteDraft(d.id)}
                        triggerVariant="ghost"
                        hideViewDetail
                      />
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

      {/* Modal NC/ND */}
      <CreditNoteModal
        open={noteModal !== null}
        onClose={() => setNoteModal(null)}
        referenceDteId={noteModal?.dteId ?? null}
        noteType={noteModal?.noteType ?? "credit"}
      />

      {/* Modal de detalle DTE emitido */}
      <IssuedDteDetailDialog
        open={detailDteId !== null}
        onClose={() => setDetailDteId(null)}
        dteId={detailDteId}
        canManage={canManage}
        onEmitCreditNote={(id) => setNoteModal({ dteId: id, noteType: "credit" })}
        onEmitDebitNote={(id) => setNoteModal({ dteId: id, noteType: "debit" })}
      />

      {/* Modal de cesión a factoring desde la fila */}
      {(() => {
        const cedeDte = dtes.find((d) => d.id === cedeModalDteId);
        if (!cedeDte) return null;
        return (
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
        );
      })()}

      {/* Modal de vista previa PDF */}
      {(() => {
        const previewDte = dtes.find((d) => d.id === previewDteId);
        if (!previewDte) return null;
        return (
          <PdfPreviewDialog
            open={previewDteId !== null}
            onOpenChange={(o) => !o && setPreviewDteId(null)}
            dteId={previewDte.id}
            folio={previewDte.folio}
            dteType={previewDte.dteType}
            onDownload={() => handleDownloadPdf(previewDte.id, previewDte.folio)}
          />
        );
      })()}

      {/* Modal de envío de email con TO/CC/BCC editables. Reemplaza el
          envío directo "manda al receptor por default" sin opciones. */}
      {(() => {
        const emailDte = dtes.find((d) => d.id === emailDteId);
        if (!emailDte) return null;
        return (
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
        );
      })()}

      {/* Modal de emisión SII para un borrador (desde la fila). */}
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

  // KPIs agregados.
  const totalDisponibles = folios.reduce((acc, f) => acc + f.disponibles, 0);
  const lowStockCount = folios.filter((f) => f.lowStock).length;
  const tiposConCAF = folios.filter((f) => f.totalCAF > 0).length;
  const expiring = folios
    .filter((f) => f.cafExpiraEn !== null)
    .map((f) => {
      const dias = Math.ceil(
        (new Date(f.cafExpiraEn as string).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24),
      );
      return dias;
    })
    .filter((dias) => dias <= 90);
  const expiringCount = expiring.length;
  const minDiasRestantes = expiring.length > 0 ? Math.min(...expiring) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FoliosKpiCards
        totalDisponibles={totalDisponibles}
        tiposConCAF={tiposConCAF}
        lowStockCount={lowStockCount}
        expiringCount={expiringCount}
        minDiasRestantes={minDiasRestantes}
      />
      <p className="text-xs text-muted-foreground">
        Estado de folios CAF por tipo de DTE
      </p>
      <FoliosDetailTable rows={folios} canManage={canManage} />
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
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className={cn("text-xs", payCfg.className)}>
                          {payCfg.label}
                        </Badge>
                        {/* Aging para compras: mismo patrón que emitidos.
                            Si la factura está PAID o CEDED no muestra
                            aging (resuelto financieramente). */}
                        {row.date && row.paymentStatus !== "PAID" && (
                          <DteAgingBadge
                            date={row.date}
                            dueDate={row.dueDate}
                            paymentStatus={row.paymentStatus}
                            siiStatus="ACCEPTED"
                          />
                        )}
                      </div>
                    );
                  },
                },
                {
                  id: "centroCosto",
                  header: "Centro de costo",
                  cell: (row) => {
                    if (!row.crmAccount) {
                      return <span className="text-xs text-muted-foreground italic">Sin asignar</span>;
                    }
                    return (
                      <div className="text-xs space-y-0.5">
                        <div className="flex items-center gap-1 truncate" title={row.crmAccount.name}>
                          <Building className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <span className="truncate font-medium">{row.crmAccount.name}</span>
                        </div>
                        {row.installation && (
                          <div className="flex items-center gap-1 truncate text-muted-foreground" title={row.installation.name}>
                            <MapPin className="h-3 w-3 shrink-0" />
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
        onDecided={() => {
          // Tras un acuse exitoso al SII, refrescamos la lista para
          // que el badge de recepción y los filtros reflejen el cambio.
          loadReceivedDtes();
        }}
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
  onDecided,
}: {
  dte: ReceivedDteRow | null;
  onClose: () => void;
  suppliers: SupplierOption[];
  canManage: boolean;
  /**
   * Callback que se dispara después de un acuse SII exitoso (aceptar o
   * reclamar). El caller debe refrescar la lista para que el nuevo
   * `receptionStatus` se vea reflejado en la tabla y filtros.
   */
  onDecided?: () => void;
}) {
  const [attachments, setAttachments] = useState<DteAttachment[]>([]);
  const [loadingAtt, setLoadingAtt] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  /**
   * Acción de acuse en curso. Bloquea el resto de los botones para
   * evitar dobles clicks que generarían dos llamadas al SII.
   */
  const [acuseLoading, setAcuseLoading] = useState<
    null | "ACCEPT" | "CLAIM_CONTENT" | "CLAIM_PARTIAL" | "CLAIM_TOTAL"
  >(null);

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

  /**
   * Notifica al SII (vía SimpleAPI) la aceptación o reclamo del DTE
   * recibido. Cada acción es IRREVERSIBLE legalmente — pedimos
   * confirmación textual antes de disparar la llamada.
   *
   * En éxito: cierra el modal y dispara `onDecided` para refrescar la
   * lista. En error: muestra toast con el mensaje del backend (que viene
   * mapeado del provider, así que el usuario ve causa-raíz: cert vencido,
   * apikey bloqueada, fuera de plazo, etc.).
   */
  async function handleAcuse(
    action: "ACCEPT" | "CLAIM_CONTENT" | "CLAIM_PARTIAL" | "CLAIM_TOTAL",
  ) {
    if (!dte) return;
    const labels: Record<typeof action, string> = {
      ACCEPT:
        "ACEPTAR el DTE y entregar acuse de recibo de mercaderías al SII (habilita uso del crédito IVA)",
      CLAIM_CONTENT: "RECLAMAR EL CONTENIDO del DTE en el SII (RCD)",
      CLAIM_PARTIAL:
        "Reportar al SII FALTA PARCIAL DE MERCADERÍAS (RFP)",
      CLAIM_TOTAL: "Reportar al SII FALTA TOTAL DE MERCADERÍAS (RFT)",
    };
    const ok = window.confirm(
      `Vas a ${labels[action]}.\n\n` +
        `Esta acción es IRREVERSIBLE en el SII. ¿Continuar?`,
    );
    if (!ok) return;

    let reason: string | undefined;
    if (action !== "ACCEPT") {
      const r = window.prompt(
        "Motivo del reclamo (opcional, se guarda en notas para auditoría):",
        "",
      );
      reason = r?.trim() || undefined;
    }

    setAcuseLoading(action);
    try {
      const res = await fetch(
        `/api/finance/billing/received/${dte.id}/acuse`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, reason }),
        },
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Error al notificar al SII");
      }
      toast.success(
        json.data?.message ?? "Acción notificada al SII correctamente",
      );
      onDecided?.();
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAcuseLoading(null);
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

          {/* Botones de Acuse al SII — solo cuando el DTE está PENDING_REVIEW
              y el usuario tiene permisos. La acción notifica al SII vía
              SimpleAPI (endpoint compras/aceptacionreclamo) y persiste el
              cambio en FinanceDte.receptionStatus. Operación irreversible. */}
          {canManage && dte.receptionStatus === "PENDING_REVIEW" && (
            <div className="rounded-md border border-status-info-border bg-status-info-soft p-3 space-y-2">
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
                  onClick={() => handleAcuse("ACCEPT")}
                  disabled={acuseLoading !== null}
                  className="h-9"
                >
                  {acuseLoading === "ACCEPT" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : null}
                  Aceptar (ACD + ERM)
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAcuse("CLAIM_CONTENT")}
                  disabled={acuseLoading !== null}
                  className="h-9 border-status-danger-border text-status-danger-fg hover:bg-status-danger-soft"
                >
                  {acuseLoading === "CLAIM_CONTENT" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : null}
                  Reclamar contenido (RCD)
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAcuse("CLAIM_PARTIAL")}
                  disabled={acuseLoading !== null}
                  className="h-9 border-status-warn-border text-status-warn-fg hover:bg-status-warn-soft"
                >
                  {acuseLoading === "CLAIM_PARTIAL" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : null}
                  Falta parcial (RFP)
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAcuse("CLAIM_TOTAL")}
                  disabled={acuseLoading !== null}
                  className="h-9 border-status-danger-border text-status-danger-fg hover:bg-status-danger-soft"
                >
                  {acuseLoading === "CLAIM_TOTAL" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : null}
                  Falta total (RFT)
                </Button>
              </div>
            </div>
          )}

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

          {/* Centro de costo: cliente CRM al que se imputa este gasto.
              Mismo tratamiento visual que el bloque "Emisor" (bg-muted/30)
              para mantener contraste en dark mode cuando "Sin asignar" no
              tiene datos — el border-only se desvanecía. */}
          <div className="rounded-md border border-border bg-muted/30 p-4 space-y-2">
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Centro de costo
              </p>
              <span className="text-[12px] text-muted-foreground italic">
                Click para editar
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
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
                // El usuario debe refrescar la lista para ver el cambio
                // reflejado en la tabla. Toast lo avisa.
              }}
            />
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

          <div className="rounded-md border border-status-info-border bg-status-info-soft p-3 text-xs text-status-info-fg">
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
