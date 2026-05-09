"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { DataTable, EmptyState, Tag, type DataTableColumn, type TagVariant } from "@/components/opai-ds";
import { DocumentTag, fmtCLPSmart, KpiStripReceived } from "@/components/finance/dtes";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobileViewport } from "@/hooks/useIsMobileViewport";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  FileText,
  FileInput,
  Plus,
  Search,
  Download,
  Ban,
  FilePlus,
  Loader2,
  RefreshCw,
  FileCode,
  Eye,
  ExternalLink,
  Building,
  MapPin,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { FoliosKpiCards } from "./FoliosKpiCards";
import { FoliosDetailTable } from "./FoliosDetailTable";
import { DteAgingBadge } from "./DteAgingBadge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PaginationControls } from "./PaginationControls";
// FacturacionDashboardWidgets ya no se importa: KPIRow se eliminó en
// Fase 7 y TrendChart en Fase 8 (la tendencia ahora vive dentro del
// SaludFinancieraHero con su propio selector de rango).
// import { TrendChart, KPIRow } from "./FacturacionDashboardWidgets";
import { LibroIvaTab } from "./LibroIvaTab";
import { BorradoresTab } from "./BorradoresTab";
import { CostCenterEditor } from "./CostCenterEditor";
import { SaludFinancieraHero } from "./SaludFinancieraHero";

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
  /**
   * NCs vivas que referencian a este DTE. Si hay al menos una, la lista
   * pinta un badge "Con NC" (rojo si es anulación total, ámbar si es
   * corrección parcial). Null = no tiene NCs asociadas.
   */
  linkedCreditNote?: {
    count: number;
    hasFullAnnulment: boolean;
    creditedNet: number;
    primaryFolio: number;
  } | null;
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

type CostCenterOption = { id: string; name: string; legalName: string | null };
type InstallationOption = { id: string; name: string; commune: string | null };

type DteSortKey =
  | "date_desc"
  | "date_asc"
  | "created_desc"
  | "created_asc"
  | "total_desc"
  | "total_asc";

const DTE_SORT_OPTIONS: { value: DteSortKey; label: string }[] = [
  { value: "date_desc", label: "Emisión: nuevo a antiguo" },
  { value: "date_asc", label: "Emisión: antiguo a nuevo" },
  { value: "created_desc", label: "Últimos ingresados" },
  { value: "created_asc", label: "Primeros ingresados" },
  { value: "total_desc", label: "Monto: mayor a menor" },
  { value: "total_asc", label: "Monto: menor a mayor" },
];

function sortDteRows<T extends { date?: string; createdAt?: string; totalAmount: number; folio: number }>(
  rows: T[],
  sort: DteSortKey,
): T[] {
  const value = (row: T) => {
    switch (sort) {
      case "created_desc":
      case "created_asc":
        return row.createdAt ? new Date(row.createdAt).getTime() : 0;
      case "total_desc":
      case "total_asc":
        return row.totalAmount;
      case "date_asc":
      case "date_desc":
      default:
        return row.date ? new Date(row.date).getTime() : 0;
    }
  };
  const direction = sort.endsWith("_asc") ? 1 : -1;
  return [...rows].sort((a, b) => {
    const diff = value(a) - value(b);
    if (diff !== 0) return diff * direction;
    return (a.folio - b.folio) * direction;
  });
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

/**
 * Vistas disponibles del módulo Facturación.
 *
 * Cada vista corresponde a una ruta real bajo `/finanzas/facturacion`:
 *   - "resumen"      → /finanzas/facturacion           (dashboard de KPIs + salud financiera)
 *   - "dtes"         → /finanzas/facturacion/dtes      (DTEs Emitidos)
 *   - "recibidos"    → /finanzas/facturacion/recibidos (DTEs Recibidos)
 *   - "programacion" → /finanzas/facturacion/programacion (borradores + recurrentes)
 *   - "libro-iva"    → /finanzas/facturacion/libro-iva
 *   - "folios"       → /finanzas/facturacion/folios
 *
 * Las acciones — "Emitir DTE", "Nota Crédito", "Nota Débito" — siguen siendo
 * páginas (`/emitir`, `/notas/credito`, `/notas/debito`) pero NO son vistas
 * del N3: se acceden contextualmente desde botones del Resumen / DTEs.
 */
export type FacturacionView =
  | "resumen"
  | "dtes"
  | "recibidos"
  | "programacion"
  | "libro-iva"
  | "folios";

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
  /**
   * Vista activa. Default `"resumen"` — el dashboard. Cada subvista vive
   * en una ruta propia y debe pasar este prop explícitamente desde su
   * server page.
   */
  view?: FacturacionView;
  /**
   * Filtro forzado de estado SII para el listado de DTEs Emitidos
   * (deeplink desde KPIs del resumen). Solo aplica cuando view==="dtes".
   */
  forcedSiiStatus?: string | null;
  /**
   * Filtro forzado de estado de pago para el listado de DTEs Emitidos
   * (deeplink desde KPIs del Salud Financiera: Por cobrar / Aging / Vencidas).
   */
  forcedPaymentStatus?: string | null;
}

