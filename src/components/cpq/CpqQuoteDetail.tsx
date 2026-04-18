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
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/opai/EmptyState";
import { CreatePositionModal } from "@/components/cpq/CreatePositionModal";
import { CpqPositionCard } from "@/components/cpq/CpqPositionCard";
import { CpqQuoteCosts } from "@/components/cpq/CpqQuoteCosts";
import { SendPortalProposalModal } from "@/components/cpq/SendPortalProposalModal";
import { formatCurrency } from "@/components/cpq/utils";
import { CpqDualCurrencyAmount } from "@/components/cpq/CpqDualCurrency";
import {
  CPQ_BREAKDOWN_SHELL,
  CPQ_BREAKDOWN_ROW,
  cpqBreakdownAmount,
} from "@/components/cpq/cpqBreakdownLayout";
import { cn, formatNumber, parseLocalizedNumber } from "@/lib/utils";
import { getErrorMessageFromResponse } from "@/lib/parse-fetch-error";
import {
  buildCpqQuotePdfFileName,
  parseContentDispositionFileName,
} from "@/lib/pdf/cpq-quote-pdf-filename";
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
} from "@/types/cpq";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, ChevronDown, Copy, RefreshCw, Users, MoreVertical, Trash2, Download, Loader2, Building2, Plus, MessageCircle, Send, Check, Briefcase, Phone, FileText, Sparkles, CalendarDays, FileSignature } from "lucide-react";
import { DatosSection } from "@/components/cpq/DatosSection";
import MarginSection from "@/components/cpq/MarginSection";
import { QuoteAttachmentsSection } from "@/components/cpq/QuoteAttachmentsSection";
import { buildBreakdownData } from "@/components/cpq/FinancialPanel";
import { QuoteBreakdownPanel } from "@/components/cpq/QuoteBreakdownPanel";
import { QuoteIncludesEditor } from "@/components/cpq/QuoteIncludesEditor";
import { MobileBottomBar } from "@/components/cpq/MobileBottomBar";
import type { FollowUpDecision } from "@/components/cpq/FollowUpDecisionModal";
import { CrmActivityTimeline } from "@/components/crm/CrmActivityTimeline";
import { VisitaTecnicaSolicitudModal } from "@/components/cpq/VisitaTecnicaSolicitudModal";
import { ServiceTemplateButtons } from "@/components/cpq/ServiceTemplateButtons";
import type { ServiceTemplate } from "@/lib/cpq/service-templates";
import { resolveRolIdFromShiftPattern } from "@/lib/cpq/resolve-cpq-role-from-shift-pattern";
import { isCpqQuoteListedInClientPortal } from "@/lib/cpq-portal-visibility";
import { buildDefaultPortalInviteEmailSubject } from "@/lib/cpq-portal-email-subject";

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
  salePriceBase: 0,
  salePriceMonthly: 0,
  policyEnabled: false,
  policyRatePct: 2.5,
  policyAdminRatePct: 0,
  policyContractMonths: 12,
  policyContractPct: 20,
  contractMonths: 12,
  contractAmount: 0,
  marginPct: 13,
};

function roundUpToNice(value: number): number {
  if (value <= 0) return 0;
  return Math.ceil(value / 100000) * 100000;
}

