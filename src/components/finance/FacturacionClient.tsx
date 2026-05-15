"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { FoliosKpiCards } from "./FoliosKpiCards";
import { FoliosDetailTable } from "./FoliosDetailTable";
import { LibroIvaTab } from "./LibroIvaTab";
import { BorradoresTab } from "./BorradoresTab";
import { SaludFinancieraHero } from "./SaludFinancieraHero";
import { RecibidosClient, type SupplierOption } from "./dtes";

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
  activeCession?: {
    id: string;
    code: string;
    status: string;
    factoringCompany?: string | null;
  } | null;
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
    return <RecibidosClient suppliers={suppliers} canManage={canManage} />;
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

