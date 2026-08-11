/**
 * Detalle de cotización CPQ
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRegisterChatPageContext } from "@/components/opai/ChatPageContextProvider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, Tag, useSetBreadcrumbTrailing } from "@/components/opai-ds";
import { CreatePositionModal } from "@/components/cpq/CreatePositionModal";
import { CpqServiceGroupCard } from "@/components/cpq/CpqServiceGroupCard";
import { CreateServiceModal } from "@/components/cpq/CreateServiceModal";
import { CpqPositionCard } from "@/components/cpq/CpqPositionCard";
import { CpqStatusBadge } from "@/components/cpq/CpqStatusBadge";
import { PositionMatrix } from "@/components/cpq/position-matrix";
import { usePositionMatrixCpq } from "@/components/cpq/position-matrix/usePositionMatrixCpq";
import { CpqQuoteCosts } from "@/components/cpq/CpqQuoteCosts";
import { SendPortalProposalModal } from "@/components/cpq/SendPortalProposalModal";
import { formatCurrency } from "@/components/cpq/utils";
import { CpqDualCurrencyAmount } from "@/components/cpq/CpqDualCurrency";
import {
  CPQ_BREAKDOWN_SHELL,
  CPQ_BREAKDOWN_ROW,
  cpqBreakdownAmount,
} from "@/components/cpq/cpqBreakdownLayout";
import { cn, formatNumber } from "@/lib/utils";
import type {
  CpqQuote,
  CpqPosition,
  CpqQuoteAdditionalLine,
  CpqQuoteCostSummary,
  CpqQuoteParameters,
  CpqQuoteCostItem,
  CpqQuoteUniformItem,
  CpqQuoteExamItem,
  CpqQuoteMeal,
  CpqQuoteVehicle,
  CpqQuoteInfrastructure,
  MarginMode,
  CpqServiceGroup,
} from "@/types/cpq";
import { toast } from "sonner";
import { confirmDialog } from "@/components/ui/confirm-service";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, ChevronDown, Copy, RefreshCw, Users, MoreVertical, Trash2, Loader2, Building2, Plus, MessageCircle, Send, CheckCircle2, Briefcase, Phone, PencilLine, CalendarDays, FileSignature, Eye, PanelRightClose, PanelRightOpen, Unlink } from "lucide-react";
import { DatosSection } from "@/components/cpq/DatosSection";
import MarginSection from "@/components/cpq/MarginSection";
import { QuoteAttachmentsSection } from "@/components/cpq/QuoteAttachmentsSection";
import {
  CpqPdfPreviewPanel,
  type CpqPdfPreviewMode,
  type CpqPdfTemplateSlug,
} from "@/components/cpq/CpqPdfPreviewPanel";
import { buildBreakdownData } from "@/components/cpq/FinancialPanel";
import { QuoteBreakdownPanel } from "@/components/cpq/QuoteBreakdownPanel";
import { QuoteIncludesEditor } from "@/components/cpq/QuoteIncludesEditor";
import { MobileBottomBar } from "@/components/cpq/MobileBottomBar";
import type { FollowUpDecision } from "@/components/cpq/FollowUpDecisionModal";
import { CrmActivityTimeline } from "@/components/crm/CrmActivityTimeline";
import { VisitaTecnicaSolicitudModal } from "@/components/cpq/VisitaTecnicaSolicitudModal";
import { ServiceTemplateButtons } from "@/components/cpq/ServiceTemplateButtons";
import type { ServiceTemplate } from "@/lib/cpq/service-templates";
import { resolveTemplateRowCatalog } from "@/lib/cpq/resolve-cpq-role-from-shift-pattern";
import { isCpqQuoteListedInClientPortal } from "@/lib/cpq-portal-visibility";
import { buildDefaultPortalInviteEmailSubject } from "@/lib/cpq-portal-email-subject";
import { useWaTemplate } from "@/lib/whatsapp/use-wa-template";
import { CondicionesSection } from "@/components/cpq/workspace/CondicionesSection";
import { LineasSection } from "@/components/cpq/workspace/LineasSection";
import { FinancierosSection } from "@/components/cpq/workspace/FinancierosSection";
import { AiSection } from "@/components/cpq/workspace/AiSection";
import { ControlCenterPanel } from "@/components/cpq/workspace/ControlCenterPanel";
import { WorkspaceRail } from "@/components/cpq/workspace/WorkspaceRail";
import { SectionChips } from "@/components/cpq/workspace/SectionChips";
import { MobileTotalBar } from "@/components/cpq/workspace/MobileTotalBar";
import { useSectionSpy } from "@/components/cpq/workspace/useSectionSpy";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { ConvertToBundleButton } from "@/components/cpq/workspace/ConvertToBundleButton";
import { ControlCenterSheet, ControlCenterTrigger } from "@/components/cpq/workspace/ControlCenterSheet";
import type { QuoteFormState, WorkspaceSectionId } from "@/components/cpq/workspace/types";
import { useQuoteDeleteFlow } from "@/components/cpq/useQuoteDeleteFlow";

type ActivityEvent = {
  id: string;
  action: string;
  details?: Record<string, unknown> | null;
  createdAt: string;
  createdBy?: string | null;
  createdByName?: string | null;
};

interface CpqQuoteDetailProps {
  quoteId: string;
  currentUserId?: string;
  activityEvents?: ActivityEvent[];
  /** Asunto sugerido al abrir «Enviar propuesta al portal» (desde servidor + nombre de cotización). */
  defaultPortalEmailSubject?: string;
  /** Marca comercial para recalcular el asunto cuando carga el detalle de la cotización. */
  tenantBrandName?: string;
  /** Multi-instalación: condiciones y financiero gobernados por la propuesta (solo lectura aquí). */
  conditionsGovernedByProposal?: boolean;
  /** Link "editar a nivel propuesta" (cambia al tab Consolidado). */
  onEditConditionsAtProposal?: () => void;
  /** Bundle al que pertenece la cotización (null = única; oculta Convertir si ya existe). */
  bundleId?: string | null;
  /** Callback tras convertir en multi-instalación (workspace unificado). */
  onConverted?: (bundleId: string, existing: boolean) => void;
  /** Modo única CON bundle (1 instalación): abre el modal Agregar instalación. */
  onAddInstallation?: () => void;
  /** true cuando se renderiza dentro de un tab del workspace multi: oculta
   *  headers/sticky bars/bottom bar propios (los provee el workspace). */
  embedded?: boolean;
  /** Slot de pestañas de instalaciones dentro del stack sticky móvil (multi). */
  mobileTabsSlot?: React.ReactNode;
  /** Total mensual consolidado (CLP) para la barra sticky móvil en multi. */
  mobileTotalClpOverride?: number | null;
  /** Notifica cambios guardados para refrescar totales del bundle (multi). */
  onQuoteSaved?: () => void;
  /** Workspace: solicita eliminación de la cotización desde un contenedor padre. */
  onRequestDelete?: (quoteId: string) => Promise<void> | void;
  /** Workspace: solicita quitar la cotización de la propuesta sin eliminarla. */
  onRequestUnlink?: (quoteId: string) => Promise<void> | void;
  /** Permiso efectivo para mostrar/habilitar acciones destructivas. */
  canDelete?: boolean;
}

type CrmInstallationOption = {
  id: string;
  name: string;
  address?: string | null;
  commune?: string | null;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
};

const DEFAULT_PARAMS: CpqQuoteParameters = {
  monthlyHoursStandard: 180,
  avgStayMonths: 4,
  uniformChangesPerYear: 3,
  financialEnabled: true,
  financialRatePct: 2.5,
  financialBaseMode: "auto",
  salePriceBase: 0,
  salePriceMonthly: 0,
  policyEnabled: false,
  policyAmountMode: "pct",
  policyRatePct: 2,
  policyAdminRatePct: 0.2,
  policyContractMonths: 12,
  policyContractPct: 10,
  policyFixedAmountUF: 0,
  liabilityEnabled: false,
  liabilityMode: "premium",
  liabilityRatePct: 0.3,
  liabilityAnnualPremiumUF: 0,
  liabilityAllocationPct: 100,
  liabilityDeductibleUF: 0,
  contractMonths: 12,
  contractAmount: 0,
  marginPct: 13,
};