export function CpqQuoteDetail({
  quoteId,
  currentUserId,
  activityEvents = [],
  defaultPortalEmailSubject,
  tenantBrandName,
}: CpqQuoteDetailProps) {
  const router = useRouter();
  const [quote, setQuote] = useState<CpqQuote | null>(null);

  // Contexto de página para OPAI Intelligence (chat contextual tipo Notion).
  // Mientras la cotización carga, el hook recibe null y no registra contexto.
  useRegisterChatPageContext(
    quote
      ? {
          entityType: "cpq_quote",
          entityId: quote.id,
          entityName: quote.name || quote.code || "Cotización",
          entityUrl: `/crm/cotizaciones/${quote.id}`,
          extra: quote.clientName ? `Cliente: ${quote.clientName}` : undefined,
        }
      : null,
  );
  const [positions, setPositions] = useState<CpqPosition[]>([]);
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
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);
  const [generatingContract, setGeneratingContract] = useState(false);
  const [contractTemplates, setContractTemplates] = useState<{ id: string; name: string }[]>([]);
  const [statusChangePending, setStatusChangePending] = useState<"draft" | "sent" | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);
  const [portalVisibilitySaving, setPortalVisibilitySaving] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingProposalPdf, setDownloadingProposalPdf] = useState(false);
  const [sendingDotacion, setSendingDotacion] = useState(false);
  const [portalProposalOpen, setPortalProposalOpen] = useState(false);
  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false);
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  const [whatsappSentTo, setWhatsappSentTo] = useState<string>("");
  // Visita técnica
  const [visitaTecnicaModalOpen, setVisitaTecnicaModalOpen] = useState(false);
  const [visitaTecnicaWaModalOpen, setVisitaTecnicaWaModalOpen] = useState(false);
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
    googleCalendarUrl?: string;
  } | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [savingFinancials, setSavingFinancials] = useState(false);
  const [financialError, setFinancialError] = useState<string | null>(null);
  const [decimalDrafts, setDecimalDrafts] = useState<Record<string, string>>({});
  const [quoteForm, setQuoteForm] = useState({
    name: "",
    clientName: "",
    validUntil: "",
    notes: "",
    status: "draft" as CpqQuote["status"],
    paymentTerms: "contrafactura",
    serviceStartDays: 5,
    contractDuration: 12,
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
  const [crmDeals, setCrmDeals] = useState<{ id: string; title: string }[]>([]);
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
  const [pdfPreviewMode, setPdfPreviewMode] = useState<"cotizacion" | "presentacion">("presentacion");
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewLoading, setPdfPreviewLoading] = useState(false);
  const [pdfTemplateSlug, setPdfTemplateSlug] = useState("standard");
  const [docAiTab, setDocAiTab] = useState<"description" | "service">("description");
  const initialLoadDone = useRef(false);
  const skipAutoSave = useRef(false);
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
      const [quoteRes, costsRes] = await Promise.all([
        fetch(`/api/cpq/quotes/${quoteId}`),
        fetch(`/api/cpq/quotes/${quoteId}/costs`),
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
    financialsAutoSaveTimer.current = setTimeout(() => {
      handleSaveFinancials();
    }, 2000);
    return () => clearTimeout(financialsAutoSaveTimer.current);
  }, [costParams, additionalLines]);

  // Debounced auto-save for quote basics (quoteForm)
  useEffect(() => {
    if (!initialLoadDone.current || isLocked) return;
    clearTimeout(quoteFormAutoSaveTimer.current);
    quoteFormAutoSaveTimer.current = setTimeout(() => {
      saveQuoteBasics();
    }, 2000);
    return () => clearTimeout(quoteFormAutoSaveTimer.current);
  }, [quoteForm.name, quoteForm.validUntil, quoteForm.notes, quoteForm.paymentTerms, quoteForm.serviceStartDays, quoteForm.contractDuration, quoteForm.adjustmentType, quoteForm.adjustmentFreq, quoteForm.ipcWeight, quoteForm.imoWeight, quoteForm.insurancePolicyUF, quoteForm.contractStartDate, quoteForm.liabilityMonths, quoteForm.hasCCTV, quoteForm.cctvRetentionDays, quoteForm.contractTemplateId, quoteForm.paymentDays, quoteForm.realAnnualIncrement]);

  // Auto-calc salePriceBase when costSummary changes
  useEffect(() => {
    if (!costSummary || !costParams) return;
    const base = Number(costParams.salePriceBase ?? 0);
    if (base > 0) return;
    const costsBase =
      (costSummary.monthlyPositions ?? 0) +
      (costSummary.monthlyHolidayAdjustment ?? 0) +
      (costSummary.monthlyUniforms ?? 0) +
      (costSummary.monthlyExams ?? 0) +
      (costSummary.monthlyMeals ?? 0) +
      (costSummary.monthlyVehicles ?? 0) +
      (costSummary.monthlyInfrastructure ?? 0) +
      (costSummary.monthlyCostItems ?? 0);
    const margin = marginPct / 100;
    const baseWithMargin = margin < 1 ? costsBase / (1 - margin) : costsBase;
    const rounded = roundUpToNice(baseWithMargin);
    if (rounded > 0) {
      updateParams({ salePriceBase: rounded });
    }
  }, [costSummary, costParams, marginPct]);

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
      includedItems: (quote.includedItems && quote.includedItems.length > 0)
        ? quote.includedItems
        : prev.includedItems,
      adjustmentType: (quote as any).adjustmentType ?? "NONE",
      adjustmentFreq: (quote as any).adjustmentFreq ?? null,
      ipcWeight: (quote as any).ipcWeight ?? null,
      imoWeight: (quote as any).imoWeight ?? null,
      insurancePolicyUF: (quote as any).insurancePolicyUF != null ? Number((quote as any).insurancePolicyUF) : null,
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
    fetch("/api/docs/templates?module=crm&category=contrato_servicio")
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
      fetch("/api/crm/contacts").then((r) => r.ok ? r.json() : { success: false }),
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
          contactData.data
            .filter((c: Record<string, string>) => c.accountId === crmContext.accountId)
            .map((c: Record<string, string>) => ({ id: c.id, firstName: c.firstName, lastName: c.lastName, email: c.email }))
        );
      }
      if (dealData.success) {
        setCrmDeals(
          dealData.data
            .filter((d: Record<string, string>) => d.accountId === crmContext.accountId)
            .map((d: Record<string, string>) => ({ id: d.id, title: d.title }))
        );
      }
    }).catch(() => {});
  }, [crmContext.accountId]);

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
      if (quote) {
        setQuote({ ...quote, aiDescription: data.data.description });
      }
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
      if (quote) {
        setQuote({ ...quote, serviceDetail: data.data.serviceDetail });
      }
      toast.success(serviceDetailInstruction.trim() ? "Detalle refinado con AI" : "Detalle de servicio generado con AI");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "No se pudo generar el detalle de servicio");
    } finally {
      setGeneratingServiceDetail(false);
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
          parameters: costParams,
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
    } catch (error) {
      console.error("Error saving financials:", error);
      setFinancialError("No se pudieron guardar los financieros.");
      toast.error("No se pudieron guardar los financieros");
    } finally {
      setSavingFinancials(false);
    }
  };

  const handleStatusChange = async (newStatus: "draft" | "sent") => {
    if (!quote) return;
    setChangingStatus(true);
    try {
      const payload: Record<string, unknown> = { status: newStatus };
      if (
        newStatus === "draft" &&
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
      setStatusChangePending(null);
      toast.success(newStatus === "draft" ? "Cotizacion en borrador. Ya puedes editar." : "Cotizacion marcada como enviada.");
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("No se pudo actualizar el estado.");
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
    setDeleting(true);
    try {
      const response = await fetch(`/api/cpq/quotes/${quoteId}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || "Error");
      }
      toast.success("Cotizacion eliminada");
      router.push("/crm/cotizaciones");
      router.refresh();
    } catch (error) {
      console.error("Error deleting quote:", error);
      toast.error("No se pudo eliminar la cotizacion");
    } finally {
      setDeleting(false);
    }
  };

  /** Flush any pending debounced saves so the backend has the latest data */
  const flushPendingSaves = async () => {
    clearTimeout(financialsAutoSaveTimer.current);
    clearTimeout(quoteFormAutoSaveTimer.current);
    if (initialLoadDone.current && !isLocked) {
      await Promise.all([handleSaveFinancials(), saveQuoteBasics()]);
    }
  };

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      await flushPendingSaves();
      const response = await fetch(`/api/cpq/quotes/${quoteId}/export-pdf`, {
        method: "POST",
      });
      if (!response.ok) {
        const message = await getErrorMessageFromResponse(response, "Error al generar PDF");
        throw new Error(message);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const fromHeader = parseContentDispositionFileName(
        response.headers.get("Content-Disposition"),
      );
      const accountLabel =
        crmAccounts.find((x) => x.id === crmContext.accountId)?.name?.trim() ||
        quoteForm.clientName?.trim() ||
        quote?.clientName?.trim() ||
        "Cliente";
      const installationLabel =
        crmInstallations.find((x) => x.id === crmContext.installationId)?.name?.trim() || "";
      const quoteTitle = quoteForm.name?.trim() || quote?.name?.trim() || null;
      a.download =
        fromHeader ??
        buildCpqQuotePdfFileName({
          clientName: accountLabel,
          installationName: installationLabel,
          quoteName: quoteTitle,
          quoteCode: quote?.code || "cotizacion",
        });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("PDF descargado");
    } catch (error) {
      console.error("Error downloading PDF:", error);
      toast.error(error instanceof Error ? error.message : "No se pudo generar el PDF");
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleDownloadProposalPdf = async () => {
    setDownloadingProposalPdf(true);
    try {
      await flushPendingSaves();
      const response = await fetch(`/api/cpq/quotes/${quoteId}/proposal-pdf`);
      if (!response.ok) {
        const message = await getErrorMessageFromResponse(
          response,
          "Error al generar propuesta técnica"
        );
        throw new Error(message);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const fromHeader = parseContentDispositionFileName(
        response.headers.get("Content-Disposition"),
      );
      const accountLabel =
        crmAccounts.find((x) => x.id === crmContext.accountId)?.name?.trim() ||
        quoteForm.clientName?.trim() ||
        quote?.clientName?.trim() ||
        "Cliente";
      const installationLabel =
        crmInstallations.find((x) => x.id === crmContext.installationId)?.name?.trim() || "";
      const quoteTitle = quoteForm.name?.trim() || quote?.name?.trim() || null;
      a.download =
        fromHeader ??
        buildCpqQuotePdfFileName({
          clientName: accountLabel,
          installationName: installationLabel,
          quoteName: quoteTitle,
          quoteCode: quote?.code || "cotizacion",
        });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Propuesta técnica descargada");
    } catch (error) {
      console.error("Error downloading proposal PDF:", error);
      toast.error(error instanceof Error ? error.message : "No se pudo generar la propuesta técnica");
    } finally {
      setDownloadingProposalPdf(false);
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

    const confirmed = window.confirm(
      "Esta accion reemplazara la dotacion activa de la instalacion con los puestos de esta cotizacion. Continuar?"
    );
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
      const replace = window.confirm(
        `Ya hay ${positions.length} puesto(s).\n\nAceptar = Reemplazar todos\nCancelar = Agregar a los existentes`
      );
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
      const rolesList = (rolesRes?.data ?? []) as { id: string; name: string }[];

      if (!defaultPuesto?.id || !defaultCargo?.id || !defaultRol?.id) {
        toast.error("Faltan configuraciones CPQ (puesto, cargo o rol).");
        setApplyingTemplate(false);
        return;
      }

      let createdCount = 0;
      for (const pos of template.positions) {
        const patternForRol = pos.rolShiftPattern ?? pos.shiftPattern;
        const rolId =
          resolveRolIdFromShiftPattern(patternForRol, rolesList, defaultRol.id) ?? defaultRol.id;
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
            baseSalary: pos.baseSalary,
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
    void refresh();
  };

  const stats = useMemo(() => {
    const totalGuards =
      quote?.totalGuards ??
      positions.reduce((sum, p) => sum + p.numGuards * (p.numPuestos || 1), 0);
    const monthly = quote?.monthlyCost ?? positions.reduce((sum, p) => sum + Number(p.monthlyPositionCost), 0);
    return { totalGuards, monthly };
  }, [positions, quote]);

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
  const additionalLinesTotal = useMemo(
    () => additionalLines.reduce((s, l) => s + Number(l.precio || 0), 0),
    [additionalLines]
  );

  // Sale price calculation (includes additional lines in margin)
  const salePriceMonthly = useMemo(() => {
    if (!costSummary) return 0;
    const margin = marginPct / 100;
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
    return baseWithMargin + (costSummary.monthlyFinancial ?? 0) + (costSummary.monthlyPolicy ?? 0);
  }, [costSummary, marginPct]);

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

  const headerPersistLabel =
    savingQuote || savingFinancials
      ? "Guardando..."
      : quoteDirty
        ? "Cambios sin guardar"
        : lastSavedAt
          ? `Guardado ${formatTime(lastSavedAt)}`
          : "Sin cambios";

  const billingMonthlyTotal = salePriceMonthly + additionalLinesTotal;

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
    <div className="space-y-2 pb-4 lg:pb-4 overflow-x-hidden min-w-0">
      {/* -- Compact header -- */}
      <div className="sticky top-[53px] z-10 bg-background/95 backdrop-blur-xl border-b border-border/40 -mx-5 px-5 py-1.5 mb-1">
      <div className="flex items-start gap-2 min-h-[40px]">
        <Link href="/crm/cotizaciones" className="shrink-0 pt-0.5">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0 min-h-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 pr-1">
            <h1 className="text-base font-bold tracking-tight shrink-0 max-w-[100%] sm:max-w-none truncate">{quote.code}</h1>
            {quote.name && (
              <span className="text-sm font-medium truncate text-foreground/80 min-w-0 basis-full sm:basis-auto sm:max-w-[40%]">
                — {quote.name}
              </span>
            )}
            <Badge
              variant="outline"
              className={cn(
                "text-xs h-6 shrink-0 font-medium whitespace-nowrap w-fit max-lg:basis-full max-lg:mt-0.5",
                quote.status === "sent" && "border-blue-500/30 text-blue-600 dark:text-blue-400",
                quote.status === "draft" && "border-amber-500/30 text-amber-600 dark:text-amber-400",
                quote.status === "approved" && "border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
                quote.status === "rejected" && "border-red-500/30 text-red-600 dark:text-red-400"
              )}
            >
              {quote.status === "sent"
                ? "Enviada"
                : quote.status === "draft"
                  ? "Borrador"
                  : quote.status === "approved"
                    ? "Aprobada"
                    : quote.status === "rejected"
                      ? "Rechazada"
                      : quote.status}
            </Badge>
          </div>
          <span className="text-sm text-muted-foreground truncate block">
            {quote.clientName || "Sin cliente"}
            {crmContext.contactId && (() => {
              const c = crmContacts.find((x) => x.id === crmContext.contactId);
              return c ? ` · ${c.firstName} ${c.lastName}`.trim() : "";
            })()}
          </span>
          {crmContext.accountId ? (
            <div className="flex items-center gap-2 mt-1.5 flex-wrap max-w-full">
              <Label htmlFor="cpq-portal-visible" className="text-sm text-muted-foreground font-normal cursor-pointer shrink-0">
                Visible en portal del cliente
              </Label>
              <Switch
                id="cpq-portal-visible"
                checked={portalListedEffective}
                disabled={portalVisibilitySaving}
                onCheckedChange={(v) => void handlePortalVisibilityChange(v)}
                title={
                  portalListedEffective
                    ? "El prospecto o cliente puede ver esta cotización en su portal"
                    : "Activa para mostrar la cotización en el portal aunque esté en borrador"
                }
              />
              {portalVisibilitySaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" aria-hidden />
              ) : null}
              <span className="text-xs text-muted-foreground/80 leading-tight hidden sm:inline max-w-[220px]">
                {quote.status === "draft"
                  ? "Puedes dejarla visible mientras editas en borrador."
                  : "Desactiva para ocultarla del portal sin cambiar el estado."}
              </span>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-1 shrink-0 pt-0.5">
          <div className="hidden lg:flex items-center gap-1 border-r border-border/60 pr-2 mr-1">
            <Button
              size="sm"
              className="h-7 w-7 p-0 bg-emerald-600 hover:bg-emerald-700 text-white border-0 shadow-sm"
              disabled={
                !quote ||
                (positions.length === 0 && (additionalLines?.length ?? 0) === 0) ||
                quote.status === "sent" ||
                !crmContext.accountId ||
                !crmContext.contactId ||
                !crmContext.dealId
              }
              title="Enviar propuesta (invitación al portal)"
              onClick={() => setPortalProposalOpen(true)}
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
          {/* Desktop: acciones de estado (en móvil van al menú ⋮ para no duplicar el badge de estado) */}
          <div className="hidden lg:flex items-center gap-1">
            {quote.status === "sent" ? (
              <Button size="sm" variant="outline" className="h-7 px-2 text-sm" onClick={() => setStatusChangePending("draft")} disabled={changingStatus}>
                {changingStatus ? "..." : "Marcar borrador"}
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="h-7 px-2 text-sm border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10" onClick={() => setStatusChangePending("sent")} disabled={changingStatus}>
                {changingStatus ? "..." : "Marcar enviada"}
              </Button>
            )}
          </div>
          {/* Overflow menu for secondary actions */}
          <div className="relative">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setOverflowMenuOpen((v) => !v)}>
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
            {overflowMenuOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setOverflowMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-30 min-w-[180px] max-w-[calc(100vw-2rem)] rounded-md border bg-popover p-1 shadow-md">
                  <div className="lg:hidden border-b border-border pb-1 mb-1">
                    <button
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent font-medium"
                      onClick={() => {
                        setOverflowMenuOpen(false);
                        setPortalProposalOpen(true);
                      }}
                      disabled={
                        !quote ||
                        (positions.length === 0 && (additionalLines?.length ?? 0) === 0) ||
                        quote.status === "sent" ||
                        !crmContext.accountId ||
                        !crmContext.contactId ||
                        !crmContext.dealId
                      }
                    >
                      <Send className="h-3.5 w-3.5" /> Enviar propuesta al portal
                    </button>
                    {quote.status === "sent" ? (
                      <button className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent" onClick={() => { setOverflowMenuOpen(false); setStatusChangePending("draft"); }} disabled={changingStatus}>
                        Marcar como borrador
                      </button>
                    ) : (
                      <button className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent" onClick={() => { setOverflowMenuOpen(false); setStatusChangePending("sent"); }} disabled={changingStatus}>
                        Marcar como enviada
                      </button>
                    )}
                  </div>
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
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent font-medium text-teal-400"
                    onClick={() => { setOverflowMenuOpen(false); handleGenerateContract(); }}
                    disabled={generatingContract}
                  >
                    <FileSignature className="h-3.5 w-3.5" /> {generatingContract ? "Generando..." : "Generar contrato"}
                  </button>
                  <button className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent" onClick={() => { setOverflowMenuOpen(false); refresh(); }}>
                    <RefreshCw className="h-3.5 w-3.5" /> Refrescar
                  </button>
                  <div className="my-1 h-px bg-border" />
                  <button className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-destructive hover:bg-accent" onClick={() => { setOverflowMenuOpen(false); setDeleteConfirmOpen(true); }} disabled={deleting || isLocked}>
                    <Trash2 className="h-3.5 w-3.5" /> {deleting ? "Eliminando..." : "Eliminar"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="mt-1.5 pt-1.5 border-t border-border/40 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1.5 min-w-0">
          {!isLocked && (savingQuote || savingFinancials) && (
            <Loader2 className="h-3 w-3 animate-spin shrink-0 text-muted-foreground" aria-hidden />
          )}
          <span className="leading-tight">{headerPersistLabel}</span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0 text-sm tabular-nums">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
            Total / mes
          </span>
          <span className="font-semibold text-foreground">{formatCurrency(billingMonthlyTotal)}</span>
          {ufValue != null && ufValue > 0 && (
            <span className="font-medium text-emerald-600 dark:text-emerald-400">
              {(billingMonthlyTotal / ufValue).toFixed(2)} UF
            </span>
          )}
        </div>
      </div>
      </div>{/* end sticky header */}

      {/* -- Single-column layout: pt-14 reserva espacio para que el header sticky no tape el contenido -- */}
      <div className="pt-14 space-y-2 min-w-0 overflow-x-hidden">
      {/* -- Section: Datos (scroll-mt-14: visible below sticky header when scrolled) -- */}
      <Card className="shadow-sm overflow-visible scroll-mt-14">
        <button type="button" onClick={() => setSecDatos(v => !v)} className="flex items-center justify-between w-full px-4 py-3 hover:bg-muted/10 transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-bold shrink-0">Datos</h2>
            {!secDatos && (
              <span className="text-sm text-muted-foreground truncate">
                {quoteForm.clientName || "Sin cliente"}{crmContext.currency ? ` · ${crmContext.currency}` : ""}
              </span>
            )}
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", secDatos && "rotate-180")} />
        </button>
        {secDatos && (
          <div className="px-4 pb-4">
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
      <Card className="shadow-sm overflow-hidden scroll-mt-14" inert={isLocked ? true : undefined}>
        <button type="button" onClick={() => setSecCondiciones(v => !v)} className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-muted/10 transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-bold shrink-0">Condiciones comerciales</h2>
            {!secCondiciones && (
              <span className="text-sm text-muted-foreground truncate">
                {quoteForm.paymentTerms === "contrafactura" ? "Contrafactura" : quoteForm.paymentTerms === "30_dias" ? "30 días" : "Anticipado"} · {quoteForm.serviceStartDays}d · {quoteForm.contractDuration}m
              </span>
            )}
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", secCondiciones && "rotate-180")} />
        </button>
        {secCondiciones && (
          <div className="px-4 pb-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">Forma de pago</Label>
                <select
                  value={quoteForm.paymentTerms}
                  onChange={(e) => { setQuoteForm(prev => ({ ...prev, paymentTerms: e.target.value })); setQuoteDirty(true); }}
                  disabled={isLocked}
                  className="flex h-8 w-full rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="contrafactura">Contrafactura</option>
                  <option value="30_dias">30 días</option>
                  <option value="anticipado">Pago anticipado</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">Inicio servicios</Label>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min={1}
                    max={90}
                    value={quoteForm.serviceStartDays}
                    onChange={(e) => { setQuoteForm(prev => ({ ...prev, serviceStartDays: Number(e.target.value) || 5 })); setQuoteDirty(true); }}
                    disabled={isLocked}
                    className="h-8 bg-card text-foreground border-border text-xs w-16"
                  />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">días háb.</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">Duración contrato</Label>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    value={quoteForm.contractDuration}
                    onChange={(e) => { setQuoteForm(prev => ({ ...prev, contractDuration: Number(e.target.value) || 12 })); setQuoteDirty(true); }}
                    disabled={isLocked}
                    className="h-8 bg-card text-foreground border-border text-xs w-16"
                  />
                  <span className="text-xs text-muted-foreground">meses</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">Propuesta económica</Label>
                <div className="flex items-center gap-1.5">
                  <select
                    value={proposalTemplateId ?? ""}
                    onChange={(e) => {
                      const val = e.target.value || null;
                      setProposalTemplateId(val);
                      fetch(`/api/cpq/quotes/${quoteId}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ proposalTemplateId: val }),
                      }).catch(() => {});
                    }}
                    disabled={isLocked}
                    className="flex h-8 w-full rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {proposalTemplates
                      .filter(
                        (t) =>
                          !(
                            (t.name || "").toLowerCase().includes("presentación") &&
                            (t.name || "").toLowerCase().includes("empresa")
                          )
                      )
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Contract service fields */}
            <div className="border-t border-border pt-3 mt-3">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Contrato de Servicio</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-sm text-muted-foreground">Tipo de reajuste</Label>
                  <select
                    value={quoteForm.adjustmentType}
                    onChange={(e) => {
                      const type = e.target.value;
                      setQuoteForm(prev => ({
                        ...prev,
                        adjustmentType: type,
                        ...(type === "NONE" ? { adjustmentFreq: null, ipcWeight: null, imoWeight: null } : {}),
                        ...(type === "IPC" || type === "IMO" ? { ipcWeight: null, imoWeight: null } : {}),
                      }));
                      setQuoteDirty(true);
                    }}
                    disabled={isLocked}
                    className="flex h-8 w-full rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="NONE">Sin reajuste</option>
                    <option value="IPC">IPC</option>
                    <option value="IMO">Índice Mano de Obra</option>
                    <option value="POLYNOMIAL">Polinomio mixto</option>
                  </select>
                </div>

                {quoteForm.adjustmentType !== "NONE" && (
                  <div className="space-y-1">
                    <Label className="text-sm text-muted-foreground">Frecuencia</Label>
                    <select
                      value={quoteForm.adjustmentFreq ?? ""}
                      onChange={(e) => { setQuoteForm(prev => ({ ...prev, adjustmentFreq: e.target.value || null })); setQuoteDirty(true); }}
                      disabled={isLocked}
                      className="flex h-8 w-full rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="">Seleccionar</option>
                      <option value="TRIMESTRAL">Trimestral</option>
                      <option value="SEMESTRAL">Semestral</option>
                      <option value="ANUAL">Anual</option>
                    </select>
                  </div>
                )}

                {quoteForm.adjustmentType === "POLYNOMIAL" && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-sm text-muted-foreground">% IPC</Label>
                      <div className="flex items-center gap-1">
                        <Input type="number" min={0} max={100} value={quoteForm.ipcWeight ?? ""}
                          onChange={(e) => { const ipc = Number(e.target.value) || 0; setQuoteForm(prev => ({ ...prev, ipcWeight: ipc, imoWeight: 100 - ipc })); setQuoteDirty(true); }}
                          disabled={isLocked} className="h-8 bg-card text-foreground border-border text-xs w-16" />
                        <span className="text-xs text-muted-foreground">%</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm text-muted-foreground">% IMO</Label>
                      <div className="flex items-center gap-1">
                        <Input type="number" min={0} max={100} value={quoteForm.imoWeight ?? ""}
                          onChange={(e) => { const imo = Number(e.target.value) || 0; setQuoteForm(prev => ({ ...prev, imoWeight: imo, ipcWeight: 100 - imo })); setQuoteDirty(true); }}
                          disabled={isLocked} className="h-8 bg-card text-foreground border-border text-xs w-16" />
                        <span className="text-xs text-muted-foreground">%</span>
                      </div>
                    </div>
                  </>
                )}

                <div className="space-y-1">
                  <Label className="text-sm text-muted-foreground">Días de pago</Label>
                  <div className="flex items-center gap-1">
                    <Input type="number" min={1} max={30} value={quoteForm.paymentDays}
                      onChange={(e) => { setQuoteForm(prev => ({ ...prev, paymentDays: Number(e.target.value) || 5 })); setQuoteDirty(true); }}
                      disabled={isLocked} className="h-8 bg-card text-foreground border-border text-xs w-16" />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">días háb.</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-sm text-muted-foreground">Monto póliza</Label>
                  <div className="flex items-center gap-1">
                    <Input type="number" min={0} step={0.01} value={quoteForm.insurancePolicyUF ?? ""} placeholder="0.00"
                      onChange={(e) => { setQuoteForm(prev => ({ ...prev, insurancePolicyUF: e.target.value ? Number(e.target.value) : null })); setQuoteDirty(true); }}
                      disabled={isLocked} className="h-8 bg-card text-foreground border-border text-xs w-20" />
                    <span className="text-xs text-muted-foreground">UF</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-sm text-muted-foreground">Límite responsabilidad</Label>
                  <div className="flex items-center gap-1">
                    <Input type="number" min={1} max={24} value={quoteForm.liabilityMonths}
                      onChange={(e) => { setQuoteForm(prev => ({ ...prev, liabilityMonths: Number(e.target.value) || 3 })); setQuoteDirty(true); }}
                      disabled={isLocked} className="h-8 bg-card text-foreground border-border text-xs w-16" />
                    <span className="text-xs text-muted-foreground">meses</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-sm text-muted-foreground">Incremento real anual</Label>
                  <div className="flex items-center gap-1">
                    <Input type="number" min={0} max={100} step={1} value={quoteForm.realAnnualIncrement ?? 3}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const n = raw === "" ? 0 : Number(raw);
                        const clamped = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
                        setQuoteForm(prev => ({ ...prev, realAnnualIncrement: clamped }));
                        setQuoteDirty(true);
                      }}
                      disabled={isLocked} className="h-8 bg-card text-foreground border-border text-xs w-16" />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-sm text-muted-foreground">Fecha inicio contrato</Label>
                  <Input type="date" value={quoteForm.contractStartDate ?? ""}
                    onChange={(e) => { setQuoteForm(prev => ({ ...prev, contractStartDate: e.target.value || null })); setQuoteDirty(true); }}
                    disabled={isLocked} className="h-8 bg-card text-foreground border-border text-xs" />
                </div>

                <div className="space-y-1 flex items-end gap-2 pb-0.5">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={quoteForm.hasCCTV}
                      onChange={(e) => { setQuoteForm(prev => ({ ...prev, hasCCTV: e.target.checked })); setQuoteDirty(true); }}
                      disabled={isLocked} className="rounded border-border" />
                    <span className="text-xs text-muted-foreground">Incluye CCTV</span>
                  </label>
                </div>

                {quoteForm.hasCCTV && (
                  <div className="space-y-1">
                    <Label className="text-sm text-muted-foreground">Retención CCTV</Label>
                    <div className="flex items-center gap-1">
                      <Input type="number" min={1} max={365} value={quoteForm.cctvRetentionDays ?? 30}
                        onChange={(e) => { setQuoteForm(prev => ({ ...prev, cctvRetentionDays: Number(e.target.value) || 30 })); setQuoteDirty(true); }}
                        disabled={isLocked} className="h-8 bg-card text-foreground border-border text-xs w-16" />
                      <span className="text-xs text-muted-foreground">días</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* -- Section: Desglose detallado (precio de venta, margen financiero) -- */}
      <Card className="shadow-sm overflow-hidden scroll-mt-14">
        <button type="button" onClick={() => setSecDesglose(v => !v)} className="flex items-center justify-between w-full px-4 py-3 hover:bg-muted/10 transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-bold shrink-0">Desglose</h2>
            {!secDesglose && (
              <span className="text-sm text-muted-foreground truncate inline-flex items-center gap-1.5 max-w-[min(100%,28rem)]">
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
          <div className="px-4 pb-4">
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
      <Card className="shadow-sm overflow-hidden" inert={isLocked ? true : undefined}>
        <div role="button" tabIndex={0} onClick={() => setSecPuestos(v => !v)} className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-muted/10 transition-colors cursor-pointer">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-bold shrink-0">Puestos</h2>
            {!secPuestos && positions.length > 0 && (
              <span className="text-sm text-muted-foreground truncate">
                {positions.length} {positions.length === 1 ? "puesto" : "puestos"} · {stats.totalGuards} guardias —{" "}
                <span className="inline-flex align-middle">
                  <CpqDualCurrencyAmount
                    clp={positions.reduce((sum, p) => sum + Number(p.monthlyPositionCost), 0)}
                    currency={crmContext.currency || "CLP"}
                    ufValue={ufValue}
                    size="xs"
                    inline
                    primaryClassName="text-blue-400 font-semibold"
                  />
                </span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div onClick={(e) => e.stopPropagation()}>
              <CreatePositionModal quoteId={quoteId} onCreated={refresh} disabled={isLocked} />
            </div>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", secPuestos && "rotate-180")} />
          </div>
        </div>
        {secPuestos && (
          <div className="px-4 pb-4">
            {!isLocked && (
              <div className="mb-3">
                <ServiceTemplateButtons
                  compact
                  onSelect={handleApplyServiceTemplate}
                  existingPositionsCount={positions.length}
                />
                {applyingTemplate && (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Creando puestos...
                  </p>
                )}
              </div>
            )}
            {positions.length === 0 ? (
              <EmptyState
                icon={<Users className="h-6 w-6" />}
                title="Sin puestos"
                description="Agrega el primer puesto para comenzar."
                compact
              />
            ) : (
              <div className="space-y-2">
                {positions.map((position) => (
                  <CpqPositionCard
                    key={position.id}
                    position={position}
                    quoteId={quoteId}
                    onUpdated={refresh}
                    readOnly={isLocked}
                    salePriceMonthlyForPosition={positionSalePrices.get(position.id) ?? 0}
                    clientHourlyRate={positionHourlyRates.get(position.id) ?? 0}
                    displayCurrency={crmContext.currency || "CLP"}
                    ufValue={ufValue}
                  />
                ))}
              </div>
            )}
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
          </div>
        )}
      </Card>

      {/* -- Section: Costos -- */}
      <Card className="shadow-sm overflow-hidden" inert={isLocked ? true : undefined}>
        <button type="button" onClick={() => setSecCostos(v => !v)} className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-muted/10 transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-bold shrink-0">Costos adicionales</h2>
            {!secCostos && costSummary && (costSummary.monthlyExtras ?? 0) > 0 && (
              <span className="text-sm text-muted-foreground truncate">
                <span className="inline-flex align-middle">
                  <CpqDualCurrencyAmount
                    clp={costSummary.monthlyExtras ?? 0}
                    currency={crmContext.currency || "CLP"}
                    ufValue={ufValue}
                    size="xs"
                    inline
                    primaryClassName="text-amber-400 font-semibold"
                  />
                </span>
              </span>
            )}
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", secCostos && "rotate-180")} />
        </button>
        {secCostos && (
          <div className="px-4 pb-4">
            <CpqQuoteCosts
              quoteId={quoteId}
              variant="inline"
              showFinancial={false}
              readOnly={isLocked}
              onAdditionalLinesChange={setAdditionalLines}
              onSaved={refresh}
              displayCurrency={crmContext.currency || "CLP"}
              ufValue={ufValue}
            />
          </div>
        )}
      </Card>

      {/* -- Section: Líneas adicionales -- */}
      <Card className="shadow-sm overflow-hidden" inert={isLocked ? true : undefined}>
        <button type="button" onClick={() => setSecLineas(v => !v)} className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-muted/10 transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-bold shrink-0">Líneas adicionales</h2>
            {!secLineas && additionalLines.length > 0 && (
              <span className="text-sm text-muted-foreground truncate">
                {additionalLines.length} {additionalLines.length === 1 ? "línea" : "líneas"} —{" "}
                <span className="inline-flex align-middle">
                  <CpqDualCurrencyAmount
                    clp={additionalLinesTotal}
                    currency={crmContext.currency || "CLP"}
                    ufValue={ufValue}
                    size="xs"
                    inline
                    primaryClassName="text-purple-400 font-semibold"
                  />
                </span>
              </span>
            )}
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", secLineas && "rotate-180")} />
        </button>
        {secLineas && (
          <div className="px-4 pb-4 space-y-2">
            {additionalLines.map((line, idx) => {
              const precioBase = Number(line.precio || 0) * Number(line.cantidad || 1);
              const mPct = Number(line.marginPct || 0);
              const precioVenta = mPct > 0 && mPct < 100 ? precioBase / (1 - mPct / 100) : precioBase;
              const isUnico = line.recurrencia === "unico";
              const precioMensual = isUnico && quoteForm.contractDuration > 0 ? precioVenta / quoteForm.contractDuration : precioVenta;

              return (
                <div key={idx} className="rounded-lg border border-border/50 bg-muted/5 p-2.5">
                  <div className={cn(CPQ_BREAKDOWN_SHELL, "grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 items-start")}>
                    <div className="min-w-0">
                      <Input
                        placeholder="Nombre del servicio/producto"
                        value={line.nombre}
                        onChange={(e) => {
                          const updated = [...additionalLines];
                          updated[idx] = { ...updated[idx], nombre: e.target.value };
                          setAdditionalLines(updated);
                        }}
                        className="h-7 bg-transparent border-none text-[13px] font-semibold p-0 focus-visible:ring-0 placeholder:text-muted-foreground/50"
                        disabled={isLocked}
                      />
                      <Input
                        placeholder="Descripción (opcional)"
                        value={line.descripcion}
                        onChange={(e) => {
                          const updated = [...additionalLines];
                          updated[idx] = { ...updated[idx], descripcion: e.target.value };
                          setAdditionalLines(updated);
                        }}
                        className="h-6 bg-transparent border-none text-sm text-muted-foreground p-0 focus-visible:ring-0 placeholder:text-muted-foreground/40"
                        disabled={isLocked}
                      />
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {/* Tipo badges */}
                        {(["servicio", "arriendo", "producto", "asesoria", "equipamiento"] as const).map((t) => (
                          <button
                            key={t}
                            type="button"
                            disabled={isLocked}
                            onClick={() => {
                              const updated = [...additionalLines];
                              updated[idx] = { ...updated[idx], tipo: t };
                              setAdditionalLines(updated);
                            }}
                            className={cn(
                              "h-5 rounded px-1.5 text-xs font-semibold capitalize transition-colors",
                              (line.tipo || "servicio") === t
                                ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                                : "bg-muted/30 text-muted-foreground border border-transparent hover:bg-muted/50",
                            )}
                          >
                            {t}
                          </button>
                        ))}
                        <div className="w-px h-4 bg-border mx-0.5" />
                        {/* Recurrencia */}
                        {([
                          { value: "mensual", label: "Mensual" },
                          { value: "unico", label: "Único" },
                          { value: "por_evento", label: "Por evento" },
                        ] as const).map((r) => (
                          <button
                            key={r.value}
                            type="button"
                            disabled={isLocked}
                            onClick={() => {
                              const updated = [...additionalLines];
                              updated[idx] = { ...updated[idx], recurrencia: r.value };
                              setAdditionalLines(updated);
                            }}
                            className={cn(
                              "h-5 rounded px-1.5 text-xs font-semibold transition-colors",
                              (line.recurrencia || "mensual") === r.value
                                ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                                : "bg-muted/30 text-muted-foreground border border-transparent hover:bg-muted/50",
                            )}
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="text"
                          inputMode="numeric"
                          placeholder="Precio"
                          value={formatNumber(Number(line.precio || 0), { minDecimals: 0, maxDecimals: 0 })}
                          onChange={(e) => {
                            const updated = [...additionalLines];
                            updated[idx] = { ...updated[idx], precio: parseLocalizedNumber(e.target.value) || 0 };
                            setAdditionalLines(updated);
                          }}
                          className="h-7 w-24 bg-card text-foreground border-border text-xs text-right font-mono"
                          disabled={isLocked}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-400/60 hover:text-red-400 hover:bg-red-500/10"
                          onClick={() => setAdditionalLines((prev) => prev.filter((_, i) => i !== idx))}
                          disabled={isLocked}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">Margen:</span>
                          <Input
                            type="text"
                            inputMode="numeric"
                            placeholder="0"
                            value={line.marginPct ? String(line.marginPct) : ""}
                            onChange={(e) => {
                              const updated = [...additionalLines];
                              const val = parseLocalizedNumber(e.target.value);
                              updated[idx] = { ...updated[idx], marginPct: val || null };
                              setAdditionalLines(updated);
                            }}
                            className="h-6 w-12 bg-card text-foreground border-border text-xs text-right font-mono px-1"
                            disabled={isLocked}
                          />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[13px] font-bold tabular-nums">
                          {formatCurrency(precioMensual)}
                          <span className="text-xs text-muted-foreground font-normal">/mes</span>
                        </span>
                        {isUnico && (
                          <div className="text-xs text-muted-foreground">
                            Inv: {formatCurrency(precioVenta)} ÷ {quoteForm.contractDuration}m
                          </div>
                        )}
                        {mPct > 0 && (
                          <div className="text-xs text-emerald-400">
                            Venta: {formatCurrency(precioVenta)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {!isLocked && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                  onClick={() =>
                    setAdditionalLines((prev) => [
                      ...prev,
                      { nombre: "", descripcion: "", precio: 0, orden: prev.length, tipo: "servicio", recurrencia: "mensual", cantidad: 1, marginPct: null },
                    ])
                  }
                >
                  <Plus className="h-3.5 w-3.5" /> Agregar línea
                </Button>
                {additionalLines.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                    disabled={savingFinancials}
                    onClick={() => {
                      clearTimeout(financialsAutoSaveTimer.current);
                      handleSaveFinancials();
                    }}
                  >
                    {savingFinancials ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Guardar
                  </Button>
                )}
              </div>
            )}
            {additionalLines.length > 0 && (
              <div className={cn(CPQ_BREAKDOWN_SHELL, CPQ_BREAKDOWN_ROW, "pt-1 border-t border-purple-500/20 text-xs")}>
                <span className="text-sm font-medium text-purple-300 break-words min-w-0">Total líneas adicionales</span>
                <span className={cpqBreakdownAmount("text-sm font-bold text-purple-300")}>
                  {formatCurrency(additionalLinesTotal)}
                </span>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* -- Section: Financials -- */}
      <Card className="shadow-sm overflow-hidden" inert={isLocked ? true : undefined}>
        <button type="button" onClick={() => setSecFinancieros(v => !v)} className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-muted/10 transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-bold shrink-0">Gastos financieros</h2>
            {!secFinancieros && costSummary && ((costSummary.monthlyFinancial ?? 0) + (costSummary.monthlyPolicy ?? 0)) > 0 && (
              <span className="text-sm text-muted-foreground truncate">
                <span className="font-mono font-semibold text-orange-400">{formatCurrency((costSummary.monthlyFinancial ?? 0) + (costSummary.monthlyPolicy ?? 0))}</span>
              </span>
            )}
            {savingFinancials && <span className="text-xs text-muted-foreground">Guardando...</span>}
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", secFinancieros && "rotate-180")} />
        </button>
        {secFinancieros && (
          <div className="px-4 pb-4 space-y-2">

          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
            {/* Costo financiero */}
            <div className="space-y-1.5 rounded-md border border-border/40 bg-muted/10 p-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm font-semibold">Financiero</span>
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium transition-colors",
                    costParams?.financialEnabled
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                      : "bg-muted/30 text-muted-foreground"
                  )}
                  onClick={() => updateParams({ financialEnabled: !costParams?.financialEnabled })}
                  aria-pressed={costParams?.financialEnabled}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", costParams?.financialEnabled ? "bg-emerald-500" : "bg-muted-foreground")} />
                  {costParams?.financialEnabled ? "On" : "Off"}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <Label className="text-xs text-muted-foreground">Base venta</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={getDecimalValue("salePriceBase", salePriceBase, 0, true)}
                    onChange={(e) => setDecimalValue("salePriceBase", e.target.value)}
                    onBlur={() => {
                      const raw = decimalDrafts.salePriceBase;
                      if (raw === undefined) return;
                      const parsed = raw.trim() ? parseLocalizedNumber(raw) : 0;
                      updateParams({ salePriceBase: Math.max(0, parsed), financialEnabled: true });
                      clearDecimalValue("salePriceBase");
                    }}
                    className="h-7 text-xs bg-card text-foreground border-border"
                    placeholder="4.000.000"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Tasa %</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={getDecimalValue("financialRatePct", costParams?.financialRatePct ?? 2.5, 2, true)}
                    onChange={(e) => setDecimalValue("financialRatePct", e.target.value)}
                    onBlur={() => {
                      const raw = decimalDrafts.financialRatePct;
                      if (raw === undefined) return;
                      const parsed = raw.trim() ? parseLocalizedNumber(raw) : 2.5;
                      updateParams({ financialRatePct: parsed, financialEnabled: true });
                      clearDecimalValue("financialRatePct");
                    }}
                    className="h-7 text-xs bg-card text-foreground border-border"
                    placeholder="2,5"
                  />
                </div>
              </div>
              {salePriceBase > 0 && (
                <div className="text-xs text-emerald-700 dark:text-emerald-400">
                  = {formatCurrency(salePriceBase * ((costParams?.financialRatePct ?? 2.5) / 100))}/mes
                </div>
              )}
            </div>

            {/* Poliza */}
            <div className="space-y-1.5 rounded-md border border-border/40 bg-muted/10 p-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm font-semibold">Poliza</span>
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium transition-colors",
                    policyEnabled
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                      : "bg-muted/30 text-muted-foreground"
                  )}
                  onClick={() => updateParams({ policyEnabled: !policyEnabled, financialEnabled: true })}
                  aria-pressed={policyEnabled}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", policyEnabled ? "bg-emerald-500" : "bg-muted-foreground")} />
                  {policyEnabled ? "On" : "Off"}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <div>
                  <Label className="text-xs text-muted-foreground">Meses</Label>
                  <Input
                    type="number"
                    value={policyContractMonths}
                    onChange={(e) =>
                      updateParams({
                        policyContractMonths: parseLocalizedNumber(e.target.value),
                        financialEnabled: true,
                      })
                    }
                    className="h-7 text-xs bg-card text-foreground border-border"
                    placeholder="12"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">% Poliza</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={getDecimalValue("policyContractPct", policyContractPct, 2)}
                    onChange={(e) => setDecimalValue("policyContractPct", e.target.value)}
                    onBlur={() => {
                      const raw = decimalDrafts.policyContractPct;
                      if (raw === undefined) return;
                      const parsed = raw.trim() ? parseLocalizedNumber(raw) : 20;
                      updateParams({ policyContractPct: parsed, financialEnabled: true });
                      clearDecimalValue("policyContractPct");
                    }}
                    className="h-7 text-xs bg-card text-foreground border-border"
                    placeholder="20"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Tasa %</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={getDecimalValue("policyRatePct", costParams?.policyRatePct ?? 2.5, 2, true)}
                    onChange={(e) => setDecimalValue("policyRatePct", e.target.value)}
                    onBlur={() => {
                      const raw = decimalDrafts.policyRatePct;
                      if (raw === undefined) return;
                      const parsed = raw.trim() ? parseLocalizedNumber(raw) : 2.5;
                      updateParams({ policyRatePct: parsed, financialEnabled: true });
                      clearDecimalValue("policyRatePct");
                    }}
                    className="h-7 text-xs bg-card text-foreground border-border"
                    placeholder="2,5"
                  />
                </div>
              </div>
              {policyEnabled && salePriceBase > 0 && (
                <div className="text-xs text-emerald-700 dark:text-emerald-400">
                  = {formatCurrency(
                    (salePriceBase * policyContractMonths * (policyContractPct / 100) * ((costParams?.policyRatePct ?? 2.5) / 100)) / 12
                  )}/mes
                </div>
              )}
            </div>
          </div>

          {financialError && (
            <div className="text-sm text-red-400">{financialError}</div>
          )}
          </div>
        )}
      </Card>

      {/* -- Section: Margen -- */}
      <Card className="shadow-sm overflow-hidden" inert={isLocked ? true : undefined}>
        <button type="button" onClick={() => setSecMargen(v => !v)} className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-muted/10 transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-bold shrink-0">Margen de venta</h2>
            {!secMargen && (
              <span className="text-sm text-muted-foreground truncate">
                <span className={cn("font-semibold", marginPct >= 15 ? "text-emerald-400" : marginPct >= 10 ? "text-amber-400" : "text-red-400")}>{Number(marginPct || 0).toFixed(1)}%</span>
                {marginAmount > 0 && <> — <span className="font-mono font-semibold text-emerald-400">{formatCurrency(marginAmount)}</span></>}
              </span>
            )}
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", secMargen && "rotate-180")} />
        </button>
        {secMargen && (
          <div className="px-4 pb-4">
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
      <Card className="shadow-sm overflow-hidden scroll-mt-14" inert={isLocked ? true : undefined}>
        <button type="button" onClick={() => setSecAiContent(v => !v)} className="flex items-center justify-between w-full px-4 py-3 hover:bg-muted/10 transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-4 w-4 text-purple-400 shrink-0" />
            <h2 className="text-sm font-bold shrink-0">Contenido AI</h2>
            {!secAiContent && (
              <span className="text-sm text-muted-foreground truncate">
                {quote.aiDescription ? "Descripción generada" : "Sin descripción"}
              </span>
            )}
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", secAiContent && "rotate-180")} />
        </button>
        {secAiContent && (
          <div className="px-4 pb-4 space-y-3">
            <div className="inline-flex rounded-md border border-border overflow-hidden">
              <button
                type="button"
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors",
                  docAiTab === "description"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent/50",
                )}
                onClick={() => setDocAiTab("description")}
              >
                Descripción AI
              </button>
              <button
                type="button"
                className={cn(
                  "px-3 py-1.5 text-xs font-medium border-l border-border transition-colors",
                  docAiTab === "service"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent/50",
                )}
                onClick={() => setDocAiTab("service")}
              >
                Detalle servicio
              </button>
            </div>

            {docAiTab === "description" && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Input
                    value={aiCustomInstruction}
                    onChange={(e) => setAiCustomInstruction(e.target.value)}
                    placeholder="Instrucción AI (opcional)"
                    className="h-8 text-xs flex-1"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1 text-xs shrink-0"
                    onClick={generateAiDescription}
                    disabled={generatingAi}
                  >
                    {generatingAi ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    {generatingAi ? "..." : "Generar"}
                  </Button>
                </div>
                <textarea
                  value={quote.aiDescription ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setQuote({ ...quote, aiDescription: v });
                    fetch(`/api/cpq/quotes/${quoteId}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ aiDescription: v }),
                    }).catch(() => {});
                  }}
                  placeholder="Clic en 'Generar' para crear una descripción profesional..."
                  className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-xs resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  rows={5}
                />
              </div>
            )}

            {docAiTab === "service" && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Input
                    value={serviceDetailInstruction}
                    onChange={(e) => setServiceDetailInstruction(e.target.value)}
                    placeholder="Instrucción AI (opcional)"
                    className="h-8 text-xs flex-1"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1 text-xs shrink-0"
                    onClick={generateServiceDetail}
                    disabled={generatingServiceDetail}
                  >
                    {generatingServiceDetail ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    {generatingServiceDetail ? "..." : "Generar"}
                  </Button>
                </div>
                <textarea
                  value={quote.serviceDetail ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setQuote({ ...quote, serviceDetail: v });
                    fetch(`/api/cpq/quotes/${quoteId}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ serviceDetail: v }),
                    }).catch(() => {});
                  }}
                  placeholder="Clic en 'Generar' para detalle de servicios..."
                  className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-xs resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  rows={5}
                />
              </div>
            )}
          </div>
        )}
      </Card>

      {/* -- Section: Incluye (items incluidos en la cotización) -- */}
      <QuoteIncludesEditor quoteId={quoteId} isLocked={isLocked} />

      {/* -- Section: Preview PDF (estilo Leads — Cotización + Presentación) -- */}
      <Card className="shadow-sm overflow-hidden scroll-mt-14">
        <div className="px-3 py-2 bg-muted/20 border-b border-border/40 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 mr-auto">
            <button
              type="button"
              onClick={() => { setPdfPreviewMode("cotizacion"); setPdfPreviewUrl(null); }}
              className={cn(
                "h-7 rounded-md px-2.5 text-xs font-semibold border transition-colors flex items-center gap-1",
                pdfPreviewMode === "cotizacion"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                  : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted"
              )}
            >
              <RefreshCw className="h-3 w-3" />
              Cotización
            </button>
            <button
              type="button"
              onClick={() => { setPdfPreviewMode("presentacion"); setPdfPreviewUrl(null); }}
              className={cn(
                "h-7 rounded-md px-2.5 text-xs font-semibold border transition-colors flex items-center gap-1",
                pdfPreviewMode === "presentacion"
                  ? "border-blue-500/40 bg-blue-500/10 text-blue-400"
                  : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted"
              )}
            >
              <FileText className="h-3 w-3" />
              Presentación
            </button>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {pdfPreviewMode === "cotizacion" && [
              { slug: "standard", label: "Estándar" },
              { slug: "detailed", label: "Detallado" },
              { slug: "tender", label: "Licitación" },
            ].map((t) => (
              <button
                key={t.slug}
                type="button"
                onClick={() => { setPdfTemplateSlug(t.slug); setPdfPreviewUrl(null); }}
                className={cn(
                  "h-6 rounded px-2 text-xs font-medium border transition-colors",
                  pdfTemplateSlug === t.slug
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted"
                )}
              >
                {t.label}
              </button>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-sm px-2 ml-1"
              disabled={pdfPreviewLoading}
              onClick={async () => {
                setPdfPreviewLoading(true);
                try {
                  const bust = Date.now();
                  const url = pdfPreviewMode === "presentacion"
                    ? `/api/cpq/quotes/${quoteId}/proposal-pdf?t=${bust}`
                    : `/api/cpq/quotes/${quoteId}/export-pdf?templateSlug=${encodeURIComponent(pdfTemplateSlug)}&t=${bust}`;
                  // Use direct URL so the browser's PDF viewer shows the
                  // filename from Content-Disposition instead of a blob UUID.
                  if (pdfPreviewUrl && pdfPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(pdfPreviewUrl);
                  setPdfPreviewUrl(url);
                } catch (err) {
                  console.error("[CPQ PDF Preview]", err);
                  toast.error(err instanceof Error ? err.message : "Error al generar el PDF");
                } finally {
                  setPdfPreviewLoading(false);
                }
              }}
            >
              {pdfPreviewLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              <span className="ml-1">Generar PDF</span>
            </Button>
          </div>
        </div>
        {pdfPreviewUrl ? (
          <iframe
            src={pdfPreviewUrl}
            className="w-full h-[500px] sm:h-[700px] bg-white"
            title={pdfPreviewMode === "presentacion" ? "Preview presentación PDF" : "Preview cotización PDF"}
          />
        ) : (
          <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
            {pdfPreviewMode === "presentacion"
              ? "Click \"Generar PDF\" para ver la presentación técnica"
              : "Click \"Generar PDF\" para ver la vista previa de la cotización"}
          </div>
        )}
      </Card>

      {/* -- Section: Adjuntos para enviar con el mail -- */}
      <QuoteAttachmentsSection quoteId={quoteId} isLocked={isLocked} />

      {/* -- Section: Auditoría (registro de todos los cambios) -- */}
      <Card className="shadow-sm overflow-visible">
        <div className="flex items-center justify-between w-full px-4 py-3">
          <button type="button" onClick={() => setSecAuditoria((v) => !v)} className="flex-1 flex items-center gap-2 min-w-0 text-left hover:bg-muted/10 transition-colors -m-1 p-1 rounded">
            <h2 className="text-sm font-bold shrink-0">Auditoría</h2>
            {!secAuditoria && activityEvents.length > 0 && (
              <span className="text-sm text-muted-foreground truncate">
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
          <div className="px-4 pb-4">
            <p className="text-sm text-muted-foreground mb-3">
              Registro de todos los cambios: quién, cuándo y qué se modificó.
            </p>
            <CrmActivityTimeline events={activityEvents} />
          </div>
        )}
      </Card>

      </div>{/* end single-column layout */}

      {/* Mobile spacer for fixed bottom bar */}
      <div className="h-14 lg:hidden" />

      {/* -- Mobile bottom bar (replaces wizard nav) -- */}
      <MobileBottomBar
        className="lg:hidden"
        salePriceMonthly={salePriceMonthly}
        additionalLinesTotal={additionalLinesTotal}
        marginPct={marginPct}
        ufValue={ufValue}
        displayCurrency={crmContext.currency || "CLP"}
        totalGuards={stats.totalGuards}
        portalButton={
          <Button
            className="w-full h-11 gap-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={
              !quote ||
              (positions.length === 0 && (additionalLines?.length ?? 0) === 0) ||
              quote.status === "sent" ||
              !crmContext.accountId ||
              !crmContext.contactId ||
              !crmContext.dealId
            }
            onClick={() => setPortalProposalOpen(true)}
          >
            <Send className="h-4 w-4" />
            Enviar
          </Button>
        }
      />

      {crmContext.dealId &&
        crmContext.contactId &&
        (() => {
          const qc = crmContacts.find((x) => x.id === crmContext.contactId);
          if (!qc?.email) return null;
          return (
            <SendPortalProposalModal
              key="portal-proposal"
              open={portalProposalOpen}
              onOpenChange={setPortalProposalOpen}
              quoteId={quoteId}
              quoteCode={quote?.code ?? ""}
              defaultEmailSubject={portalInviteSubjectDefault}
              dealId={crmContext.dealId}
              quoteContact={{
                id: qc.id,
                firstName: qc.firstName,
                lastName: qc.lastName,
                email: qc.email,
                roleTitle: null,
              }}
              disabled={
                !quote ||
                (positions.length === 0 && (additionalLines?.length ?? 0) === 0) ||
                quote.status === "sent" ||
                !crmContext.accountId ||
                !crmContext.dealId
              }
              onBeforeSend={flushPendingSaves}
              onComplete={handlePortalProposalComplete}
            />
          );
        })()}

      {/* Modal de WhatsApp — se muestra tras envio exitoso cuando usuario eligio enviar + WhatsApp */}
      <Dialog open={whatsappModalOpen} onOpenChange={setWhatsappModalOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-green-400" />
              ¡Enviado! Ahora por WhatsApp
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              Email enviado a <strong className="text-foreground">{whatsappSentTo}</strong>. Haz clic para enviarle el mismo mensaje por WhatsApp.
            </p>
            <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 space-y-1">
              <p className="text-xs font-semibold text-green-400 uppercase tracking-wide">El mensaje incluye</p>
              <p className="text-xs text-muted-foreground">🔑 Email y PIN de acceso al portal</p>
              <p className="text-xs text-muted-foreground">🔗 Link al portal y a la propuesta técnica</p>
              <p className="text-xs text-muted-foreground">📋 Beneficios del portal explicados</p>
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white h-11"
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
            googleCalendarUrl: data.googleCalendarUrl,
          });
          setVisitaTecnicaWaModalOpen(true);
          refresh();
        }}
      />

      {/* ── Modal WhatsApp + Google Calendar post visita técnica ── */}
      <Dialog open={visitaTecnicaWaModalOpen} onOpenChange={setVisitaTecnicaWaModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-green-400" />
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

              {/* Google Calendar */}
              {visitaTecnicaWaData.googleCalendarUrl && (
                <Button
                  className="w-full gap-2"
                  variant="outline"
                  onClick={() => {
                    window.open(visitaTecnicaWaData.googleCalendarUrl!, "_blank");
                  }}
                >
                  <CalendarDays className="h-4 w-4 text-blue-400" />
                  Agregar a Google Calendar
                </Button>
              )}
              {(() => {
                const d = visitaTecnicaWaData;
                const fecha = new Date(d.scheduledAt);
                const fechaStr = fecha.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });
                const horaStr = `${String(fecha.getHours()).padStart(2, "0")}:${String(fecha.getMinutes()).padStart(2, "0")}`;
                const lines: string[] = [
                  `Hola ${d.supervisorName}, se te asignó una visita técnica`,
                  "",
                  `${fechaStr} a las ${horaStr}`,
                ];
                if (d.installationName) lines.push("", d.installationName);
                const dir = d.installationAddress ?? "";
                if (dir) {
                  const mapsLink = d.mapsUrl ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dir)}`;
                  lines.push(mapsLink);
                }
                if (d.contactName || d.contactPhone) {
                  lines.push("");
                  if (d.contactName) lines.push(`Contacto: ${d.contactName}`);
                  if (d.contactPhone) lines.push(d.contactPhone);
                }
                if (d.puestosDetail && d.puestosDetail.length > 0) {
                  lines.push("", "Dotación solicitada:");
                  d.puestosDetail.forEach((p) => {
                    const horario = [p.startTime, p.endTime].filter(Boolean).join("–") || "";
                    const detalle = `${p.name} — ${p.numGuards} guardia${p.numGuards !== 1 ? "s" : ""}${horario ? ` · ${horario}` : ""}`;
                    lines.push(`- ${detalle}`);
                  });
                }
                if (d.quoteCode) lines.push("", `Cotización: ${d.quoteCode}`);
                lines.push("", "Revisa los detalles en tu portal de supervisor.");
                const msg = lines.join("\n");
                const encoded = encodeURIComponent(msg);
                return (
                  <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 space-y-2">
                    <p className="text-xs font-semibold text-green-400 uppercase tracking-wide">Mensaje prellenado</p>
                    <div className="max-h-[280px] overflow-y-auto">
                      <p className="text-sm text-muted-foreground whitespace-pre-line">{msg}</p>
                    </div>
                    <div className="flex flex-col gap-2 pt-2">
                      <Button
                        className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => {
                          window.open(`https://wa.me/?text=${encoded}`, "_blank");
                          setVisitaTecnicaWaModalOpen(false);
                        }}
                      >
                        <MessageCircle className="h-4 w-4" />
                        Elegir grupo / contacto en WhatsApp
                      </Button>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" className="w-full text-muted-foreground text-xs" onClick={() => setVisitaTecnicaWaModalOpen(false)}>
              Omitir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmacion Volver a borrador */}
      <Dialog open={statusChangePending === "draft"} onOpenChange={(v) => !v && setStatusChangePending(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Volver a borrador</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Volver esta cotizacion a borrador? Podras editar los valores nuevamente. La cotización seguirá visible en el portal del cliente (puedes desactivarlo con el interruptor &quot;Visible en portal del cliente&quot;). Para marcarla como enviada otra vez, usa &quot;Marcar como enviada&quot;.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusChangePending(null)} disabled={changingStatus}>
              Cancelar
            </Button>
            <Button onClick={() => void handleStatusChange("draft")} disabled={changingStatus}>
              {changingStatus ? "Guardando..." : "Volver a borrador"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmacion Marcar como enviada */}
      <Dialog open={statusChangePending === "sent"} onOpenChange={(v) => !v && setStatusChangePending(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Marcar como enviada</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Marcar esta cotizacion como enviada? Una vez enviada, no podras modificar nada hasta que la vuelvas a borrador.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusChangePending(null)} disabled={changingStatus}>
              Cancelar
            </Button>
            <Button onClick={() => void handleStatusChange("sent")} disabled={changingStatus}>
              {changingStatus ? "Guardando..." : "Marcar como enviada"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Eliminar cotizacion"
        description="La cotizacion sera eliminada permanentemente. Esta accion no se puede deshacer."
        onConfirm={handleDelete}
      />

    </div>
  );
}