/* ── Constants ── */

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
  view = "resumen",
  forcedSiiStatus = null,
  forcedPaymentStatus = null,
}: Props) {
  const router = useRouter();
  // Filtro de período de la TABLA DTEs Emitidos (toolbar interno) y del
  // TrendChart de abajo. El hero "Salud financiera" tiene su PROPIO
  // selector independiente (decisión consciente: hero muestra el período
  // estratégico, tabla muestra el período transaccional). Default ALL
  // coincide con el comportamiento previo.
  const [periodoFilter, setPeriodoFilter] = useState("ALL");
  // Mantenemos un state local consumible por DtesTab; el server page lo
  // hidrata vía `forcedSiiStatus` (deeplink desde el KPI "Pendientes SII"
  // del Resumen, o cuando alguien comparte el link con ?siiStatus=PENDING).
  const [forcedStatusFilter, setForcedStatusFilter] = useState<string | null>(
    forcedSiiStatus,
  );
  const [forcedPaymentStatusFilter, setForcedPaymentStatusFilter] = useState<
    string | null
  >(forcedPaymentStatus);

  // Compatibilidad: `initialKpis` ya no se renderiza en KPIRow (eliminado
  // en Fase 7) pero el SC lo sigue calculando para los reportes y para
  // que el hero pueda recibir un fallback inicial si falla el fetch.
  void initialKpis;

  // ── Resumen: dashboard sin tabs ──
  // Las CTAs del hero ahora navegan a las rutas reales (deeplinks).
  if (view === "resumen") {
    return (
      <div className="space-y-4">
        <SaludFinancieraHero
          onClickVencidas={() => {
            router.push("/finanzas/facturacion/dtes?paymentStatus=OVERDUE");
          }}
          onClickPendientesSii={() => {
            router.push("/finanzas/facturacion/dtes?siiStatus=PENDING");
          }}
          onClickFolios={() => {
            router.push("/finanzas/facturacion/folios");
          }}
          onClickFacturado={() => {
            router.push("/finanzas/reportes/ventas");
          }}
          onClickCobrado={() => {
            router.push("/finanzas/reportes/ventas");
          }}
          onClickPorCobrar={() => {
            router.push("/finanzas/facturacion/dtes?paymentStatus=UNPAID");
          }}
          onClickMargen={() => {
            router.push("/finanzas/reportes/rentabilidad");
          }}
          onClickCompras={() => {
            router.push("/finanzas/reportes/compras");
          }}
          onClickIva={() => {
            router.push("/finanzas/facturacion/libro-iva");
          }}
          onClickDso={() => {
            router.push("/finanzas/reportes/ventas");
          }}
          onClickSaldoBanco={() => {
            router.push("/finanzas/bancos");
          }}
          onClickLiquidez={() => {
            router.push("/finanzas/bancos");
          }}
          onClickAging={() => {
            router.push("/finanzas/facturacion/dtes?paymentStatus=UNPAID");
          }}
          onClickDeudor={(accountId) => {
            if (accountId)
              router.push(`/finanzas/reportes/ventas/${accountId}`);
          }}
        />
      </div>
    );
  }

  // ── Vistas individuales (sin tab nav interno; la N3 vive en el layout). ──
  // NOTA: la vista "dtes" se renderiza ahora directamente desde la página
  // /finanzas/facturacion/dtes con `<DtesEmitidosClient />`. Refactor 2026-05.
  if (view === "dtes") {
    // Guard de compat: aún se mantiene por si algún consumidor antiguo del
    // FacturacionClient pasa view="dtes". El flujo principal ya no entra acá.
    void issuedTotal;
    void periodoFilter;
    void setPeriodoFilter;
    void forcedStatusFilter;
    void setForcedStatusFilter;
    void forcedPaymentStatusFilter;
    void setForcedPaymentStatusFilter;
    return null;
  }
  if (view === "recibidos") {
    return <RecibidosTab suppliers={suppliers} canManage={canManage} />;
  }
  if (view === "programacion") {
    return <BorradoresTab canManage={canManage} />;
  }
  if (view === "libro-iva") {
    return <LibroIvaTab />;
  }
  if (view === "folios") {
    return <FoliosTab canManage={canManage} />;
  }

  return null;
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
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [receptionFilter, setReceptionFilter] = useState("ALL");
  const [paymentFilter, setPaymentFilter] = useState("ALL");
  const [sort, setSort] = useState<DteSortKey>("date_desc");
  const [accountFilter, setAccountFilter] = useState("ALL");
  const [installationFilter, setInstallationFilter] = useState("ALL");
  const [accountOptions, setAccountOptions] = useState<CostCenterOption[]>([]);
  const [installationOptions, setInstallationOptions] = useState<InstallationOption[]>([]);
  /** Filtro por período. Default CURRENT_MONTH = mes en curso. "ALL" = todos los períodos. */
  const [periodoFilter, setPeriodoFilter] = useState("CURRENT_MONTH");
  const periodOptions = useMemo(() => buildPeriodOptions(36), []);
  // Paginación server-side (selector 10/25/50/100/200) + slide-over de detalle.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [detailDte, setDetailDte] = useState<ReceivedDteRow | null>(null);
  /** Drawer de filtros estructurado (consistente con DTEs Emitidos). */
  const [filtersOpen, setFiltersOpen] = useState(false);

  const activeFilterCount =
    (typeFilter !== "ALL" ? 1 : 0) +
    (receptionFilter !== "ALL" ? 1 : 0) +
    (paymentFilter !== "ALL" ? 1 : 0) +
    // Default es CURRENT_MONTH; solo es "filtro activo" si el usuario eligió otra cosa.
    (periodoFilter !== "CURRENT_MONTH" ? 1 : 0) +
    (accountFilter !== "ALL" ? 1 : 0) +
    (installationFilter !== "ALL" ? 1 : 0);

  const resetFilters = () => {
    setTypeFilter("ALL");
    setReceptionFilter("ALL");
    setPaymentFilter("ALL");
    setPeriodoFilter("CURRENT_MONTH");
    setAccountFilter("ALL");
    setInstallationFilter("ALL");
  };

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
      // periodoFilter === "ALL" significa "todos los períodos": no se manda.
      // Cualquier otro valor (CURRENT_MONTH | YYYY-MM) se envía y el endpoint lo interpreta.
      if (periodoFilter !== "ALL") params.set("periodo", periodoFilter);
      if (accountFilter !== "ALL") params.set("accountId", accountFilter);
      if (installationFilter !== "ALL") params.set("installationId", installationFilter);
      params.set("sort", sort);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const res = await fetch(`/api/finance/billing/received?${params.toString()}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      // El endpoint devuelve { data: { dtes: [...], pagination: {...} } }.
      // Defensivo: aceptamos también la forma plana { data: [...] } por si
      // algún wrapper futuro lo cambia.
      const rawList = Array.isArray(json?.data)
        ? json.data
        : Array.isArray(json?.data?.dtes)
          ? json.data.dtes
          : [];
      // Prisma Decimal se serializa como string en JSON. Si no
      // normalizamos, los reduces de totales hacen concatenación de
      // strings ("109990" + "343029" = "109990343029") en vez de sumar.
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
  }, [page, pageSize, periodoFilter, accountFilter, installationFilter, sort]);

  useEffect(() => { loadReceivedDtes(); }, [loadReceivedDtes]);

  // Reset page=1 cuando cambia el período (para no quedar en página vacía).
  useEffect(() => {
    setPage(1);
  }, [periodoFilter, accountFilter, installationFilter, sort]);

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
    return sortDteRows(list, sort);
  }, [receivedDtes, typeFilter, receptionFilter, paymentFilter, search, sort]);

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
      r.date ? format(new Date(r.date), "yyyy-MM-dd", { locale: es }) : "",
      r.dueDate ? format(new Date(r.dueDate), "yyyy-MM-dd", { locale: es }) : "",
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
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4">
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
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 rounded-full bg-primary/15 text-primary text-[11px] font-medium px-1.5">
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

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {typeFilter !== "ALL" && (
            <Badge variant="outline" className="gap-1.5 pr-1 h-7">
              <span className="text-[12px]">
                Tipo: {DTE_TYPE_SHORT_LABELS[Number(typeFilter)] ?? typeFilter}
              </span>
              <button
                type="button"
                onClick={() => setTypeFilter("ALL")}
                className="h-4 w-4 inline-flex items-center justify-center rounded-sm hover:bg-ds-surface-3"
                aria-label="Quitar filtro tipo"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {receptionFilter !== "ALL" && (
            <Badge variant="outline" className="gap-1.5 pr-1 h-7">
              <span className="text-[12px]">
                Recepción: {RECEPTION_STATUS_CONFIG[receptionFilter]?.label ?? receptionFilter}
              </span>
              <button
                type="button"
                onClick={() => setReceptionFilter("ALL")}
                className="h-4 w-4 inline-flex items-center justify-center rounded-sm hover:bg-ds-surface-3"
                aria-label="Quitar filtro recepción"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {paymentFilter !== "ALL" && (
            <Badge variant="outline" className="gap-1.5 pr-1 h-7">
              <span className="text-[12px]">
                Pago: {PAYMENT_STATUS_CONFIG[paymentFilter]?.label ?? paymentFilter}
              </span>
              <button
                type="button"
                onClick={() => setPaymentFilter("ALL")}
                className="h-4 w-4 inline-flex items-center justify-center rounded-sm hover:bg-ds-surface-3"
                aria-label="Quitar filtro pago"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {periodoFilter !== "ALL" && (
            <Badge variant="outline" className="gap-1.5 pr-1 h-7">
              <span className="text-[12px]">
                Período: {periodOptions.find((p) => p.value === periodoFilter)?.label ?? periodoFilter}
              </span>
              <button
                type="button"
                onClick={() => setPeriodoFilter("ALL")}
                className="h-4 w-4 inline-flex items-center justify-center rounded-sm hover:bg-ds-surface-3"
                aria-label="Quitar filtro período"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {accountFilter !== "ALL" && (
            <Badge variant="outline" className="gap-1.5 pr-1 h-7">
              <span className="text-[12px]">
                Centro:{" "}
                {accountFilter === "NONE"
                  ? "Sin asignar"
                  : accountOptions.find((a) => a.id === accountFilter)?.name ?? "—"}
              </span>
              <button
                type="button"
                onClick={() => setAccountFilter("ALL")}
                className="h-4 w-4 inline-flex items-center justify-center rounded-sm hover:bg-ds-surface-3"
                aria-label="Quitar filtro centro"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {installationFilter !== "ALL" && (
            <Badge variant="outline" className="gap-1.5 pr-1 h-7">
              <span className="text-[12px]">
                Instalación:{" "}
                {installationFilter === "NONE"
                  ? "Sin instalación"
                  : installationOptions.find((i) => i.id === installationFilter)?.name ?? "—"}
              </span>
              <button
                type="button"
                onClick={() => setInstallationFilter("ALL")}
                className="h-4 w-4 inline-flex items-center justify-center rounded-sm hover:bg-ds-surface-3"
                aria-label="Quitar filtro instalación"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            className="h-7 px-2 text-[12px] text-ds-text-3 hover:text-ds-text-1"
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
            <strong className="text-ds-text-1 font-mono">
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
              onRowClick={(row) => setDetailDte(row)}
              empty={<EmptyState icon={FileInput} title="Sin documentos recibidos" compact />}
            />
          </div>

          {/* Mobile cards — mismo layout que IssuedDtesMobileList (DTEs Emitidos)
              para mantener consistencia visual entre los dos listados. */}
          <div className="md:hidden space-y-2">
            {(Array.isArray(filtered) ? filtered : []).map((d) => (
              <ReceivedDteMobileCard
                key={d.id}
                dte={d}
                onClick={() => setDetailDte(d)}
              />
            ))}
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
              <Label className="text-[12px] uppercase tracking-wide text-ds-text-3">
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
              <Label className="text-[12px] uppercase tracking-wide text-ds-text-3">
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
              <Label className="text-[12px] uppercase tracking-wide text-ds-text-3">
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
              <Label className="text-[12px] uppercase tracking-wide text-ds-text-3">
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
              <Label className="text-[12px] uppercase tracking-wide text-ds-text-3">
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
              <Label className="text-[12px] uppercase tracking-wide text-ds-text-3">
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
 * Card mobile para un DTE Recibido. Mismo layout que IssuedDtesMobileList
 * (DTEs Emitidos) para mantener paridad visual entre ambas vistas:
 *   [DocumentTag] #folio  [recepción]  [pago]  [aging]
 *   Emisor
 *   RUT
 *   $monto (compact)         dd MMM yyyy
 *   ─────────────────────────────────────
 *   [ Detalle ]
 */
function ReceivedDteMobileCard({
  dte,
  onClick,
}: {
  dte: ReceivedDteRow;
  onClick: () => void;
}) {
  const recVariant: TagVariant =
    dte.receptionStatus === "ACCEPTED"
      ? "ok"
      : dte.receptionStatus === "CLAIMED"
        ? "danger"
        : "warn";
  const recLabel =
    RECEPTION_STATUS_CONFIG[dte.receptionStatus]?.label ?? dte.receptionStatus;
  const payVariant: TagVariant =
    dte.paymentStatus === "PAID"
      ? "ok"
      : dte.paymentStatus === "PARTIAL"
        ? "warn"
        : "danger";
  const payLabel =
    PAYMENT_STATUS_CONFIG[dte.paymentStatus]?.label ?? dte.paymentStatus;
  return (
    <Card
      className="cursor-pointer hover:bg-ds-surface-2 transition-colors border-l-[3px] border-l-transparent"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <DocumentTag dteType={dte.dteType} />
              <span className="font-mono text-xs text-ds-text-2">
                #{dte.folio}
              </span>
              <Tag variant={recVariant} size="sm" dot>
                {recLabel}
              </Tag>
              <Tag variant={payVariant} size="sm" dot>
                {payLabel}
              </Tag>
              {dte.date && dte.paymentStatus !== "PAID" && (
                <DteAgingBadge
                  date={dte.date}
                  dueDate={dte.dueDate}
                  paymentStatus={dte.paymentStatus}
                  siiStatus="ACCEPTED"
                />
              )}
            </div>
            <p className="font-medium text-sm text-ds-text-1 truncate">
              {dte.issuerName}
            </p>
            <p className="text-xs text-ds-text-3 font-mono">{dte.issuerRut}</p>
            <div className="flex items-center justify-between gap-2 mt-2">
              <span
                className="font-mono text-sm font-semibold tabular-nums truncate"
                title={dte.totalAmount.toLocaleString("es-CL")}
              >
                {fmtCLPSmart(dte.totalAmount)}
              </span>
              <span className="text-xs text-ds-text-3 shrink-0">
                {format(new Date(dte.date), "dd MMM yyyy", { locale: es })}
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
            className="flex-1 justify-center"
          >
            <Eye className="h-3.5 w-3.5 mr-1.5" />
            Detalle
          </Button>
        </div>
      </CardContent>
    </Card>
  );
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
  const isMobileViewport = useIsMobileViewport();
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
  /**
   * Estado del modal "¿Notificar al SII?". Cuando el usuario clickea
   * Aceptar / Reclamar, en vez de disparar la llamada directo, abrimos
   * este modal donde puede:
   *   1. Confirmar la acción.
   *   2. Elegir si notificar al SII (default sí) o solo guardar en
   *      OPAI como clasificación interna.
   *   3. Agregar un motivo (para reclamos).
   *
   * IMPORTANTE: este `useState` debe ir junto con los otros hooks
   * ANTES del `if (!dte) return null` para no violar las reglas de
   * hooks (la cantidad debe ser estable entre renders, sino React
   * lanza error #310).
   */
  const [acusePending, setAcusePending] = useState<{
    action: "ACCEPT" | "CLAIM_CONTENT" | "CLAIM_PARTIAL" | "CLAIM_TOTAL";
    notifySii: boolean;
    reason: string;
  } | null>(null);

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

  /** Dispara el modal de confirmación de acuse. */
  function openAcuseConfirm(
    action: "ACCEPT" | "CLAIM_CONTENT" | "CLAIM_PARTIAL" | "CLAIM_TOTAL",
  ) {
    setAcusePending({ action, notifySii: true, reason: "" });
  }

  /**
   * Ejecuta la acción confirmada en el modal. Manda `notifySii` al
   * backend; si es false, solo se actualiza el estado local en OPAI.
   * Si es true, se llama a SimpleAPI → SII (irreversible).
   */
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
  // Forwarded as helper for shell layout below.
  void recCfg;
  void payCfg;

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

      {/* Modal de confirmación de Acuse SII.
          Permite al usuario decidir si la decisión se notifica al SII
          (irreversible legalmente) o solo se guarda en OPAI como
          clasificación interna. Esto es clave para que el operador
          marque facturas que ya validó por otro canal sin escalarlas. */}
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
 * Diseño UX: por default `notifySii=true` (lo que el usuario espera al
 * clickear "Aceptar"). Si destildea, la operación queda solo registrada
 * localmente en OPAI sin tocar el SII — útil para validaciones internas
 * o para marcar facturas legítimas que ya fueron aceptadas por otro
 * canal (ej: el contador acepta directamente desde el portal SII y solo
 * quiere clasificar en OPAI).
 *
 * El switch grande con descripción contextual ayuda a no confundir esta
 * decisión, que es la diferencia entre una acción irreversible legal y
 * un cambio cosmético interno.
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
          <p className="text-sm text-muted-foreground">
            Estás por <span className="font-semibold text-foreground">{meta.verb}</span>{" "}
            la factura folio{" "}
            <span className="font-mono text-foreground">{dteFolio}</span> de{" "}
            <span className="font-medium text-foreground">{dteIssuer}</span>.
          </p>

          {/* Toggle Notificar al SII */}
          <div
            className={cn(
              "rounded-md border p-3",
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
                <p className="text-xs text-muted-foreground mt-1">
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
                <span className="text-xs font-normal text-muted-foreground">
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