export function CpqQuoteDetail({
  quoteId,
  currentUserId,
  activityEvents = [],
  defaultPortalEmailSubject,
  tenantBrandName,
  conditionsGovernedByProposal = false,
  onEditConditionsAtProposal,
  bundleId = null,
  onConverted,
  onAddInstallation,
  embedded = false,
  mobileTabsSlot,
  mobileTotalClpOverride = null,
  onQuoteSaved,
  onRequestDelete,
  onRequestUnlink,
  canDelete,
}: CpqQuoteDetailProps) {
  const router = useRouter();
  const { resolve: resolveWaTemplate } = useWaTemplate();
  const [quote, setQuote] = useState<CpqQuote | null>(null);
  // Isla: código en L1; cuenta · instalación en L2 (dedup si uno contiene al otro).
  const islandSubtitle = useMemo(() => {
    if (!quote) return null;
    const account = (quote.clientName || "").trim();
    const installation = (quote.name || "").trim();
    if (!account && !installation) return null;
    if (!account) return installation;
    if (!installation) return account;
    const hasAccountInName = installation.toLowerCase().includes(account.toLowerCase());
    const hasNameInAccount = account.toLowerCase().includes(installation.toLowerCase());
    if (hasAccountInName || hasNameInAccount) return installation.length >= account.length ? installation : account;
    return `${account} · ${installation}`;
  }, [quote]);
  useSetBreadcrumbTrailing(quote?.code ?? quote?.name, islandSubtitle);

  // Contexto de página para OPAI Intelligence (chat contextual tipo Notion).
  // Mientras la cotización carga, el hook recibe null y no registra contexto.
  useRegisterChatPageContext(
    quote
      ? {
          entityType: "cpq_quote",
          entityId: quote.id,
          entityName: quote.name || quote.code || "Cotización",
          entityUrl: `/crm/cotizaciones/${quote.id}`,
          extra:
            [
              quote.clientName ? `Cliente: ${quote.clientName}` : null,
              quote.dealId
                ? `Negocio asociado (dealId: ${quote.dealId}) — para adjuntar archivos, crear checklist o notas usa ese dealId directamente`
                : "Sin negocio asociado",
            ]
              .filter(Boolean)
              .join(" · ") || undefined,
        }
      : null,
  );
  const [positions, setPositions] = useState<CpqPosition[]>([]);
  const [serviceGroups, setServiceGroups] = useState<CpqServiceGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [costSummary, setCostSummary] = useState<CpqQuoteCostSummary | null>(null);
  const [costParams, setCostParams] = useState<CpqQuoteParameters | null>(null);
  const [costItems, setCostItems] = useState<CpqQuoteCostItem[]>([]);
  const [uniforms, setUniforms] = useState<CpqQuoteUniformItem[]>([]);
  const [exams, setExams] = useState<CpqQuoteExamItem[]>([]);
  const [meals, setMeals] = useState<CpqQuoteMeal[]>([]);
  const [vehicles, setVehicles] = useState<CpqQuoteVehicle[]>([]);
  const [infrastructure, setInfrastructure] = useState<CpqQuoteInfrastructure[]>([]);
  const [additionalLines, setAdditionalLines] = useState<CpqQuoteAdditionalLine[]>([]);
  const [marginPct, setMarginPct] = useState(13);
  const [marginMode, setMarginMode] = useState<MarginMode>("margin_on_sale");
  const [cloning, setCloning] = useState(false);
  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);
  const [embeddedMenuOpen, setEmbeddedMenuOpen] = useState(false);
  /** Sheet de acciones abierto desde el ⋮ de la barra sticky móvil. */
  const [stickyActionSheetOpen, setStickyActionSheetOpen] = useState(false);
  const [generatingContract, setGeneratingContract] = useState(false);
  const [contractTemplates, setContractTemplates] = useState<{ id: string; name: string }[]>([]);
  const [changingStatus, setChangingStatus] = useState(false);
  const [portalVisibilitySaving, setPortalVisibilitySaving] = useState(false);
  const [sendingDotacion, setSendingDotacion] = useState(false);
  const [portalProposalOpen, setPortalProposalOpen] = useState(false);
  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false);
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  const [whatsappSentTo, setWhatsappSentTo] = useState<string>("");
  // Visita técnica
  const [visitaTecnicaModalOpen, setVisitaTecnicaModalOpen] = useState(false);
  const [visitaTecnicaWaModalOpen, setVisitaTecnicaWaModalOpen] = useState(false);
  const [visitaWaResolved, setVisitaWaResolved] = useState<{ message: string; url: string } | null>(null);
  const [visitaTecnicaWaData, setVisitaTecnicaWaData] = useState<{
    supervisorName: string;
    supervisorEmail: string;
    supervisors?: Array<{ name: string; email: string; emailSent: boolean }>;
    installationName?: string;
    installationAddress: string | null;
    mapsUrl?: string | null;
    contactName?: string | null;
    contactPhone?: string | null;
    scheduledAt: string;
    quoteCode?: string;
    puestosDetail?: Array<{ name: string; cargo?: string | null; numGuards: number; numPuestos: number; startTime?: string | null; endTime?: string | null }>;
  } | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [savingFinancials, setSavingFinancials] = useState(false);
  const [financialError, setFinancialError] = useState<string | null>(null);
  const [decimalDrafts, setDecimalDrafts] = useState<Record<string, string>>({});
  const [quoteForm, setQuoteForm] = useState<QuoteFormState>({
    name: "",
    clientName: "",
    validUntil: "",
    notes: "",
    status: "draft" as CpqQuote["status"],
    paymentTerms: "contrafactura",
    serviceStartDays: 5,
    contractDuration: 12,
    isOngoingService: true,
    includedItems: [] as string[],
    // Contract service fields
    adjustmentType: "NONE",
    adjustmentFreq: null as string | null,
    ipcWeight: null as number | null,
    imoWeight: null as number | null,
    insurancePolicyUF: null as number | null,
    contractStartDate: null as string | null,
    liabilityMonths: 3,
    hasCCTV: false,
    cctvRetentionDays: null as number | null,
    contractTemplateId: null as string | null,
    paymentDays: 5,
    realAnnualIncrement: 3,
  });
  const [quoteDirty, setQuoteDirty] = useState(false);
  const [savingQuote, setSavingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // CRM context
  const [crmAccounts, setCrmAccounts] = useState<{ id: string; name: string; type?: string }[]>([]);
  const [crmInstallations, setCrmInstallations] = useState<CrmInstallationOption[]>([]);
  const [crmContacts, setCrmContacts] = useState<{ id: string; firstName: string; lastName: string; email?: string | null }[]>([]);
  const [crmDeals, setCrmDeals] = useState<
    { id: string; title: string; isLicitacion: boolean; stageId?: string | null; stageName?: string | null }[]
  >([]);
  /** Fuerza recarga de deals (etapa puede cambiar al enviar propuesta). */
  const [crmDealsReloadKey, setCrmDealsReloadKey] = useState(0);
  const [markingSentLicitacion, setMarkingSentLicitacion] = useState(false);
  const [crmContext, setCrmContext] = useState({
    accountId: "" as string,
    installationId: "" as string,
    contactId: "" as string,
    dealId: "" as string,
    currency: "UF" as string,
  });
  const [proposalTemplates, setProposalTemplates] = useState<{ id: string; name: string; slug: string; description?: string }[]>([]);
  const [proposalTemplateId, setProposalTemplateId] = useState<string | null>(null);
  const [tenantBranding, setTenantBranding] = useState<{
    companyName: string;
    brandNameUpper: string;
    website: string;
    contactEmail: string;
  }>({ companyName: "", brandNameUpper: "", website: "", contactEmail: "" });
  const [generatingAi, setGeneratingAi] = useState(false);
  const [generatingServiceDetail, setGeneratingServiceDetail] = useState(false);
  const [ufValue, setUfValue] = useState<number | null>(null);
  const [aiCustomInstruction, setAiCustomInstruction] = useState("");
  const [serviceDetailInstruction, setServiceDetailInstruction] = useState("");

  const isLocked = quote?.status === "sent";
  const canDeleteQuote = canDelete ?? true;
  const {
    deleting,
    requestDeleteQuote,
    requestUnlinkQuote,
  } = useQuoteDeleteFlow();

  const portalListedEffective = useMemo(() => {
    if (!quote) return false;
    return isCpqQuoteListedInClientPortal({
      visibleInClientPortal: quote.visibleInClientPortal ?? null,
      status: quote.status,
    });
  }, [quote]);

  const portalInviteSubjectDefault = useMemo(() => {
    const installationName =
      crmContext.installationId
        ? crmInstallations.find((i) => i.id === crmContext.installationId)?.name?.trim() || null
        : null;
    if (quote?.code) {
      return buildDefaultPortalInviteEmailSubject({
        quoteCode: quote.code,
        quoteName: quote.name,
        installationName,
        tenantBrand: tenantBrandName,
      });
    }
    return defaultPortalEmailSubject ?? "";
  }, [
    quote?.code,
    quote?.name,
    crmContext.installationId,
    crmInstallations,
    defaultPortalEmailSubject,
    tenantBrandName,
  ]);

  const handlePortalVisibilityChange = useCallback(
    async (checked: boolean) => {
      if (!quote) return;
      setPortalVisibilitySaving(true);
      try {
        const res = await fetch(`/api/cpq/quotes/${quoteId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visibleInClientPortal: checked }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "Error");
        setQuote(data.data);
        toast.success(
          checked ? "La cotización se muestra en el portal del cliente" : "Cotización oculta del portal del cliente"
        );
      } catch (e) {
        console.error(e);
        toast.error("No se pudo actualizar la visibilidad en el portal");
      } finally {
        setPortalVisibilitySaving(false);
      }
    },
    [quote, quoteId]
  );
  /** Móvil < lg: acordeón exclusivo (una sección abierta). Desktop: todas abiertas. */
  const isMobileCpq = useMediaQuery("(max-width: 1023px)");
  const [secDatos, setSecDatos] = useState(true);
  const [secPuestos, setSecPuestos] = useState(true);
  const [secCostos, setSecCostos] = useState(true);
  const [secLineas, setSecLineas] = useState(true);
  const [secFinancieros, setSecFinancieros] = useState(true);
  const [secCondiciones, setSecCondiciones] = useState(true);
  const [secMargen, setSecMargen] = useState(true);
  const [secAiContent, setSecAiContent] = useState(true);
  const [secDesglose, setSecDesglose] = useState(true);
  const [secAuditoria, setSecAuditoria] = useState(false);
  const [secPdf, setSecPdf] = useState(true);
  const [secIncluye, setSecIncluye] = useState(true);
  const mobileInitRef = useRef(false);
  // Cuando la cotización está "Enviada", auto-plegamos todas las secciones la
  // primera vez que entramos para mostrar un resumen tipo dashboard. El usuario
  // puede expandir manualmente lo que necesite revisar.
  /** Navegación por secciones (rail desktop / chips móvil): expandir + scroll. */
  const sectionSetters: Record<WorkspaceSectionId, (v: boolean) => void> = {
    "sec-datos": setSecDatos,
    "sec-condiciones": setSecCondiciones,
    "sec-desglose": setSecDesglose,
    "sec-puestos": setSecPuestos,
    "sec-costos": setSecCostos,
    "sec-lineas": setSecLineas,
    "sec-financieros": setSecFinancieros,
    "sec-margen": setSecMargen,
    "sec-ai": setSecAiContent,
    "sec-incluye": setSecIncluye,
    "sec-auditoria": setSecAuditoria,
  };
  const collapseAllSections = useCallback(() => {
    setSecDatos(false);
    setSecCondiciones(false);
    setSecPuestos(false);
    setSecCostos(false);
    setSecLineas(false);
    setSecFinancieros(false);
    setSecMargen(false);
    setSecAiContent(false);
    setSecDesglose(false);
    setSecPdf(false);
    setSecIncluye(false);
    setSecAuditoria(false);
  }, []);
  const openAndScrollTo = useCallback((id: WorkspaceSectionId) => {
    if (isMobileCpq) {
      collapseAllSections();
    }
    sectionSetters[id]?.(true);
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobileCpq, collapseAllSections]);
  const activeSectionId = useSectionSpy(isMobileCpq);
  const sectionCounts = useMemo(
    () =>
      ({
        "sec-puestos": positions.length,
        "sec-lineas": additionalLines.length,
      }) satisfies Partial<Record<WorkspaceSectionId, number>>,
    [positions.length, additionalLines.length],
  );
  // Estado inicial móvil: solo Datos abierta (si no está enviada).
  useEffect(() => {
    if (!isMobileCpq || mobileInitRef.current || !quote) return;
    mobileInitRef.current = true;
    if (quote.status === "sent") return; // lo maneja sentAutoCollapse
    collapseAllSections();
    setSecDatos(true);
  }, [isMobileCpq, quote, collapseAllSections]);
  const sentAutoCollapseRef = useRef(false);
  useEffect(() => {
    if (quote?.status === "sent" && !sentAutoCollapseRef.current) {
      sentAutoCollapseRef.current = true;
      collapseAllSections();
      setSecPdf(false);
    }
    if (quote?.status !== "sent") {
      sentAutoCollapseRef.current = false;
    }
  }, [quote?.status, collapseAllSections]);
  const [guardsBreakdownOpen, setGuardsBreakdownOpen] = useState(false);
  /** Centro de control (aside derecho): contraíble para dar más ancho a Datos/Desglose/Puestos. */
  const [controlCenterOpen, setControlCenterOpen] = useState(true);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("cpq-control-center-open");
      if (saved === "0") setControlCenterOpen(false);
    } catch {
      /* ignore */
    }
  }, []);
  const toggleControlCenter = useCallback(() => {
    setControlCenterOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("cpq-control-center-open", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  /** Rail izquierdo de secciones: contraíble a iconos para ganar ancho de edición. */
  const [workspaceRailCollapsed, setWorkspaceRailCollapsed] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("cpq-workspace-rail-collapsed");
      if (saved === "1") setWorkspaceRailCollapsed(true);
    } catch {
      /* ignore */
    }
  }, []);
  const handleWorkspaceRailCollapsedChange = useCallback((collapsed: boolean) => {
    setWorkspaceRailCollapsed(collapsed);
    try {
      localStorage.setItem("cpq-workspace-rail-collapsed", collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);
  const [controlSheetOpen, setControlSheetOpen] = useState(false);
  const [pdfPreviewMode, setPdfPreviewMode] = useState<CpqPdfPreviewMode>("presentacion");
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewLoading, setPdfPreviewLoading] = useState(false);
  const [pdfTemplateSlug, setPdfTemplateSlug] = useState<CpqPdfTemplateSlug>("standard");
  const initialLoadDone = useRef(false);
  const skipAutoSave = useRef(false);
  /** Guardados pendientes al desmontar (cambio de pestaña / navegación). */
  const pendingFinancialsSave = useRef(false);
  const pendingQuoteFormSave = useRef(false);
  const flushOnUnmountRef = useRef<() => void>(() => {});
  const financialsAutoSaveTimer = useRef<NodeJS.Timeout | undefined>(undefined);
  const quoteFormAutoSaveTimer = useRef<NodeJS.Timeout | undefined>(undefined);
  const formatDateInput = (value?: string | null) => (value ? value.split("T")[0] : "");
  const formatTime = (value: Date) =>
    value.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  const getDecimalValue = (
    key: string,
    value: number | null | undefined,
    decimals = 2,
    allowEmpty = false
  ) => {
    if (Object.prototype.hasOwnProperty.call(decimalDrafts, key)) {
      return decimalDrafts[key];
    }
    if (allowEmpty && (value === null || value === undefined)) return "";
    return formatNumber(Number(value ?? 0), { minDecimals: decimals, maxDecimals: decimals });
  };
  const setDecimalValue = (key: string, value: string) => {
    setDecimalDrafts((prev) => ({ ...prev, [key]: value }));
  };
  const clearDecimalValue = (key: string) => {
    setDecimalDrafts((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, key)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };
  const updateParams = (patch: Partial<CpqQuoteParameters>) => {
    setCostParams((prev) => ({
      ...DEFAULT_PARAMS,
      ...(prev ?? {}),
      ...patch,
      marginPct: prev?.marginPct ?? marginPct,
    }));
  };

  const refresh = async () => {
    setLoading(true);
    try {
      const [quoteRes, costsRes, servicesRes] = await Promise.all([
        fetch(`/api/cpq/quotes/${quoteId}`),
        fetch(`/api/cpq/quotes/${quoteId}/costs`),
        fetch(`/api/cpq/quotes/${quoteId}/services`),
      ]);
      if (!quoteRes.ok) {
        console.error("CPQ quote fetch error", quoteRes.status);
        return;
      }
      if (!costsRes.ok) {
        // Degrade gracefully — costs endpoint may 404/500 but we still want
        // to render the quote header/form so the user can edit.
        console.warn("CPQ costs fetch non-OK (degrading):", costsRes.status);
      }
      const quoteData = await quoteRes.json();
      const costsData = costsRes.ok ? await costsRes.json() : { success: false };
      if (quoteData.success) {
        setQuote(quoteData.data);
        setPositions(quoteData.data.positions || []);
      }
      if (servicesRes.ok) {
        try {
          const servicesData = await servicesRes.json();
          if (servicesData.success) setServiceGroups(servicesData.data || []);
        } catch (e) {
          console.warn("CPQ service groups parse error (degrading):", e);
        }
      }
      if (costsData.success) {
        skipAutoSave.current = true;
        setCostSummary(costsData.data.summary);
        setCostParams(
          costsData.data.parameters ?? null
        );
        setMarginPct(costsData.data.parameters?.marginPct ?? 13);
        setMarginMode((costsData.data.parameters?.marginMode as MarginMode) ?? "margin_on_sale");
        setCostItems(costsData.data.costItems || []);
        setUniforms(costsData.data.uniforms || []);
        setExams(costsData.data.exams || []);
        setMeals(costsData.data.meals || []);
        setVehicles(costsData.data.vehicles || []);
        setInfrastructure(costsData.data.infrastructure || []);
        setAdditionalLines(costsData.data.additionalLines || []);
        setTimeout(() => { skipAutoSave.current = false; }, 300);
      }
    } catch (err) {
      console.error("Error loading CPQ quote:", err);
    } finally {
      setLoading(false);
    }
    // Multi-instalación: los totales del bundle derivan de esta quote.
    if (initialLoadDone.current) onQuoteSaved?.();
  };

  useEffect(() => {
    initialLoadDone.current = false;
    refresh().then(() => {
      setTimeout(() => { initialLoadDone.current = true; }, 200);
    });
  }, [quoteId]);

  // Debounced auto-save for financial parameters + additional lines
  useEffect(() => {
    if (!initialLoadDone.current || skipAutoSave.current || isLocked) return;
    clearTimeout(financialsAutoSaveTimer.current);
    pendingFinancialsSave.current = true;
    financialsAutoSaveTimer.current = setTimeout(() => {
      pendingFinancialsSave.current = false;
      handleSaveFinancials();
    }, 2000);
    return () => clearTimeout(financialsAutoSaveTimer.current);
  }, [costParams, additionalLines]);

  // Debounced auto-save for quote basics (quoteForm)
  useEffect(() => {
    if (!initialLoadDone.current || isLocked) return;
    clearTimeout(quoteFormAutoSaveTimer.current);
    pendingQuoteFormSave.current = true;
    quoteFormAutoSaveTimer.current = setTimeout(() => {
      pendingQuoteFormSave.current = false;
      saveQuoteBasics();
    }, 2000);
    return () => clearTimeout(quoteFormAutoSaveTimer.current);
  }, [quoteForm.name, quoteForm.validUntil, quoteForm.notes, quoteForm.paymentTerms, quoteForm.serviceStartDays, quoteForm.contractDuration, quoteForm.isOngoingService, quoteForm.adjustmentType, quoteForm.adjustmentFreq, quoteForm.ipcWeight, quoteForm.imoWeight, quoteForm.insurancePolicyUF, quoteForm.contractStartDate, quoteForm.liabilityMonths, quoteForm.hasCCTV, quoteForm.cctvRetentionDays, quoteForm.contractTemplateId, quoteForm.paymentDays, quoteForm.realAnnualIncrement]);

  // Resolver el mensaje WhatsApp para el supervisor cuando se programa una
  // visita técnica. Combina el seed `cpq_visita_tecnica_supervisor` con
  // datos runtime que solo conoce el cliente (fecha programada, puestos,
  // mapsLink derivado, etc.).
  useEffect(() => {
    if (!visitaTecnicaWaData) {
      setVisitaWaResolved(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const d = visitaTecnicaWaData;
      const fecha = new Date(d.scheduledAt);
      const fechaStr = fecha.toLocaleDateString("es-CL", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
      const horaStr = `${String(fecha.getHours()).padStart(2, "0")}:${String(fecha.getMinutes()).padStart(2, "0")}`;
      const mapsLink = d.mapsUrl
        ?? (d.installationAddress
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.installationAddress)}`
          : "");

      // Bloque "Dotación solicitada" pre-renderizado (mismo formato que el
      // helper buildCpqVisitaPuestosBlock pero ejecutado client-side).
      const puestosBlock = d.puestosDetail && d.puestosDetail.length > 0
        ? [
            "*Dotación solicitada:*",
            ...d.puestosDetail.map((p) => {
              const horario = [p.startTime, p.endTime].filter(Boolean).join("–");
              const detalle = `${p.name} — ${p.numGuards} guardia${p.numGuards !== 1 ? "s" : ""}${horario ? ` · ${horario}` : ""}`;
              return `- ${detalle}`;
            }),
          ].join("\n")
        : "";

      try {
        const { message, url } = await resolveWaTemplate({
          slug: "cpq_visita_tecnica_supervisor",
          entityType: "quote",
          entityId: quoteId,
          // El seed expone {{system.todayLong}} para la fecha — pasamos la
          // fecha PROGRAMADA en ese token para mantener compatibilidad sin
          // requerir editar el seed por tenant.
          systemTokens: {
            todayLong: `${fechaStr} a las ${horaStr}`,
            mapsLink,
          },
          blockTokens: {
            cpqVisitaPuestos: puestosBlock,
          },
        });

        if (cancelled) return;
        setVisitaWaResolved({ message, url });
      } catch {
        if (!cancelled) setVisitaWaResolved(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visitaTecnicaWaData, resolveWaTemplate, quoteId]);

  const getDefaultValidUntil = () => {
    const d = new Date();
    d.setDate(d.getDate() + 90);
    return d.toISOString().split("T")[0] ?? "";
  };

  useEffect(() => {
    if (!quote) return;
    const validUntilValue = quote.validUntil ? formatDateInput(quote.validUntil) : getDefaultValidUntil();
    setQuoteForm((prev) => ({
      name: quote.name || "",
      clientName: quote.clientName || "",
      validUntil: validUntilValue,
      notes: quote.notes || "",
      status: quote.status,
      paymentTerms: quote.paymentTerms || "contrafactura",
      serviceStartDays: quote.serviceStartDays ?? 5,
      contractDuration: quote.contractDuration ?? 12,
      isOngoingService: (quote as any).isOngoingService ?? true,
      includedItems: (quote.includedItems && quote.includedItems.length > 0)
        ? quote.includedItems
        : prev.includedItems,
      adjustmentType: (quote as any).adjustmentType ?? "NONE",
      adjustmentFreq: (quote as any).adjustmentFreq ?? null,
      ipcWeight: (quote as any).ipcWeight ?? null,
      imoWeight: (quote as any).imoWeight ?? null,
      // Default 1500 UF when missing (póliza estándar para servicios de seguridad).
      insurancePolicyUF: (() => {
        const raw = (quote as any).insurancePolicyUF;
        const n = raw != null ? Number(raw) : NaN;
        return Number.isFinite(n) && n > 0 ? n : 1500;
      })(),
      contractStartDate: (quote as any).contractStartDate ? formatDateInput((quote as any).contractStartDate) : null,
      liabilityMonths: (quote as any).liabilityMonths ?? 3,
      hasCCTV: (quote as any).hasCCTV ?? false,
      cctvRetentionDays: (quote as any).cctvRetentionDays ?? null,
      contractTemplateId: (quote as any).contractTemplateId ?? null,
      paymentDays: (quote as any).paymentDays ?? 5,
      realAnnualIncrement: (quote as any).realAnnualIncrement ?? 3,
    }));
    setCrmContext({
      accountId: quote.accountId ?? "",
      installationId: quote.installationId ?? "",
      contactId: quote.contactId ?? "",
      dealId: quote.dealId ?? "",
      currency: quote.currency ?? "UF",
    });
    setProposalTemplateId(quote.proposalTemplateId ?? null);
    setQuoteDirty(false);
  }, [quote]);

  useEffect(() => {
    fetch("/api/fx/uf")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.success) setUfValue(d.value); })
      .catch(() => {});
    fetch("/api/cpq/proposal-templates")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.success) setProposalTemplates(d.data); })
      .catch(() => {});
    fetch("/api/docs/templates?module=crm&category=contrato_cliente")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.success) setContractTemplates(d.data ?? []); })
      .catch(() => {});
    fetch("/api/branding")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d.success) {
          setTenantBranding({
            companyName: d.data.companyName || "",
            brandNameUpper: d.data.brandNameUpper || "",
            website: d.data.website || "",
            contactEmail: d.data.contactEmail || "",
          });
        }
      })
      .catch(() => {});
  }, []);

  // Load CRM accounts on mount (clientes y prospectos)
  useEffect(() => {
    fetch("/api/crm/accounts")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d?.success)
          setCrmAccounts(
            d.data.map((a: Record<string, string>) => ({
              id: a.id,
              name: a.name,
              type: a.type,
            }))
          );
      })
      .catch(() => {});
  }, []);

  // Load installations/contacts/deals when account changes
  useEffect(() => {
    if (!crmContext.accountId) {
      setCrmInstallations([]);
      setCrmContacts([]);
      setCrmDeals([]);
      return;
    }
    Promise.all([
      fetch(`/api/crm/installations?accountId=${crmContext.accountId}`).then((r) => r.ok ? r.json() : { success: false }),
      fetch(`/api/crm/contacts?accountId=${crmContext.accountId}`).then((r) => r.ok ? r.json() : { success: false }),
      fetch("/api/crm/deals").then((r) => r.ok ? r.json() : { success: false }),
    ]).then(([instData, contactData, dealData]) => {
      if (instData.success) {
        setCrmInstallations(
          (instData.data as Array<Record<string, unknown>>).map((installation) => ({
            id: String(installation.id ?? ""),
            name: String(installation.name ?? ""),
            address: typeof installation.address === "string" ? installation.address : null,
            commune: typeof installation.commune === "string" ? installation.commune : null,
            city: typeof installation.city === "string" ? installation.city : null,
            lat: typeof installation.lat === "number" ? installation.lat : null,
            lng: typeof installation.lng === "number" ? installation.lng : null,
          }))
        );
      }
      if (contactData.success) {
        setCrmContacts(
          (contactData.data as Array<Record<string, string>>).map((c) => ({
            id: c.id,
            firstName: c.firstName,
            lastName: c.lastName,
            email: c.email,
          }))
        );
      }
      if (dealData.success) {
        setCrmDeals(
          (dealData.data as Array<Record<string, unknown>>)
            .filter((d) => {
              const dealAccountId =
                typeof d.accountId === "string"
                  ? d.accountId
                  : d.account && typeof d.account === "object"
                    ? String((d.account as Record<string, unknown>).id ?? "")
                    : "";
              return dealAccountId === crmContext.accountId;
            })
            .map((d) => {
              const stage =
                d.stage && typeof d.stage === "object"
                  ? (d.stage as Record<string, unknown>)
                  : null;
              return {
                id: String(d.id ?? ""),
                title: String(d.title ?? ""),
                isLicitacion: Boolean(d.isLicitacion),
                stageId: stage?.id != null ? String(stage.id) : null,
                stageName: stage?.name != null ? String(stage.name) : null,
              };
            })
        );
      }
    }).catch(() => {});
  }, [crmContext.accountId, crmDealsReloadKey]);

  // Ensure selected installation details are available for address/map preview.
  useEffect(() => {
    if (!crmContext.installationId) return;
    if (crmInstallations.some((installation) => installation.id === crmContext.installationId)) return;

    fetch(`/api/crm/installations/${crmContext.installationId}`)
      .then((res) => res.json())
      .then((payload) => {
        if (!payload?.success || !payload.data) return;
        const installation = payload.data as Record<string, unknown>;
        const normalized: CrmInstallationOption = {
          id: String(installation.id ?? ""),
          name: String(installation.name ?? ""),
          address: typeof installation.address === "string" ? installation.address : null,
          commune: typeof installation.commune === "string" ? installation.commune : null,
          city: typeof installation.city === "string" ? installation.city : null,
          lat: typeof installation.lat === "number" ? installation.lat : null,
          lng: typeof installation.lng === "number" ? installation.lng : null,
        };
        setCrmInstallations((prev) =>
          prev.some((item) => item.id === normalized.id) ? prev : [normalized, ...prev]
        );
      })
      .catch(() => {});
  }, [crmContext.installationId, crmInstallations]);

  // Asegura el contacto seleccionado en la lista (email incluido). Sin esto el
  // modal de envío no se monta y «Enviar propuesta» queda en click silencioso
  // mientras /api/crm/contacts aún no cargó o filtró mal la fila.
  useEffect(() => {
    if (!crmContext.contactId) return;
    if (crmContacts.some((c) => c.id === crmContext.contactId)) return;

    fetch(`/api/crm/contacts/${crmContext.contactId}`)
      .then((res) => res.json())
      .then((payload) => {
        if (!payload?.success || !payload.data) return;
        const c = payload.data as {
          id: string;
          firstName?: string;
          lastName?: string;
          email?: string | null;
        };
        const normalized = {
          id: String(c.id ?? ""),
          firstName: String(c.firstName ?? ""),
          lastName: String(c.lastName ?? ""),
          email: typeof c.email === "string" ? c.email : c.email ?? null,
        };
        if (!normalized.id) return;
        setCrmContacts((prev) =>
          prev.some((item) => item.id === normalized.id) ? prev : [normalized, ...prev]
        );
      })
      .catch(() => {});
  }, [crmContext.contactId, crmContacts]);

  const saveCrmContext = async (patch: Partial<typeof crmContext>) => {
    const updated = { ...crmContext, ...patch };
    setCrmContext(updated);
    setQuoteDirty(true);

    // When currency flips, apply the default adjustmentType:
    //   UF  → NONE (UF already carries implicit IPC)
    //   CLP → IPC
    const currencyChanged =
      patch.currency !== undefined && patch.currency !== crmContext.currency;
    const nextAdjustmentType = currencyChanged
      ? (updated.currency === "UF" ? "NONE" : "IPC")
      : undefined;

    if (nextAdjustmentType !== undefined) {
      setQuoteForm((prev) => ({
        ...prev,
        adjustmentType: nextAdjustmentType,
        // Reset polynomial weights when dropping polynomial
        ipcWeight: null,
        imoWeight: null,
        adjustmentFreq: nextAdjustmentType === "NONE" ? null : prev.adjustmentFreq,
      }));
    }

    try {
      await fetch(`/api/cpq/quotes/${quoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: updated.accountId || null,
          installationId: updated.installationId || null,
          contactId: updated.contactId || null,
          dealId: updated.dealId || null,
          currency: updated.currency,
          ...(nextAdjustmentType !== undefined
            ? {
                adjustmentType: nextAdjustmentType,
                ipcWeight: null,
                imoWeight: null,
                ...(nextAdjustmentType === "NONE" ? { adjustmentFreq: null } : {}),
              }
            : {}),
        }),
      });
    } catch {}
  };

  // Guardado con debounce por campo: evita disparar un PATCH por cada tecla y
  // las carreras de red que pueden revertir lo recién escrito en otro campo.
  const aiSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const saveQuoteFieldDebounced = (field: "aiDescription" | "serviceDetail", value: string) => {
    if (aiSaveTimers.current[field]) clearTimeout(aiSaveTimers.current[field]);
    aiSaveTimers.current[field] = setTimeout(() => {
      fetch(`/api/cpq/quotes/${quoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      }).catch(() => {});
    }, 600);
  };

  const generateAiDescription = async () => {
    setGeneratingAi(true);
    try {
      const res = await fetch("/api/ai/quote-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId,
          customInstruction: aiCustomInstruction.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setQuote((prev) => (prev ? { ...prev, aiDescription: data.data.description } : prev));
      toast.success(aiCustomInstruction.trim() ? "Descripcion refinada con AI" : "Descripcion generada con AI");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "No se pudo generar la descripcion AI");
    } finally {
      setGeneratingAi(false);
    }
  };

  const generateServiceDetail = async () => {
    setGeneratingServiceDetail(true);
    try {
      const res = await fetch("/api/ai/quote-service-detail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId,
          customInstruction: serviceDetailInstruction.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setQuote((prev) => (prev ? { ...prev, serviceDetail: data.data.serviceDetail } : prev));
      toast.success(serviceDetailInstruction.trim() ? "Detalle refinado con AI" : "Detalle de servicio generado con AI");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "No se pudo generar el detalle de servicio");
    } finally {
      setGeneratingServiceDetail(false);
    }
  };

  const [regeneratingProposalAi, setRegeneratingProposalAi] = useState(false);
  const regenerateProposalAi = async () => {
    setRegeneratingProposalAi(true);
    try {
      const res = await fetch(`/api/cpq/quotes/${quoteId}/proposal-ai`, { method: "POST" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success("Contenido IA de la propuesta reiniciado. Se regenerará al previsualizar el PDF.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo reiniciar el contenido IA");
    } finally {
      setRegeneratingProposalAi(false);
    }
  };

  const saveQuoteBasics = async (options?: { nextStep?: number }) => {
    setSavingQuote(true);
    setQuoteError(null);
    try {
      const res = await fetch(`/api/cpq/quotes/${quoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: quoteForm.name || null,
          clientName: quoteForm.clientName,
          validUntil: quoteForm.validUntil || null,
          notes: quoteForm.notes,
          status: quoteForm.status,
          paymentTerms: quoteForm.paymentTerms,
          serviceStartDays: quoteForm.serviceStartDays,
          contractDuration: quoteForm.contractDuration,
          isOngoingService: quoteForm.isOngoingService,
          adjustmentType: quoteForm.adjustmentType,
          adjustmentFreq: quoteForm.adjustmentFreq,
          ipcWeight: quoteForm.ipcWeight,
          imoWeight: quoteForm.imoWeight,
          insurancePolicyUF: quoteForm.insurancePolicyUF,
          contractStartDate: quoteForm.contractStartDate,
          liabilityMonths: quoteForm.liabilityMonths,
          hasCCTV: quoteForm.hasCCTV,
          cctvRetentionDays: quoteForm.cctvRetentionDays,
          contractTemplateId: quoteForm.contractTemplateId,
          paymentDays: quoteForm.paymentDays,
          realAnnualIncrement: quoteForm.realAnnualIncrement,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Error");
      setQuote(data.data);
      setQuoteDirty(false);
      setLastSavedAt(new Date());
      onQuoteSaved?.();
    } catch (error) {
      console.error("Error saving CPQ quote:", error);
      setQuoteError("No se pudo guardar la cotizacion.");
    } finally {
      setSavingQuote(false);
    }
  };

  const handleSaveFinancials = async () => {
    setSavingFinancials(true);
    setFinancialError(null);
    try {
      const res = await fetch(`/api/cpq/quotes/${quoteId}/costs`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parameters: {
            ...costParams,
            insurancePolicyUF: quoteForm.insurancePolicyUF,
          },
          uniforms,
          exams,
          costItems,
          meals,
          vehicles,
          infrastructure,
          additionalLines,
        }),
      });
      const data = await res.json();
      if (!data?.success) {
        throw new Error(data?.error || "Error");
      }
      if (data.data) setCostSummary(data.data);
      setLastSavedAt(new Date());
      onQuoteSaved?.();
    } catch (error) {
      console.error("Error saving financials:", error);
      setFinancialError("No se pudieron guardar los financieros.");
      toast.error("No se pudieron guardar los financieros");
    } finally {
      setSavingFinancials(false);
    }
  };

  const handleMarkSentLicitacion = async () => {
    if (!quote || quote.status === "sent") return;
    const confirmed = await confirmDialog({
      title: "Marcar enviada (licitación)",
      description:
        "La cotización quedará como enviada y el negocio pasará a Negociación. No se envía portal ni correo. ¿Continuar?",
      confirmLabel: "Marcar enviada",
    });
    if (!confirmed) return;

    setMarkingSentLicitacion(true);
    setChangingStatus(true);
    try {
      await flushPendingSaves();
      const res = await fetch(`/api/cpq/quotes/${quoteId}/mark-sent-licitacion`, {
        method: "POST",
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Error");
      const nextStatus = "sent" as const;
      setQuote((prev) => (prev ? { ...prev, status: nextStatus } : prev));
      setQuoteForm((prev) => ({ ...prev, status: nextStatus }));
      const stageName = data.data?.stageName || "Negociación";
      const stageId =
        data.data?.stageId != null ? String(data.data.stageId) : null;
      if (crmContext.dealId) {
        setCrmDeals((prev) =>
          prev.map((d) =>
            d.id === crmContext.dealId
              ? { ...d, stageName, ...(stageId ? { stageId } : {}) }
              : d,
          ),
        );
      }
      toast.success(
        data.data?.stageMoved
          ? `Cotización enviada. Negocio en «${stageName}».`
          : `Cotización marcada como enviada (${stageName}).`,
      );
      onQuoteSaved?.();
    } catch (error) {
      console.error("Error mark-sent-licitacion:", error);
      toast.error(
        error instanceof Error ? error.message : "No se pudo marcar como enviada.",
      );
    } finally {
      setMarkingSentLicitacion(false);
      setChangingStatus(false);
    }
  };

  const handleStatusChange = async (newStatus: "draft" | "sent") => {
    if (!quote) return;
    if (newStatus === "sent") {
      const dealIsLicitacion = Boolean(
        crmDeals.find((d) => d.id === crmContext.dealId)?.isLicitacion,
      );
      if (dealIsLicitacion) {
        await handleMarkSentLicitacion();
        return;
      }
      toast.error("Para marcar como enviada usá Enviar propuesta (portal o presentación).");
      return;
    }
    setChangingStatus(true);
    try {
      const payload: Record<string, unknown> = { status: newStatus };
      if (
        quote.status !== "draft" &&
        quote.visibleInClientPortal !== false
      ) {
        payload.visibleInClientPortal = true;
      }
      const res = await fetch(`/api/cpq/quotes/${quoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Error");
      setQuote(data.data);
      setQuoteForm((prev) => ({ ...prev, status: newStatus }));
      toast.success("Cotizacion en borrador. Ya puedes editar.");
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar el estado.");
    } finally {
      setChangingStatus(false);
    }
  };

  const handleGenerateContract = async () => {
    if (!quote) return;
    // Flush saves first
    await flushPendingSaves();
    setGeneratingContract(true);
    try {
      const res = await fetch(`/api/cpq/quotes/${quoteId}/generate-contract`, {
        method: "POST",
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Error al generar contrato");
      toast.success("Contrato generado exitosamente");
      // Navigate to the new document
      window.open(`/opai/documentos/${data.data.documentId}`, "_blank");
    } catch (error: any) {
      toast.error(error.message || "Error al generar contrato");
    } finally {
      setGeneratingContract(false);
    }
  };

  const handleClone = async () => {
    setCloning(true);
    try {
      const response = await fetch(`/api/cpq/quotes/${quoteId}/clone`, {
        method: "POST",
      });
      const data = await response.json();
      if (data.success) {
        toast.success(`Cotizacion clonada: ${data.data.code}`);
        router.push(`/crm/cotizaciones/${data.data.id}`);
      } else {
        toast.error(data.error || "No se pudo clonar la cotizacion.");
      }
    } catch (error) {
      console.error("Error cloning quote:", error);
      toast.error("Error al clonar la cotizacion.");
    } finally {
      setCloning(false);
    }
  };

  const handleDelete = async () => {
    if (!canDeleteQuote || deleting) return;
    if (onRequestDelete) {
      await onRequestDelete(quoteId);
      return;
    }
    const result = await requestDeleteQuote({
      quoteId,
      quoteLabel: quote?.name || quote?.code,
    });
    if (!result) return;
    router.push("/crm/cotizaciones");
    router.refresh();
  };

  const handleUnlinkFromBundle = async () => {
    if (!bundleId || deleting) return;
    if (onRequestUnlink) {
      await onRequestUnlink(quoteId);
      return;
    }
    const result = await requestUnlinkQuote({
      bundleId,
      quoteId,
      quoteLabel: quote?.name || quote?.code,
    });
    if (!result) return;
    if (result.bundleDeleted) {
      router.push("/crm/cotizaciones");
    } else {
      router.refresh();
    }
  };

  flushOnUnmountRef.current = () => {
    if (isLocked || !initialLoadDone.current) return;
    if (pendingFinancialsSave.current) {
      clearTimeout(financialsAutoSaveTimer.current);
      pendingFinancialsSave.current = false;
      void handleSaveFinancials();
    }
    if (pendingQuoteFormSave.current) {
      clearTimeout(quoteFormAutoSaveTimer.current);
      pendingQuoteFormSave.current = false;
      void saveQuoteBasics();
    }
  };
  // Al desmontar (cambiar de pestaña en multi, navegar) se vacían los
  // guardados con debounce en vuelo: antes se cancelaban y los últimos
  // cambios se perdían sin aviso.
  useEffect(() => {
    return () => flushOnUnmountRef.current();
  }, []);

  /** Flush any pending debounced saves so the backend has the latest data */
  const flushPendingSaves = async () => {
    clearTimeout(financialsAutoSaveTimer.current);
    clearTimeout(quoteFormAutoSaveTimer.current);
    if (initialLoadDone.current && !isLocked) {
      await Promise.all([handleSaveFinancials(), saveQuoteBasics()]);
    }
  };

  const handleSendDotacionToInstallation = async () => {
    if (!quote) return;
    if (!crmContext.installationId) {
      toast.error("Selecciona una instalacion en Contexto CRM antes de enviar dotacion");
      return;
    }
    if (!positions.length) {
      toast.error("La cotizacion no tiene puestos para enviar");
      return;
    }

    const confirmed = await confirmDialog({
      description:
        "Esta accion reemplazara la dotacion activa de la instalacion con los puestos de esta cotizacion. Continuar?",
      variant: "destructive",
      confirmLabel: "Reemplazar",
    });
    if (!confirmed) return;

    setSendingDotacion(true);
    try {
      const response = await fetch(`/api/cpq/quotes/${quoteId}/send-to-installation`, {
        method: "POST",
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo enviar la dotacion");
      }

      toast.success(
        `Dotacion enviada a ${payload.data.installationName}: ${payload.data.createdPuestos} puestos creados`
      );
    } catch (error) {
      console.error("Error sending staffing to installation:", error);
      toast.error("No se pudo enviar la dotacion a instalacion");
    } finally {
      setSendingDotacion(false);
    }
  };

  const [recalculatingAll, setRecalculatingAll] = useState(false);
  const handleRecalculateAll = async () => {
    if (!quoteId) return;
    setRecalculatingAll(true);
    try {
      const res = await fetch(`/api/cpq/quotes/${quoteId}/costs`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recalculate: true }),
      });
      if (res.ok) {
        toast.success("Costos recalculados");
        await refresh();
      } else {
        toast.error("Error al recalcular");
      }
    } catch {
      toast.error("Error al recalcular costos");
    } finally {
      setRecalculatingAll(false);
    }
  };

  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const handleApplyServiceTemplate = async (template: ServiceTemplate) => {
    if (!quoteId || isLocked) return;

    // If positions exist, ask whether to replace or add
    if (positions.length > 0) {
      const replace = await confirmDialog({
        description: `Ya hay ${positions.length} puesto(s).`,
        variant: "destructive",
        confirmLabel: "Reemplazar todos",
        cancelLabel: "Agregar a existentes",
      });
      if (replace) {
        for (const pos of positions) {
          await fetch(`/api/cpq/quotes/${quoteId}/positions/${pos.id}`, { method: "DELETE" }).catch(() => {});
        }
      }
    }

    setApplyingTemplate(true);
    try {
      // Get catalog defaults for required fields
      const [puestosRes, cargosRes, rolesRes] = await Promise.all([
        fetch("/api/cpq/puestos?active=true").then((r) => r.json()),
        fetch("/api/cpq/cargos?active=true").then((r) => r.json()),
        fetch("/api/cpq/roles?active=true").then((r) => r.json()),
      ]);
      const defaultPuesto = puestosRes?.data?.[0];
      const defaultCargo = cargosRes?.data?.[0];
      const defaultRol = rolesRes?.data?.[0];
      const rolesList = (rolesRes?.data ?? []) as { id: string; name: string; salary?: number | null }[];

      if (!defaultPuesto?.id || !defaultCargo?.id || !defaultRol?.id) {
        toast.error("Faltan configuraciones CPQ (puesto, cargo o rol).");
        setApplyingTemplate(false);
        return;
      }

      let createdCount = 0;
      for (const pos of template.positions) {
        const patternForRol = pos.rolShiftPattern ?? pos.shiftPattern;
        const { rolId, baseSalary } = resolveTemplateRowCatalog(
          patternForRol,
          rolesList,
          defaultRol.id,
          pos.baseSalary
        );
        const res = await fetch(`/api/cpq/quotes/${quoteId}/positions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            puestoTrabajoId: defaultPuesto.id,
            customName: pos.name,
            weekdays: pos.daysOfWeek,
            startTime: pos.shiftStart,
            endTime: pos.shiftEnd,
            numGuards: pos.guardsCount,
            numPuestos: 1,
            cargoId: defaultCargo.id,
            rolId,
            baseSalary,
          }),
        });
        if (res.ok) createdCount++;
      }
      if (createdCount > 0) {
        toast.success(`${createdCount} puesto(s) creado(s) desde plantilla "${template.label}"`);
        await refresh();
      }
    } catch (err) {
      console.error("Error applying service template:", err);
      toast.error("Error al aplicar plantilla");
    } finally {
      setApplyingTemplate(false);
    }
  };

  const handlePortalProposalComplete = ({
    decision,
    result,
  }: {
    decision: FollowUpDecision;
    result: {
      sentTo: string;
      whatsappMessage?: string;
      whatsappPhone?: string | null;
    };
  }) => {
    const wantsWhatsApp = decision.sendWhatsApp === true;
    if (wantsWhatsApp && result.whatsappMessage) {
      const phone = result.whatsappPhone ?? "";
      const encoded = encodeURIComponent(result.whatsappMessage);
      const waUrl = phone
        ? `https://wa.me/${phone}?text=${encoded}`
        : `https://wa.me/?text=${encoded}`;
      setWhatsappUrl(waUrl);
      setWhatsappSentTo(result.sentTo);
      setWhatsappModalOpen(true);
    }
    setCrmDealsReloadKey((n) => n + 1);
    void refresh();
  };

  const stats = useMemo(() => {
    const totalGuards =
      quote?.totalGuards ??
      positions.reduce((sum, p) => sum + p.numGuards * (p.numPuestos || 1), 0);
    const monthly = quote?.monthlyCost ?? positions.reduce((sum, p) => sum + Number(p.monthlyPositionCost), 0);
    return { totalGuards, monthly };
  }, [positions, quote]);

  const roleSummary = useMemo(() => {
    const byKey = new Map<string, { qty: number; label: string }>();
    for (const p of positions) {
      const cargoName = p.cargo?.name?.trim() ?? "";
      const rolName = p.rol?.name?.trim() ?? "";
      const label = [cargoName, rolName].filter(Boolean).join(" ") || "Sin asignar";
      const key = `${cargoName}::${rolName}`;
      const qty = (p.numGuards || 0) * (p.numPuestos || 1);
      if (qty <= 0) continue;
      const prev = byKey.get(key);
      if (prev) prev.qty += qty;
      else byKey.set(key, { qty, label });
    }
    return Array.from(byKey.values()).sort(
      (a, b) => b.qty - a.qty || a.label.localeCompare(b.label),
    );
  }, [positions]);

  const additionalCostsTotal = costSummary?.monthlyExtras ?? 0;
  const financialRatePct = costSummary?.financialRatePct ?? 2.5;
  const policyRatePct = costSummary?.policyRatePct ?? 0;
  const monthlyHours = costParams?.monthlyHoursStandard ?? 180;
  const policyContractMonths = costParams?.policyContractMonths ?? 12;
  const policyContractPct = costParams?.policyContractPct ?? 20;
  const contractMonths = costParams?.contractMonths ?? 12;
  const policyEnabled = costParams?.policyEnabled ?? false;
  const salePriceBase = Number(costParams?.salePriceBase ?? 0);
  const monthlyTotal = costSummary?.monthlyTotal ?? stats.monthly + additionalCostsTotal;

  // Per-category cost breakdown for the sidebar (breaks down monthlyCostItems by type)
  const costCategoryBreakdown = useMemo(() => {
    const totalGuards = costSummary?.totalGuards ?? 0;
    const normalizeUnit = (value: number, unit?: string | null, contractMonths?: number) => {
      if (!unit) return value;
      const n = unit.toLowerCase();
      if (n.includes("contrato") || n.includes("contract")) {
        const months = contractMonths && contractMonths > 0 ? contractMonths : 12;
        return value / months;
      }
      if (n.includes("año") || n.includes("year")) return value / 12;
      if (n.includes("semestre") || n.includes("semester")) return value / 6;
      return value;
    };
    const sumByType = (types: string[]) =>
      costItems.reduce((sum, item) => {
        if (!item.isEnabled) return sum;
        const cat = item.catalogItem;
        const itemType = item.customType ?? cat?.type;
        if (!itemType || !types.includes(itemType)) return sum;
        const base = Number(cat?.basePrice || 0);
        const override = item.unitPriceOverride != null ? Number(item.unitPriceOverride) : null;
        const unitPrice = normalizeUnit(override ?? base, cat?.unit);
        const quantity = Number(item.quantity ?? 1);
        if (item.calcMode === "per_guard") return sum + unitPrice * quantity * totalGuards;
        return sum + unitPrice * quantity;
      }, 0);

    const dedicatedVehicles = vehicles.reduce((sum, v) => {
      if (!v.isEnabled) return sum;
      const kmPerDay = Number(v.kmPerDay || 0);
      const daysPerMonth = Number(v.daysPerMonth || 0);
      const kmPerLiter = Number(v.kmPerLiter || 0);
      const liters = kmPerLiter > 0 ? (kmPerDay * daysPerMonth) / kmPerLiter : 0;
      const fuelCost = liters * Number(v.fuelPrice || 0);
      const monthly = Number(v.rentMonthly || 0) + Number(v.maintenanceMonthly || 0) + fuelCost;
      return sum + monthly * v.vehiclesCount;
    }, 0);

    const dedicatedInfra = infrastructure.reduce((sum, inf) => {
      if (!inf.isEnabled) return sum;
      const base = Number(inf.rentMonthly || 0);
      let fuelCost = 0;
      if (inf.hasFuel) {
        const liters =
          Number(inf.fuelLitersPerHour || 0) *
          Number(inf.fuelHoursPerDay || 0) *
          Number(inf.fuelDaysPerMonth || 0);
        fuelCost = liters * Number(inf.fuelPrice || 0);
      }
      return sum + (base + fuelCost) * inf.quantity;
    }, 0);

    return {
      equipment: sumByType(["phone", "radio", "flashlight"]),
      transport: sumByType(["transport"]),
      vehicle: sumByType(["vehicle_rent", "vehicle_fuel", "vehicle_tag"]) + dedicatedVehicles,
      infra: sumByType(["infrastructure", "fuel"]) + dedicatedInfra,
      system: sumByType(["system"]),
      other: sumByType(["other"]),
    };
  }, [costItems, vehicles, infrastructure, costSummary?.totalGuards]);

  // Additional lines total
  // Precio de venta de una línea (con su margen propio). Mismo criterio que el
  // servidor (calculateAdditionalLines) para que el sidebar cuadre con el PDF.
  const lineSellPrice = (l: CpqQuoteAdditionalLine) => {
    const base = Number(l.precio || 0) * Number(l.cantidad || 1);
    const m = Number(l.marginPct || 0);
    return m > 0 && m < 100 ? base / (1 - m / 100) : base;
  };
  // Recurrente (mensual): alimenta el total mensual. El pago único NO se prorratea
  // ni entra al mensual — se muestra aparte como "Pago inicial único".
  const additionalLinesTotal = useMemo(
    () =>
      additionalLines
        .filter((l) => (l.recurrencia ?? "mensual") !== "unico")
        .reduce((s, l) => s + lineSellPrice(l), 0),
    [additionalLines]
  );
  const additionalLinesOneTimeTotal = useMemo(
    () =>
      additionalLines
        .filter((l) => (l.recurrencia ?? "mensual") === "unico")
        .reduce((s, l) => s + lineSellPrice(l), 0),
    [additionalLines]
  );

  // Líneas adicionales: el precio se almacena SIEMPRE en CLP (igual que puestos y
  // costos; el resto del CPQ convierte CLP→UF solo para mostrar). Cuando la
  // cotización está en UF, el input se ingresa en UF y se convierte a CLP.
  const addlUfNum = ufValue != null && Number.isFinite(Number(ufValue)) && Number(ufValue) > 0 ? Number(ufValue) : 0;
  const addlIsUf = (crmContext.currency || "CLP").toUpperCase() === "UF" && addlUfNum > 0;
  const addlToInput = (clp: number) => (addlIsUf ? clp / addlUfNum : clp);
  const addlFromInput = (entered: number) => (addlIsUf ? entered * addlUfNum : entered);

  // Sale price: fuente de verdad del motor (gross-up + instrumentos + líneas)
  const salePriceMonthly = useMemo(() => {
    if (!costSummary) return 0;
    if (costSummary.salePriceMonthly != null && costSummary.salePriceMonthly > 0) {
      return costSummary.salePriceMonthly - (costSummary.additionalLinesTotalWithMargin ?? 0);
    }
    return (
      (costSummary.baseWithMargin ?? 0) +
      (costSummary.monthlyFinancial ?? 0) +
      (costSummary.monthlyPolicy ?? 0) +
      (costSummary.monthlyPolicyAdmin ?? 0) +
      (costSummary.monthlyLiability ?? 0)
    );
  }, [costSummary]);

  // Margin amount calculation (includes additional lines)
  const marginAmount = useMemo(() => {
    const margin = marginPct / 100;
    if (!costSummary) return 0;
    const costsBase =
      (costSummary.monthlyPositions ?? 0) +
      (costSummary.monthlyHolidayAdjustment ?? 0) +
      (costSummary.monthlyUniforms ?? 0) +
      (costSummary.monthlyExams ?? 0) +
      (costSummary.monthlyMeals ?? 0) +
      (costSummary.monthlyVehicles ?? 0) +
      (costSummary.monthlyInfrastructure ?? 0) +
      (costSummary.monthlyCostItems ?? 0);
    const baseWithMargin = margin < 1 ? costsBase / (1 - margin) : costsBase;
    return baseWithMargin - costsBase;
  }, [costSummary, marginPct]);

  // Per-position sale price allocation from final monthly sale price.
  // This keeps every downstream "valor hora" aligned with the real client sale price.
  const positionSalePrices = useMemo(() => {
    const map = new Map<string, number>();
    if (positions.length === 0 || salePriceMonthly <= 0) return map;

    const weights = positions.map((pos) => Math.max(0, Number(pos.monthlyPositionCost)));
    const weightsTotal = weights.reduce((sum, value) => sum + value, 0);
    const fallbackWeight = positions.length > 0 ? 1 / positions.length : 0;
    let remaining = salePriceMonthly;

    positions.forEach((pos, index) => {
      if (index === positions.length - 1) {
        map.set(pos.id, Math.max(0, remaining));
        return;
      }
      const proportion = weightsTotal > 0 ? weights[index] / weightsTotal : fallbackWeight;
      const allocated = salePriceMonthly * proportion;
      map.set(pos.id, allocated);
      remaining -= allocated;
    });

    return map;
  }, [positions, salePriceMonthly]);

  const positionHourlyRates = useMemo(() => {
    const map = new Map<string, number>();
    for (const pos of positions) {
      const saleForPos = positionSalePrices.get(pos.id) ?? 0;
      const denom = Math.max(1, pos.numGuards) * Math.max(1, monthlyHours);
      map.set(pos.id, saleForPos > 0 ? saleForPos / denom : 0);
    }
    return map;
  }, [positions, positionSalePrices, monthlyHours]);

  const positionsByGroup = useMemo(() => {
    const map = new Map<string, CpqPosition[]>();
    const ungrouped: CpqPosition[] = [];
    for (const p of positions) {
      if (p.serviceGroupId) {
        const arr = map.get(p.serviceGroupId) ?? [];
        arr.push(p);
        map.set(p.serviceGroupId, arr);
      } else {
        ungrouped.push(p);
      }
    }
    return { map, ungrouped };
  }, [positions]);

  const matrixAdapter = usePositionMatrixCpq({
    quoteId,
    positions,
    serviceGroups,
    refresh,
    currency: crmContext.currency || "CLP",
    ufValue,
    readOnly: isLocked,
  });

  const handleAutoGroup = useCallback(async () => {
    if (!(await confirmDialog({ description: "¿Auto-agrupar los puestos sin agrupar por cargo/puesto?" }))) return;
    try {
      const r = await fetch(`/api/cpq/quotes/${quoteId}/services/auto-group`, { method: "POST" });
      const d = await r.json();
      if (d.success) {
        toast.success(`${d.data.created} servicios creados con ${d.data.assigned} turno(s)`);
        refresh();
      } else {
        toast.error(d.error || "No se pudo auto-agrupar");
      }
    } catch {
      toast.error("No se pudo auto-agrupar");
    }
  }, [quoteId]);

  const headerPersistLabel =
    savingQuote || savingFinancials
      ? "Guardando..."
      : quoteDirty
        ? "Cambios sin guardar"
        : lastSavedAt
          ? `Guardado ${formatTime(lastSavedAt)}`
          : "Sin cambios";

  const billingMonthlyTotal = salePriceMonthly + additionalLinesTotal;
  const selectedAccountName =
    crmAccounts.find((account) => account.id === crmContext.accountId)?.name ||
    quoteForm.clientName ||
    quote?.clientName ||
    "Sin cliente";
  const selectedInstallationName =
    crmInstallations.find((installation) => installation.id === crmContext.installationId)?.name ||
    "Sin instalación";
  const selectedContactName = (() => {
    const contact = crmContacts.find((item) => item.id === crmContext.contactId);
    return contact ? `${contact.firstName} ${contact.lastName}`.trim() : "Sin contacto";
  })();
  const selectedDeal = crmDeals.find((deal) => deal.id === crmContext.dealId);
  const selectedDealTitle = selectedDeal?.title || "Sin negocio";
  const selectedDealStageName = selectedDeal?.stageName?.trim() || null;
  const isLicitacionDeal = Boolean(selectedDeal?.isLicitacion);
  const contactForPortal = crmContext.contactId
    ? crmContacts.find((x) => x.id === crmContext.contactId) ?? null
    : null;
  const contactHasEmail = Boolean(contactForPortal?.email?.trim());
  const canSendPortalProposal =
    Boolean(quote) &&
    (positions.length > 0 || (additionalLines?.length ?? 0) > 0) &&
    Boolean(crmContext.accountId && crmContext.contactId && crmContext.dealId) &&
    contactHasEmail;
  const canMarkSentLicitacion =
    quote != null &&
    quote.status === "draft" &&
    isLicitacionDeal &&
    (positions.length > 0 || (additionalLines?.length ?? 0) > 0) &&
    Boolean(crmContext.accountId && crmContext.dealId);
  const portalReadinessItems = [
    { label: "Cliente", ready: Boolean(crmContext.accountId) },
    { label: "Contacto", ready: Boolean(crmContext.contactId) },
    { label: "Email contacto", ready: contactHasEmail },
    { label: "Negocio", ready: Boolean(crmContext.dealId) },
    { label: "Puestos o líneas", ready: positions.length > 0 || (additionalLines?.length ?? 0) > 0 },
  ];

  /** Abre el modal de envío o muestra toast accionable (nunca click silencioso). */
  const openPortalProposal = useCallback(() => {
    if (!crmContext.contactId) {
      toast.error("Asigna un contacto antes de enviar la propuesta.");
      return;
    }
    if (!contactForPortal) {
      toast.message("Cargando datos del contacto…", {
        description: "Espera un segundo e inténtalo de nuevo.",
      });
      return;
    }
    if (!contactForPortal.email?.trim()) {
      toast.error("El contacto no tiene email. Edítalo desde la sección Datos antes de enviar.");
      return;
    }
    if (!crmContext.dealId) {
      toast.error("Asigna un negocio antes de enviar la propuesta.");
      return;
    }
    setPortalProposalOpen(true);
  }, [crmContext.contactId, crmContext.dealId, contactForPortal]);

  const handleGeneratePdfPreview = async (): Promise<string | null> => {
    setPdfPreviewLoading(true);
    try {
      const bust = Date.now();
      const url = pdfPreviewMode === "presentacion"
        ? `/api/cpq/quotes/${quoteId}/proposal-pdf?t=${bust}`
        : `/api/cpq/quotes/${quoteId}/export-pdf?templateSlug=${encodeURIComponent(pdfTemplateSlug)}&t=${bust}`;
      if (pdfPreviewUrl && pdfPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(url);
      return url;
    } catch (err) {
      console.error("[CPQ PDF Preview]", err);
      toast.error(err instanceof Error ? err.message : "Error al generar el PDF");
      return null;
    } finally {
      setPdfPreviewLoading(false);
    }
  };

  const handleMarginChange = async (newMargin: number) => {
    setMarginPct(newMargin);
    try {
      await fetch(`/api/cpq/quotes/${quoteId}/margin`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marginPct: newMargin, marginMode }),
      });
      await refresh();
    } catch (error) {
      console.error("Error saving margin:", error);
    }
  };

  const handleMarginModeChange = async (newMode: MarginMode) => {
    setMarginMode(newMode);
    try {
      await fetch(`/api/cpq/quotes/${quoteId}/margin`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marginPct, marginMode: newMode }),
      });
      await refresh();
    } catch (error) {
      console.error("Error saving margin mode:", error);
    }
  };

  if (loading && !quote) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded bg-muted animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-32 rounded bg-muted animate-pulse" />
            <div className="h-3 w-48 rounded bg-muted/60 animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 rounded-lg border border-border bg-muted/20 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="space-y-3">
        <Button variant="outline" size="sm" onClick={() => router.push("/cpq")}>
          Volver
        </Button>
        <div className="text-sm text-muted-foreground">Cotizacion no encontrada.</div>
      </div>
    );
  }

  return (
    <div className="cpq-touch-inputs space-y-3 pb-[calc(3.5rem+env(safe-area-inset-bottom,0px)+0.75rem)] -mb-28 lg:mb-0 lg:pb-4 overflow-x-clip min-w-0">
      {/* -- Mobile sticky stack: total → pestañas (multi) → chips.
           top = --app-island-bottom (MobileIsland: safe + 8 + 48).
           z-[25] bajo la isla (z-30) y la bottom bar (z-50). */}
      <div
        className="sticky top-[var(--app-island-bottom)] z-[25] -mx-4 sm:-mx-6 lg:-mx-8 lg:hidden opai-liquid-glass-bar-top mb-3"
        style={mobileTabsSlot ? { ["--cpq-sticky-h" as string]: "7.75rem" } : undefined}
      >
        <MobileTotalBar
          totalClp={mobileTotalClpOverride ?? billingMonthlyTotal}
          currency={crmContext.currency || "CLP"}
          ufValue={ufValue}
          saving={!isLocked && (savingQuote || savingFinancials)}
          statusSlot={
            <div className="flex min-w-0 items-center gap-1.5">
              <CpqStatusBadge
                status={quote.status}
                changing={changingStatus || markingSentLicitacion}
                size="sm"
                isLicitacion={isLicitacionDeal}
                onToggle={() => void handleStatusChange(quote.status === "sent" ? "draft" : "sent")}
              />
              {selectedDealStageName ? (
                <span title={`Etapa del negocio: ${selectedDealStageName}`}>
                  <Tag variant="info" size="sm" className="max-w-[6.5rem] truncate">
                    {selectedDealStageName}
                  </Tag>
                </span>
              ) : null}
            </div>
          }
          actionsSlot={
            !embedded ? (
              <button
                type="button"
                aria-label="Más acciones"
                onClick={() => setStickyActionSheetOpen(true)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-border/70 bg-ds-surface-2/70 text-muted-foreground transition-colors hover:bg-ds-surface-3 hover:text-foreground"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            ) : null
          }
        />
        {mobileTabsSlot}
        <SectionChips
          onNavigate={openAndScrollTo}
          activeId={activeSectionId}
          counts={sectionCounts}
          className="border-t border-border/40"
        />
      </div>

      {embedded ? (
        <div className="relative flex items-start justify-between gap-3 rounded-lg border border-ds-border-subtle bg-ds-surface-1 px-3 py-2">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-ds-text-3">
              Instalación
            </p>
            <h2 className="truncate font-display text-base text-foreground" title={quote.name || quote.code}>
              {quote.name || quote.code}
            </h2>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 shrink-0 gap-1.5 sm:h-9"
            aria-label="Acciones de instalación"
            onClick={() => setEmbeddedMenuOpen((v) => !v)}
          >
            <MoreVertical className="h-4 w-4" />
            Acciones
          </Button>
          {embeddedMenuOpen ? (
            <>
              <button
                type="button"
                className="fixed inset-0 z-20 cursor-default"
                aria-label="Cerrar menú"
                onClick={() => setEmbeddedMenuOpen(false)}
              />
              <div className="absolute right-3 top-[calc(100%-0.25rem)] z-30 min-w-[230px] rounded-md border border-ds-border-subtle bg-popover p-1 shadow-md">
                {bundleId ? (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-[13px] hover:bg-accent"
                    onClick={() => {
                      setEmbeddedMenuOpen(false);
                      void handleUnlinkFromBundle();
                    }}
                    disabled={deleting}
                  >
                    <Unlink className="h-4 w-4" />
                    Quitar de la propuesta
                  </button>
                ) : null}
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-[13px] text-status-danger-fg hover:bg-accent"
                  onClick={() => {
                    setEmbeddedMenuOpen(false);
                    void handleDelete();
                  }}
                  disabled={deleting || !canDeleteQuote}
                >
                  <Trash2 className="h-4 w-4" />
                  {deleting ? "Eliminando cotización..." : "Eliminar cotización"}
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {/* -- Desktop sticky KPI bar (fuera del grid: sticky respecto al viewport) --
           top = debajo del topbar fijo (--app-topbar-offset). Sin overflow-x en el path
           hacia el viewport (html/body usan clip). En multi (embedded) la provee
           el workspace con totales consolidados. */}
      {!embedded && (
      <div className="hidden lg:flex sticky top-[var(--app-topbar-offset)] z-30 items-center justify-between gap-4 rounded-lg border border-border/60 bg-card/95 backdrop-blur-md px-4 py-3 shadow-md">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/crm/cotizaciones" className="shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="truncate text-base font-bold tracking-tight" title={quote.code}>{quote.code}</h1>
              {quote.name && (
                <span className="truncate text-sm font-medium text-muted-foreground" title={quote.name}>
                  {quote.name}
                </span>
              )}
              <CpqStatusBadge
                status={quote.status}
                changing={changingStatus || markingSentLicitacion}
                size="md"
                isLicitacion={isLicitacionDeal}
                onToggle={() => void handleStatusChange(quote.status === "sent" ? "draft" : "sent")}
              />
              {selectedDealStageName ? (
                <span
                  className="shrink-0"
                  title={`Etapa del negocio asociado: ${selectedDealStageName}`}
                >
                  <Tag variant="info" size="sm" className="max-w-[9rem] truncate">
                    {selectedDealStageName}
                  </Tag>
                </span>
              ) : null}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              <span
                className="truncate"
                title={[
                  selectedAccountName,
                  selectedDeal ? `Negocio: ${selectedDealTitle}` : "Sin negocio",
                  selectedDealStageName ? `Etapa: ${selectedDealStageName}` : null,
                  selectedContactName !== "Sin contacto" ? selectedContactName : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              >
                {selectedAccountName}
                {selectedDeal ? (
                  <>
                    {" · "}
                    <Link
                      href={`/crm/deals/${selectedDeal.id}`}
                      className="font-medium text-foreground/90 underline-offset-2 hover:underline"
                      title="Abrir negocio asociado"
                    >
                      {selectedDealTitle}
                    </Link>
                  </>
                ) : (
                  <span className="text-status-warn-fg"> · Sin negocio</span>
                )}
                {selectedContactName !== "Sin contacto" ? ` · ${selectedContactName}` : ""}
              </span>
              <span className="shrink-0">{headerPersistLabel}</span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden lg:flex items-stretch overflow-hidden rounded-lg border border-border/60 bg-background/40">
            <div className="flex flex-col justify-center px-3 py-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total mensual</span>
              <CpqDualCurrencyAmount
                clp={billingMonthlyTotal}
                currency={crmContext.currency || "CLP"}
                ufValue={ufValue}
                size="sm"
                align="left"
                inline
                primaryClassName="text-sm font-bold text-status-ok-fg"
              />
            </div>
            <div className="hidden xl:flex flex-col justify-center border-l border-border/50 px-3 py-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Margen</span>
              <span className={cn("text-sm font-bold leading-tight", marginPct >= 15 ? "text-status-ok-fg" : marginPct >= 10 ? "text-status-warn-fg" : "text-status-danger-fg")}>
                {Number(marginPct || 0).toFixed(1)}%
                {costSummary?.effectiveMarginPct != null &&
                  Math.abs(costSummary.effectiveMarginPct - marginPct) > 0.05 && (
                    <span className="ml-1 text-[12px] font-medium text-ds-text-3">
                      (ef. {costSummary.effectiveMarginPct.toFixed(1)}%)
                    </span>
                  )}
              </span>
            </div>
            <div className="hidden xl:flex flex-col justify-center border-l border-border/50 px-3 py-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dotación</span>
              <span className="flex items-center gap-1 text-sm font-bold leading-tight text-status-info-fg">
                <Users className="h-3.5 w-3.5" />{stats.totalGuards}
              </span>
            </div>
          </div>
          {crmContext.accountId ? (
            <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5">
              <Label htmlFor="cpq-portal-visible-desktop" className="cursor-pointer text-xs font-medium text-muted-foreground">
                Portal
              </Label>
              <Switch
                id="cpq-portal-visible-desktop"
                checked={portalListedEffective}
                disabled={portalVisibilitySaving}
                onCheckedChange={(v) => void handlePortalVisibilityChange(v)}
              />
              {portalVisibilitySaving ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden /> : null}
            </div>
          ) : null}
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-9 w-9"
            aria-label={controlCenterOpen ? "Contraer centro de control" : "Expandir centro de control"}
            title={controlCenterOpen ? "Contraer centro de control" : "Expandir centro de control"}
            onClick={toggleControlCenter}
          >
            {controlCenterOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </Button>
          <div className="relative">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-9 w-9"
              aria-label="Mas acciones"
              onClick={() => setOverflowMenuOpen((v) => !v)}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
            {overflowMenuOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setOverflowMenuOpen(false)} />
                <div className="absolute right-0 top-full z-30 mt-1 min-w-[210px] rounded-md border bg-popover p-1 shadow-md">
                  {quote.status === "sent" ? (
                    <button
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent"
                      onClick={() => { setOverflowMenuOpen(false); void handleStatusChange("draft"); }}
                      disabled={changingStatus}
                    >
                      <PencilLine className="h-3.5 w-3.5" /> Volver a borrador (editar)
                    </button>
                  ) : isLicitacionDeal ? (
                    <button
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent"
                      onClick={() => {
                        setOverflowMenuOpen(false);
                        void handleMarkSentLicitacion();
                      }}
                      disabled={changingStatus || markingSentLicitacion || !canMarkSentLicitacion}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Marcar enviada (licitación)
                    </button>
                  ) : null}
                  {(quote.status === "sent" || isLicitacionDeal) && (
                    <div className="my-1 h-px bg-border" />
                  )}
                  {isLocked ? null : !bundleId && onConverted ? (
                    <div onClick={() => setOverflowMenuOpen(false)}>
                      <ConvertToBundleButton asMenuItem quoteId={quoteId} onConverted={onConverted} />
                    </div>
                  ) : onAddInstallation ? (
                    <button
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs font-medium text-primary hover:bg-accent"
                      onClick={() => { setOverflowMenuOpen(false); onAddInstallation(); }}
                    >
                      <Plus className="h-3.5 w-3.5" /> Agregar instalación
                    </button>
                  ) : null}
                  <button className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent" onClick={() => { setOverflowMenuOpen(false); handleClone(); }} disabled={cloning}>
                    <Copy className="h-3.5 w-3.5" /> {cloning ? "Clonando..." : "Clonar cotizacion"}
                  </button>
                  <button className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent" onClick={() => { setOverflowMenuOpen(false); handleSendDotacionToInstallation(); }} disabled={sendingDotacion || !crmContext.installationId || positions.length === 0}>
                    <Building2 className="h-3.5 w-3.5" /> {sendingDotacion ? "Enviando..." : "Enviar dotacion"}
                  </button>
                  <button className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent" onClick={() => { setOverflowMenuOpen(false); setVisitaTecnicaModalOpen(true); }} disabled={!crmContext.installationId || positions.length === 0}>
                    <Briefcase className="h-3.5 w-3.5" /> Visita técnica
                  </button>
                  <button
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs font-medium text-status-info-fg hover:bg-accent"
                    onClick={() => { setOverflowMenuOpen(false); handleGenerateContract(); }}
                    disabled={generatingContract}
                  >
                    <FileSignature className="h-3.5 w-3.5" /> {generatingContract ? "Generando..." : "Generar contrato"}
                  </button>
                  <button className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent" onClick={() => { setOverflowMenuOpen(false); refresh(); }}>
                    <RefreshCw className="h-3.5 w-3.5" /> Refrescar
                  </button>
                  <div className="my-1 h-px bg-border" />
                  <button
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-status-danger-fg hover:bg-accent"
                    onClick={() => { setOverflowMenuOpen(false); void handleDelete(); }}
                    disabled={deleting || !canDeleteQuote}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> {deleting ? "Eliminando cotización..." : "Eliminar cotización"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      )}

      {/* -- Detail workspace --
           Layout 2 columnas (main + aside Centro de control) tanto en borrador
           como en enviada. El rail izquierdo y el aside se pueden contraer
           para ensanchar Datos / Condiciones / Desglose / Puestos. */}
      <div
        className={cn(
          "xl:grid xl:gap-3 xl:items-start",
          workspaceRailCollapsed
            ? "xl:grid-cols-[48px_minmax(0,1fr)]"
            : "xl:grid-cols-[168px_minmax(0,1fr)]",
        )}
      >
      <WorkspaceRail
        className="hidden xl:block"
        collapsed={workspaceRailCollapsed}
        onCollapsedChange={handleWorkspaceRailCollapsedChange}
        topOffsetClassName={embedded
          ? "top-[calc(var(--app-topbar-offset)+7.25rem)]"
          : "top-[calc(var(--app-topbar-offset)+4.75rem)]"}
        onNavigate={openAndScrollTo}
        footer={isLocked ? undefined : !bundleId && onConverted ? (
          <ConvertToBundleButton quoteId={quoteId} onConverted={onConverted} />
        ) : onAddInstallation ? (
          <Button
            variant="outline"
            size="sm"
            className="h-9 w-full justify-start gap-2 text-xs font-medium text-primary"
            onClick={onAddInstallation}
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar instalación
          </Button>
        ) : undefined}
      />
      <div
        className={cn(
          "grid gap-3 min-w-0 lg:items-start",
          controlCenterOpen && !embedded
            ? "lg:grid-cols-[minmax(0,1fr)_340px]"
            : "lg:grid-cols-1"
        )}
      >
      <div className="space-y-2 min-w-0">
      {/* -- Section: Datos (scroll-mt: visible bajo el stack sticky al navegar) -- */}
      <Card id="sec-datos" className="overflow-visible rounded-xl border-border/70 bg-card/85 shadow-sm scroll-mt-[calc(var(--app-island-bottom)+var(--cpq-sticky-h))] lg:scroll-mt-32">
        <button type="button" onClick={() => setSecDatos(v => !v)} className="flex items-center justify-between w-full border-b border-border/50 bg-muted/20 px-4 py-3 hover:bg-muted/30 transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-semibold text-primary shrink-0">Datos</h2>
            {!secDatos && (
              <span className="text-xs text-muted-foreground truncate">
                {quoteForm.clientName || "Sin cliente"}{crmContext.currency ? ` · ${crmContext.currency}` : ""}
              </span>
            )}
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", secDatos && "rotate-180")} />
        </button>
        {secDatos && (
          <div className="px-3 pb-3 pt-3 bg-card/60 sm:px-4 sm:pb-4 sm:pt-4">
            <DatosSection
              crmAccounts={crmAccounts}
              crmInstallations={crmInstallations}
              crmContacts={crmContacts}
              crmDeals={crmDeals}
              crmContext={crmContext}
              quoteForm={quoteForm}
              quoteDirty={quoteDirty}
              savingQuote={savingQuote}
              quoteError={quoteError}
              isLocked={isLocked}
              saveCrmContext={saveCrmContext}
              setQuoteForm={setQuoteForm}
              setQuoteDirty={setQuoteDirty}
              saveQuoteBasics={saveQuoteBasics}
              setCrmAccounts={setCrmAccounts}
              setCrmInstallations={setCrmInstallations}
              setCrmContacts={setCrmContacts}
              setCrmDeals={setCrmDeals}
            />
          </div>
        )}
      </Card>

      {/* -- Section: Condiciones Comerciales -- */}
      <CondicionesSection
        open={secCondiciones}
        onToggle={() => setSecCondiciones(v => !v)}
        quoteId={quoteId}
        form={quoteForm}
        setForm={setQuoteForm}
        setDirty={() => setQuoteDirty(true)}
        isLocked={isLocked}
        proposalTemplates={proposalTemplates}
        proposalTemplateId={proposalTemplateId}
        setProposalTemplateId={setProposalTemplateId}
        proposalGoverned={conditionsGovernedByProposal}
        onEditAtProposal={onEditConditionsAtProposal}
      />

      {/* -- Section: Desglose detallado (precio de venta, margen financiero) --
           Visible en todos los breakpoints: es la apertura línea por línea de la
           propuesta (mano de obra → costos → margen → financiero → líneas → total).
           El aside «Centro de control» solo muestra KPIs, no el desglose. -- */}
      <Card id="sec-desglose" className="overflow-hidden rounded-xl border-border/70 bg-card/85 shadow-sm scroll-mt-[calc(var(--app-island-bottom)+var(--cpq-sticky-h))] lg:scroll-mt-32">
        <button type="button" onClick={() => setSecDesglose(v => !v)} className="flex items-center justify-between w-full border-b border-border/50 bg-muted/20 px-4 py-3 hover:bg-muted/30 transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-semibold text-primary shrink-0">Desglose</h2>
            {!secDesglose && (
              <span className="text-xs text-muted-foreground truncate inline-flex items-center gap-1.5 max-w-[min(100%,28rem)]">
                <CpqDualCurrencyAmount
                  clp={salePriceMonthly}
                  currency={crmContext.currency || "CLP"}
                  ufValue={ufValue}
                  size="xs"
                  inline
                  primaryClassName="text-foreground font-medium"
                />
                <span>/mes · {marginPct}% margen</span>
              </span>
            )}
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", secDesglose && "rotate-180")} />
        </button>
        {secDesglose && costSummary && (
          <div className="px-3 pb-3 pt-3 bg-card/60 sm:px-4 sm:pb-4 sm:pt-4">
            <QuoteBreakdownPanel
              data={buildBreakdownData(
                costSummary,
                costCategoryBreakdown,
                positions,
                positionSalePrices,
                marginPct,
                marginAmount,
                salePriceMonthly,
                additionalLinesTotal,
                monthlyHours,
                crmContext.currency || "UF",
                ufValue,
              )}
              variant="default"
            />
          </div>
        )}
      </Card>

      {/* -- Section: Puestos -- */}
      <Card id="sec-puestos" className="overflow-hidden rounded-xl border-border/70 bg-card/85 shadow-sm scroll-mt-[calc(var(--app-island-bottom)+var(--cpq-sticky-h))] lg:scroll-mt-32">
        <div role="button" tabIndex={0} onClick={() => setSecPuestos(v => !v)} className="flex items-center justify-between w-full border-b border-border/50 bg-muted/20 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-semibold text-primary shrink-0">Puestos</h2>
            {!secPuestos && positions.length > 0 && (
              <span className="text-xs text-muted-foreground truncate">
                {positions.length} {positions.length === 1 ? "puesto" : "puestos"} · {stats.totalGuards} guardias —{" "}
                <span className="inline-flex align-middle">
                  <CpqDualCurrencyAmount
                    clp={positions.reduce((sum, p) => sum + Number(p.monthlyPositionCost), 0)}
                    currency={crmContext.currency || "CLP"}
                    ufValue={ufValue}
                    size="xs"
                    inline
                    primaryClassName="text-foreground font-medium"
                  />
                </span>
              </span>
            )}
            {secPuestos && stats.totalGuards > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setGuardsBreakdownOpen((v) => !v);
                }}
                disabled={roleSummary.length === 0}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap shrink-0 transition-all lg:hidden",
                  "focus:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  roleSummary.length > 0
                    ? "border-status-info-border bg-status-info-soft/30 text-status-info-fg"
                    : "border-border/60 bg-muted/30 text-muted-foreground",
                )}
                aria-expanded={guardsBreakdownOpen}
                aria-controls="guards-breakdown-row"
              >
                <Users className="h-3 w-3 shrink-0" aria-hidden />
                <span className="tabular-nums font-semibold">{stats.totalGuards}</span>
                <span>guardias</span>
                {roleSummary.length > 0 && (
                  <ChevronDown
                    className={cn("h-3 w-3 shrink-0 transition-transform", guardsBreakdownOpen && "rotate-180")}
                    aria-hidden
                  />
                )}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", secPuestos && "rotate-180")} />
          </div>
        </div>
        {secPuestos && (
          // No usamos `inert` aunque la cotización esté enviada: bloquearía
          // también el cambio de vista (grilla/tarjetas), el colapsar/expandir
          // y el reordenar — interacciones de solo-visualización. La edición de
          // datos ya está bloqueada granularmente vía `readOnly` en la matriz.
          <div className="px-3 pb-3 pt-3 bg-card/60 sm:px-4 sm:pb-4 sm:pt-4">
            {guardsBreakdownOpen && roleSummary.length > 0 && (
              <div
                id="guards-breakdown-row"
                className="mb-2 flex w-full items-center gap-1.5 overflow-x-auto overflow-y-hidden touch-pan-x overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden"
                role="list"
                aria-label="Desglose de guardias por rol"
              >
                {roleSummary.map((item, idx) => (
                  <span
                    key={`${item.label}-${idx}`}
                    role="listitem"
                    className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-muted/30 px-1.5 py-0.5 text-xs whitespace-nowrap shrink-0"
                  >
                    <span className="font-mono font-semibold text-foreground tabular-nums">
                      {item.qty}×
                    </span>
                    <span className="text-muted-foreground">{item.label}</span>
                  </span>
                ))}
              </div>
            )}
            <PositionMatrix adapter={matrixAdapter} />
            {positions.length > 0 && (
              <div className={cn(CPQ_BREAKDOWN_SHELL, CPQ_BREAKDOWN_ROW, "px-3 py-2 border border-dashed border-border/60 rounded-lg mt-2 text-xs")}>
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <span className="text-xs font-semibold text-muted-foreground break-words">Total mano de obra</span>
                  {!isLocked && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                      disabled={recalculatingAll}
                      onClick={handleRecalculateAll}
                    >
                      <RefreshCw className={cn("h-3 w-3 mr-1", recalculatingAll && "animate-spin")} />
                      Recalcular todos
                    </Button>
                  )}
                </div>
                <div className={cpqBreakdownAmount()}>
                  <CpqDualCurrencyAmount
                    clp={positions.reduce((sum, p) => sum + Number(p.monthlyPositionCost), 0)}
                    currency={crmContext.currency || "CLP"}
                    ufValue={ufValue}
                    size="sm"
                    primaryClassName="font-bold"
                  />
                </div>
              </div>
            )}
            {!isLocked && (
              <div className="mt-3 lg:hidden">
                <CreateServiceModal
                  quoteId={quoteId}
                  onCreated={refresh}
                  disabled={isLocked}
                  triggerVariant="inline"
                />
              </div>
            )}
          </div>
        )}
      </Card>

      {/* -- Section: Costos -- */}
      <Card id="sec-costos" className="overflow-hidden rounded-xl border-border/70 bg-card/85 shadow-sm scroll-mt-[calc(var(--app-island-bottom)+var(--cpq-sticky-h))] lg:scroll-mt-32">
        <button type="button" onClick={() => setSecCostos(v => !v)} className="flex items-center justify-between w-full border-b border-border/50 bg-muted/20 px-4 py-3 hover:bg-muted/30 transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-semibold text-primary shrink-0">Costos adicionales</h2>
            {!secCostos && costSummary && (costSummary.monthlyExtras ?? 0) > 0 && (
              <span className="text-xs text-muted-foreground truncate">
                <span className="inline-flex align-middle">
                  <CpqDualCurrencyAmount
                    clp={costSummary.monthlyExtras ?? 0}
                    currency={crmContext.currency || "CLP"}
                    ufValue={ufValue}
                    size="xs"
                    inline
                    primaryClassName="text-foreground font-medium"
                  />
                </span>
              </span>
            )}
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", secCostos && "rotate-180")} />
        </button>
        {secCostos && (
          // No usamos `inert` con cotización enviada: bloquearía expandir/
          // colapsar cada categoría para ver el detalle. La edición ya queda
          // bloqueada vía `readOnly` en CpqQuoteCosts.
          <div className="px-3 pb-3 pt-3 bg-card/60 sm:px-4 sm:pb-4 sm:pt-4">
            <CpqQuoteCosts
              quoteId={quoteId}
              variant="inline"
              showFinancial={false}
              readOnly={isLocked}
              onAdditionalLinesChange={setAdditionalLines}
              onSaved={refresh}
              displayCurrency={crmContext.currency || "CLP"}
              ufValue={ufValue}
              externalSummary={costSummary}
            />
          </div>
        )}
      </Card>

      {/* -- Section: Líneas adicionales -- */}
      <LineasSection
        open={secLineas}
        onToggle={() => setSecLineas(v => !v)}
        lines={additionalLines}
        setLines={setAdditionalLines}
        isLocked={isLocked}
        currency={crmContext.currency || "CLP"}
        ufValue={ufValue}
        addlIsUf={addlIsUf}
        addlToInput={addlToInput}
        addlFromInput={addlFromInput}
        additionalLinesTotal={additionalLinesTotal}
        savingFinancials={savingFinancials}
        onSaveNow={() => {
          clearTimeout(financialsAutoSaveTimer.current);
          handleSaveFinancials();
        }}
      />

      {/* -- Section: Financials -- */}
      <FinancierosSection
        open={secFinancieros}
        onToggle={() => setSecFinancieros(v => !v)}
        isLocked={isLocked}
        costParams={costParams}
        updateParams={updateParams}
        costSummary={costSummary}
        savingFinancials={savingFinancials}
        financialError={financialError}
        decimalDrafts={decimalDrafts}
        getDecimalValue={getDecimalValue}
        setDecimalValue={setDecimalValue}
        clearDecimalValue={clearDecimalValue}
        proposalGoverned={conditionsGovernedByProposal}
        onEditAtProposal={onEditConditionsAtProposal}
        currency={crmContext.currency || "CLP"}
        ufValue={ufValue}
        contractDuration={quoteForm.contractDuration ?? 12}
        insurancePolicyUF={quoteForm.insurancePolicyUF}
        onInsurancePolicyUFChange={(uf) => {
          setQuoteForm((prev) => ({ ...prev, insurancePolicyUF: uf }));
          setQuoteDirty(true);
        }}
      />

      {/* -- Section: Margen -- */}
      <Card id="sec-margen" className="overflow-hidden rounded-xl border-border/70 bg-card/85 shadow-sm scroll-mt-[calc(var(--app-island-bottom)+var(--cpq-sticky-h))] lg:scroll-mt-32">
        <button type="button" onClick={() => setSecMargen(v => !v)} className="flex items-center justify-between w-full border-b border-border/50 bg-muted/20 px-4 py-3 hover:bg-muted/30 transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-semibold text-primary shrink-0">Margen de venta</h2>
            {!secMargen && (
              <span className="text-xs text-muted-foreground truncate">
                <span className="font-medium text-foreground">{Number(marginPct || 0).toFixed(1)}%</span>
                {marginAmount > 0 && <> — <span className="font-medium text-foreground">{formatCurrency(marginAmount)}</span></>}
              </span>
            )}
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", secMargen && "rotate-180")} />
        </button>
        {secMargen && (
          <div className="px-3 pb-3 pt-3 bg-card/60 sm:px-4 sm:pb-4 sm:pt-4" inert={isLocked ? true : undefined}>
            <MarginSection
              marginPct={marginPct}
              onMarginChange={handleMarginChange}
              marginAmount={marginAmount}
              isLocked={isLocked}
              marginMode={marginMode}
              onMarginModeChange={handleMarginModeChange}
            />
          </div>
        )}
      </Card>

      {/* -- Section: Contenido AI (Descripcion + Detalle servicio) -- */}
      <AiSection
        open={secAiContent}
        onToggle={() => setSecAiContent(v => !v)}
        isLocked={isLocked}
        aiDescription={quote.aiDescription ?? null}
        serviceDetail={quote.serviceDetail ?? null}
        onAiDescriptionChange={(v) => {
          setQuote((prev) => (prev ? { ...prev, aiDescription: v } : prev));
          saveQuoteFieldDebounced("aiDescription", v);
        }}
        onServiceDetailChange={(v) => {
          setQuote((prev) => (prev ? { ...prev, serviceDetail: v } : prev));
          saveQuoteFieldDebounced("serviceDetail", v);
        }}
        aiCustomInstruction={aiCustomInstruction}
        setAiCustomInstruction={setAiCustomInstruction}
        serviceDetailInstruction={serviceDetailInstruction}
        setServiceDetailInstruction={setServiceDetailInstruction}
        generatingAi={generatingAi}
        generatingServiceDetail={generatingServiceDetail}
        onGenerateAiDescription={generateAiDescription}
        onGenerateServiceDetail={generateServiceDetail}
        regeneratingProposalAi={regeneratingProposalAi}
        onRegenerateProposalAi={regenerateProposalAi}
      />

      {/* -- Section: Incluye (items incluidos en la cotización) -- */}
      <Card id="sec-incluye" className="overflow-visible rounded-xl border-border/70 bg-card/85 shadow-sm scroll-mt-[calc(var(--app-island-bottom)+var(--cpq-sticky-h))] lg:scroll-mt-32">
        <button
          type="button"
          onClick={() => setSecIncluye((v) => !v)}
          className="flex items-center justify-between w-full border-b border-border/50 bg-muted/20 px-4 py-3 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-semibold text-primary shrink-0">Incluye</h2>
            {!secIncluye && (
              <span className="text-xs text-muted-foreground truncate">
                Items incluidos en la propuesta
              </span>
            )}
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", secIncluye && "rotate-180")} />
        </button>
        {secIncluye && (
          <div className="px-3 pb-3 pt-3 bg-card/60 sm:px-4 sm:pb-4 sm:pt-4">
            <QuoteIncludesEditor quoteId={quoteId} isLocked={isLocked} />
          </div>
        )}
      </Card>

      {/* -- Section: PDF y documentos -- */}
      <Card className="overflow-visible rounded-xl border-border/70 bg-card/85 shadow-sm scroll-mt-44 xl:hidden sm:scroll-mt-32">
        <button
          type="button"
          onClick={() => setSecPdf((v) => !v)}
          className="flex items-center justify-between w-full border-b border-border/50 bg-muted/20 px-4 py-3 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-semibold text-primary shrink-0">PDF y documentos</h2>
            {!secPdf && (
              <span className="text-xs text-muted-foreground truncate">
                {pdfPreviewLoading
                  ? "Generando…"
                  : pdfPreviewUrl
                    ? "Vista previa lista"
                    : pdfPreviewMode === "presentacion"
                      ? "Presentación · sin generar"
                      : "Cotización · sin generar"}
              </span>
            )}
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", secPdf && "rotate-180")} />
        </button>
        {secPdf && (
          <div className="px-3 pb-3 pt-3 bg-card/60 sm:px-4 sm:pb-4 sm:pt-4">
            <CpqPdfPreviewPanel
              mode={pdfPreviewMode}
              templateSlug={pdfTemplateSlug}
              previewUrl={pdfPreviewUrl}
              loading={pdfPreviewLoading}
              onModeChange={(mode) => {
                setPdfPreviewMode(mode);
                setPdfPreviewUrl(null);
              }}
              onTemplateSlugChange={(slug) => {
                setPdfTemplateSlug(slug);
                setPdfPreviewUrl(null);
              }}
              onGenerate={handleGeneratePdfPreview}
              className="border-0 shadow-none"
              previewClassName={pdfPreviewUrl ? "h-[420px] sm:h-[620px]" : undefined}
              footer={
                <QuoteAttachmentsSection
                  quoteId={quoteId}
                  isLocked={isLocked}
                  defaultExpanded
                  compact
                  className="mt-0 border-border/60 bg-background/40 shadow-none"
                />
              }
            />
          </div>
        )}
      </Card>

      {/* -- Section: Auditoría (registro de todos los cambios) --
           En multi-instalación la auditoría vive en el Consolidado, que reúne
           los eventos de la propuesta y de todas sus instalaciones. */}
      {!embedded && (
      <Card id="sec-auditoria" className="overflow-visible rounded-xl border-border/70 bg-card/85 shadow-sm scroll-mt-[calc(var(--app-island-bottom)+var(--cpq-sticky-h))] lg:scroll-mt-32">
        <div className="flex items-center justify-between w-full border-b border-border/50 bg-muted/20 px-4 py-3">
          <button type="button" onClick={() => setSecAuditoria((v) => !v)} className="flex-1 flex items-center gap-2 min-w-0 text-left hover:bg-muted/10 transition-colors -m-1 p-1 rounded">
            <h2 className="text-sm font-semibold text-primary shrink-0">Auditoría</h2>
            {!secAuditoria && activityEvents.length > 0 && (
              <span className="text-xs text-muted-foreground break-words">
                {activityEvents.length} registro{activityEvents.length !== 1 ? "s" : ""}
              </span>
            )}
          </button>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => router.refresh()} title="Actualizar auditoría">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            <button type="button" onClick={() => setSecAuditoria((v) => !v)} className="p-1 hover:bg-muted/10 rounded">
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", secAuditoria && "rotate-180")} />
            </button>
          </div>
        </div>
        {secAuditoria && (
          <div className="px-3 pb-3 pt-3 bg-card/60 sm:px-4 sm:pb-4 sm:pt-4">
            <p className="text-sm text-muted-foreground mb-3">
              Registro de todos los cambios: quién, cuándo y qué se modificó.
            </p>
            <CrmActivityTimeline events={activityEvents} />
          </div>
        )}
      </Card>
      )}

      </div>{/* end main column */}

      {controlCenterOpen && !embedded ? (
      <aside className="hidden lg:block min-w-0">
        {/* Centro de control: contraíble desde la barra sticky o desde este header.
            KPIs clave viven también en la barra superior sticky. */}
        <div className="space-y-3">
          <Card className="overflow-hidden border-border/70 bg-card/80 shadow-sm">
            <div className="border-b border-border/50 bg-muted/20 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Centro de control
                  </p>
                  <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
                    Resumen comercial
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="rounded-md border border-border/60 bg-background/50 px-2 py-1 text-xs font-medium text-muted-foreground">
                    {quote.code}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    aria-label="Contraer centro de control"
                    title="Contraer centro de control"
                    onClick={toggleControlCenter}
                  >
                    <PanelRightClose className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <ControlCenterPanel
              quoteId={quoteId}
              quoteStatus={quote.status}
              isLocked={isLocked}
              crmContext={crmContext}
              billingMonthlyTotal={billingMonthlyTotal}
              additionalLinesOneTimeTotal={additionalLinesOneTimeTotal}
              ufValue={ufValue}
              marginPct={marginPct}
              totalGuards={stats.totalGuards}
              roleSummary={roleSummary}
              onToggleGuardsBreakdown={() => setGuardsBreakdownOpen((v) => !v)}
              canSendPortalProposal={canSendPortalProposal}
              portalReadinessItems={portalReadinessItems}
              contactHasEmail={contactHasEmail}
              onSendProposal={openPortalProposal}
              isLicitacion={isLicitacionDeal}
              canMarkSentLicitacion={canMarkSentLicitacion}
              markingSentLicitacion={markingSentLicitacion}
              onMarkSentLicitacion={() => void handleMarkSentLicitacion()}
              dealTitle={selectedDeal ? selectedDealTitle : null}
              dealStageName={selectedDealStageName}
              positionsCount={positions.length}
              additionalLinesCount={additionalLines?.length ?? 0}
              pdfPreviewMode={pdfPreviewMode}
              pdfTemplateSlug={pdfTemplateSlug}
              pdfPreviewUrl={pdfPreviewUrl}
              pdfPreviewLoading={pdfPreviewLoading}
              onPdfModeChange={(mode) => { setPdfPreviewMode(mode); setPdfPreviewUrl(null); }}
              onPdfTemplateSlugChange={(slug) => { setPdfTemplateSlug(slug); setPdfPreviewUrl(null); }}
              onGeneratePdfPreview={handleGeneratePdfPreview}
            />
          </Card>
        </div>
      </aside>
      ) : null}

      </div>{/* end detail workspace */}
      </div>{/* end rail wrapper */}

      {/* -- Mobile bottom bar (replaces wizard nav) -- */}
      {!embedded && (
      <MobileBottomBar
        className="lg:hidden"
        hideTotal
        hideActionTrigger
        actionSheetOpen={stickyActionSheetOpen}
        onActionSheetOpenChange={setStickyActionSheetOpen}
        centerButton={<ControlCenterTrigger onClick={() => setControlSheetOpen(true)} />}
        salePriceMonthly={salePriceMonthly}
        additionalLinesTotal={additionalLinesTotal}
        marginPct={marginPct}
        ufValue={ufValue}
        displayCurrency={crmContext.currency || "CLP"}
        totalGuards={stats.totalGuards}
        actionMenu={
          <>
            {quote.status === "sent" ? (
              <button
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
                onClick={() => void handleStatusChange("draft")}
                disabled={changingStatus}
              >
                <PencilLine className="h-4 w-4" /> Volver a borrador (editar)
              </button>
            ) : isLicitacionDeal ? (
              <button
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
                onClick={() => void handleMarkSentLicitacion()}
                disabled={changingStatus || markingSentLicitacion || !canMarkSentLicitacion}
              >
                <CheckCircle2 className="h-4 w-4" />
                Marcar enviada (licitación)
              </button>
            ) : null}
            {isLocked ? null : !bundleId && onConverted ? (
              <ConvertToBundleButton asMenuItem quoteId={quoteId} onConverted={onConverted} />
            ) : onAddInstallation ? (
              <button
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-primary hover:bg-accent"
                onClick={() => onAddInstallation()}
              >
                <Plus className="h-4 w-4" /> Agregar instalación
              </button>
            ) : null}
            <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent" onClick={() => handleClone()} disabled={cloning}>
              <Copy className="h-4 w-4" /> {cloning ? "Clonando..." : "Clonar cotizacion"}
            </button>
            <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent" onClick={() => handleSendDotacionToInstallation()} disabled={sendingDotacion || !crmContext.installationId || positions.length === 0}>
              <Building2 className="h-4 w-4" /> {sendingDotacion ? "Enviando..." : "Enviar dotacion"}
            </button>
            <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent" onClick={() => setVisitaTecnicaModalOpen(true)} disabled={!crmContext.installationId || positions.length === 0}>
              <Briefcase className="h-4 w-4" /> Visita técnica
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-status-info-fg hover:bg-accent"
              onClick={() => handleGenerateContract()}
              disabled={generatingContract}
            >
              <FileSignature className="h-4 w-4" /> {generatingContract ? "Generando..." : "Generar contrato"}
            </button>
            <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent" onClick={() => refresh()}>
              <RefreshCw className="h-4 w-4" /> Refrescar
            </button>
            {crmContext.accountId ? (
              <button
                className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
                onClick={() => void handlePortalVisibilityChange(!portalListedEffective)}
                disabled={portalVisibilitySaving}
              >
                <span className="flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  <span>Visible en portal</span>
                </span>
                <span className={cn(
                  "inline-flex h-4 w-7 items-center rounded-full border transition-colors shrink-0",
                  portalListedEffective
                    ? "bg-status-ok/80 border-status-ok-border"
                    : "bg-muted border-border"
                )}>
                  <span className={cn(
                    "inline-block h-3 w-3 rounded-full bg-white transition-transform",
                    portalListedEffective ? "translate-x-3.5" : "translate-x-0.5"
                  )} />
                </span>
              </button>
            ) : null}
            <div className="my-1 h-px bg-border" />
            <button
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-status-danger-fg hover:bg-accent"
              onClick={() => void handleDelete()}
              disabled={deleting || !canDeleteQuote}
            >
              <Trash2 className="h-4 w-4" /> {deleting ? "Eliminando cotización..." : "Eliminar cotización"}
            </button>
          </>
        }
        portalButton={(() => {
          // Licitación: el CTA principal marca enviada → Negociación (sin portal/mail).
          // Cotización normal: conserva Enviar propuesta (portal + correo).
          if (isLicitacionDeal) {
            const alreadySent = quote?.status === "sent";
            return (
              <Button
                className="w-full h-11 gap-2 text-sm font-semibold bg-status-ok hover:brightness-110 text-white"
                disabled={
                  alreadySent ||
                  changingStatus ||
                  markingSentLicitacion ||
                  !canMarkSentLicitacion
                }
                title={
                  alreadySent
                    ? "Ya marcada como enviada (licitación)"
                    : "Marca como enviada y pasa el negocio a Negociación (sin portal ni correo)"
                }
                onClick={() => void handleMarkSentLicitacion()}
              >
                <Send className="h-4 w-4" />
                {markingSentLicitacion
                  ? "Marcando…"
                  : alreadySent
                    ? "Enviada"
                    : "Enviar"}
              </Button>
            );
          }
          const baseDisabled =
            !quote ||
            (positions.length === 0 && (additionalLines?.length ?? 0) === 0) ||
            !crmContext.accountId ||
            !crmContext.contactId ||
            !crmContext.dealId;
          return (
            <Button
              className="w-full h-11 gap-2 text-sm font-semibold bg-status-ok hover:brightness-110 text-white"
              disabled={baseDisabled}
              title={
                crmContext.contactId && !contactHasEmail
                  ? "El contacto no tiene email cargado"
                  : undefined
              }
              onClick={openPortalProposal}
            >
              <Send className="h-4 w-4" />
              {quote?.status === "sent" ? "Reenviar" : "Enviar"}
            </Button>
          );
        })()}
      />
      )}

      {crmContext.dealId && contactForPortal?.email ? (
            <SendPortalProposalModal
              key="portal-proposal"
              open={portalProposalOpen}
              onOpenChange={setPortalProposalOpen}
              quoteId={quoteId}
              quoteCode={quote?.code ?? ""}
              defaultEmailSubject={portalInviteSubjectDefault}
              dealId={crmContext.dealId}
              quoteContact={{
                id: contactForPortal.id,
                firstName: contactForPortal.firstName,
                lastName: contactForPortal.lastName,
                email: contactForPortal.email,
                roleTitle: null,
              }}
              hasGuards={positions.length > 0}
              disabled={
                !quote ||
                (positions.length === 0 && (additionalLines?.length ?? 0) === 0) ||
                !crmContext.accountId ||
                !crmContext.dealId
              }
              onBeforeSend={flushPendingSaves}
              onComplete={handlePortalProposalComplete}
            />
      ) : null}

      {/* Modal de WhatsApp — se muestra tras envio exitoso cuando usuario eligio enviar + WhatsApp */}
      <Dialog open={whatsappModalOpen} onOpenChange={setWhatsappModalOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-status-ok-fg" />
              ¡Enviado! Ahora por WhatsApp
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              Email enviado a <strong className="text-foreground">{whatsappSentTo}</strong>. Haz clic para enviarle el mismo mensaje por WhatsApp.
            </p>
            <div className="rounded-lg border border-status-ok-border bg-status-ok-soft/30 p-3 space-y-1">
              <p className="text-xs font-semibold text-status-ok-fg uppercase tracking-wide">El mensaje incluye</p>
              <p className="text-xs text-muted-foreground">🔑 Email y PIN de acceso al portal</p>
              <p className="text-xs text-muted-foreground">🔗 Link al portal y a la propuesta técnica</p>
              <p className="text-xs text-muted-foreground">📋 Beneficios del portal explicados</p>
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              className="w-full gap-2 bg-status-ok hover:brightness-110 text-white h-11"
              onClick={() => {
                if (whatsappUrl) window.open(whatsappUrl, "_blank");
                setWhatsappModalOpen(false);
              }}
            >
              <MessageCircle className="h-4 w-4" />
              Compartir por WhatsApp
            </Button>
            <Button variant="ghost" className="w-full text-muted-foreground text-xs" onClick={() => setWhatsappModalOpen(false)}>
              Omitir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal Visita Técnica ── */}
      <VisitaTecnicaSolicitudModal
        open={visitaTecnicaModalOpen}
        onOpenChange={setVisitaTecnicaModalOpen}
        quoteId={quoteId}
        quoteCode={quote?.code ?? ""}
        accountId={crmContext.accountId || undefined}
        installation={
          crmContext.installationId
            ? crmInstallations.find((i) => i.id === crmContext.installationId) ?? null
            : null
        }
        positions={positions}
        onSuccess={(data) => {
          setVisitaTecnicaWaData({
            supervisorName: data.supervisorName,
            supervisorEmail: data.supervisorEmail,
            supervisors: data.supervisors,
            installationName: data.installationName,
            installationAddress: data.installationAddress,
            mapsUrl: data.mapsUrl,
            contactName: data.contactName,
            contactPhone: data.contactPhone,
            scheduledAt: data.scheduledAt,
            quoteCode: data.quoteCode,
            puestosDetail: data.puestosDetail,
          });
          setVisitaTecnicaWaModalOpen(true);
          refresh();
        }}
      />

      {/* ── Modal WhatsApp post visita técnica ── */}
      <Dialog open={visitaTecnicaWaModalOpen} onOpenChange={setVisitaTecnicaWaModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-status-ok-fg" />
              ¡Visita programada!
            </DialogTitle>
          </DialogHeader>
          {visitaTecnicaWaData && (
            <div className="py-2 space-y-3">
              <p className="text-sm text-muted-foreground flex-shrink-0">
                {visitaTecnicaWaData.supervisors && visitaTecnicaWaData.supervisors.length > 1 ? (
                  <>Email enviado a <strong className="text-foreground">{visitaTecnicaWaData.supervisors.filter((s) => s.emailSent).map((s) => s.email).join(", ")}</strong>.</>
                ) : (
                  <>Email enviado a <strong className="text-foreground">{visitaTecnicaWaData.supervisorEmail}</strong>.</>
                )}
              </p>

              {visitaWaResolved && (
                <div className="rounded-lg border border-status-ok-border bg-status-ok-soft/30 p-3 space-y-2">
                  <p className="text-xs font-semibold text-status-ok-fg uppercase tracking-wide">Mensaje prellenado</p>
                  <div className="max-h-[280px] overflow-y-auto">
                    <p className="text-sm text-muted-foreground whitespace-pre-line">{visitaWaResolved.message}</p>
                  </div>
                  <div className="flex flex-col gap-2 pt-2">
                    <Button
                      className="w-full gap-2 bg-status-ok hover:brightness-110 text-white"
                      onClick={() => {
                        window.open(visitaWaResolved.url, "_blank");
                        setVisitaTecnicaWaModalOpen(false);
                      }}
                    >
                      <MessageCircle className="h-4 w-4" />
                      Elegir grupo / contacto en WhatsApp
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" className="w-full text-muted-foreground text-xs" onClick={() => setVisitaTecnicaWaModalOpen(false)}>
              Omitir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ControlCenterSheet
        open={controlSheetOpen}
        onOpenChange={setControlSheetOpen}
        panelProps={{
          quoteId,
          quoteStatus: quote.status,
          isLocked,
          crmContext,
          billingMonthlyTotal,
          additionalLinesOneTimeTotal,
          ufValue,
          marginPct,
          totalGuards: stats.totalGuards,
          roleSummary,
          onToggleGuardsBreakdown: () => setGuardsBreakdownOpen((v) => !v),
          canSendPortalProposal,
          portalReadinessItems,
          contactHasEmail,
          onSendProposal: () => { setControlSheetOpen(false); openPortalProposal(); },
          isLicitacion: isLicitacionDeal,
          canMarkSentLicitacion,
          markingSentLicitacion,
          onMarkSentLicitacion: () => {
            setControlSheetOpen(false);
            void handleMarkSentLicitacion();
          },
          dealTitle: selectedDeal ? selectedDealTitle : null,
          dealStageName: selectedDealStageName,
          positionsCount: positions.length,
          additionalLinesCount: additionalLines?.length ?? 0,
          pdfPreviewMode,
          pdfTemplateSlug,
          pdfPreviewUrl,
          pdfPreviewLoading,
          onPdfModeChange: (mode) => { setPdfPreviewMode(mode); setPdfPreviewUrl(null); },
          onPdfTemplateSlugChange: (slug) => { setPdfTemplateSlug(slug); setPdfPreviewUrl(null); },
          onGeneratePdfPreview: handleGeneratePdfPreview,
        }}
      />

    </div>
  );
}
