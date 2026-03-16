/**
 * Detalle de cotización CPQ
 */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/opai/EmptyState";
import { CreatePositionModal } from "@/components/cpq/CreatePositionModal";
import { CpqPositionCard } from "@/components/cpq/CpqPositionCard";
import { CpqQuoteCosts } from "@/components/cpq/CpqQuoteCosts";
import { SendCpqQuoteModal } from "@/components/cpq/SendCpqQuoteModal";
import { SendPdfEmailModal } from "@/components/cpq/SendPdfEmailModal";
import { formatCurrency } from "@/components/cpq/utils";
import { cn, formatNumber, parseLocalizedNumber } from "@/lib/utils";
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
import { ArrowLeft, ChevronDown, Copy, RefreshCw, Users, MoreVertical, Trash2, Download, Loader2, Building2, Plus, MessageCircle, Eye, Shield, Mail, Send } from "lucide-react";
import { DatosSection } from "@/components/cpq/DatosSection";
import MarginSection from "@/components/cpq/MarginSection";
import { QuoteAttachmentsSection } from "@/components/cpq/QuoteAttachmentsSection";
import { FinancialPanel } from "@/components/cpq/FinancialPanel";
import { MobileBottomBar } from "@/components/cpq/MobileBottomBar";
import { FollowUpDecisionModal, type FollowUpDecision } from "@/components/cpq/FollowUpDecisionModal";

interface CpqQuoteDetailProps {
  quoteId: string;
  currentUserId?: string;
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

export function CpqQuoteDetail({ quoteId, currentUserId }: CpqQuoteDetailProps) {
  const router = useRouter();
  const [quote, setQuote] = useState<CpqQuote | null>(null);
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
  const [statusChangePending, setStatusChangePending] = useState<"draft" | "sent" | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [sendingDotacion, setSendingDotacion] = useState(false);
  const [sendingPortal, setSendingPortal] = useState(false);
  const [portalFollowUpModalOpen, setPortalFollowUpModalOpen] = useState(false);
  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false);
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  const [whatsappSentTo, setWhatsappSentTo] = useState<string>("");
  const [portalEmailCc, setPortalEmailCc] = useState("");
  const [portalEmailBcc, setPortalEmailBcc] = useState("");
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
  });
  const [quoteDirty, setQuoteDirty] = useState(false);
  const [savingQuote, setSavingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // CRM context
  const [crmAccounts, setCrmAccounts] = useState<{ id: string; name: string }[]>([]);
  const [crmInstallations, setCrmInstallations] = useState<CrmInstallationOption[]>([]);
  const [crmContacts, setCrmContacts] = useState<{ id: string; firstName: string; lastName: string; email?: string | null }[]>([]);
  const [crmDeals, setCrmDeals] = useState<{ id: string; title: string }[]>([]);
  const [crmContext, setCrmContext] = useState({
    accountId: "" as string,
    installationId: "" as string,
    contactId: "" as string,
    dealId: "" as string,
    currency: "CLP" as string,
  });
  const [proposalTemplates, setProposalTemplates] = useState<{ id: string; name: string; slug: string; description?: string }[]>([]);
  const [proposalTemplateId, setProposalTemplateId] = useState<string | null>(null);
  const [pdfDownloading, setPdfDownloading] = useState(false);
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
  const [secDatos, setSecDatos] = useState(true);
  const [secPuestos, setSecPuestos] = useState(true);
  const [secCostos, setSecCostos] = useState(true);
  const [secLineas, setSecLineas] = useState(true);
  const [secFinancieros, setSecFinancieros] = useState(true);
  const [secCondiciones, setSecCondiciones] = useState(true);
  const [secMargen, setSecMargen] = useState(true);
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
      if (!quoteRes.ok || !costsRes.ok) {
        console.error("CPQ fetch error", quoteRes.status, costsRes.status);
        return;
      }
      const quoteData = await quoteRes.json();
      const costsData = await costsRes.json();
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
  }, [quoteForm.name, quoteForm.validUntil, quoteForm.notes, quoteForm.paymentTerms, quoteForm.serviceStartDays, quoteForm.contractDuration]);

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

  useEffect(() => {
    if (!quote) return;
    setQuoteForm((prev) => ({
      name: quote.name || "",
      clientName: quote.clientName || "",
      validUntil: formatDateInput(quote.validUntil),
      notes: quote.notes || "",
      status: quote.status,
      paymentTerms: quote.paymentTerms || "contrafactura",
      serviceStartDays: quote.serviceStartDays ?? 5,
      contractDuration: quote.contractDuration ?? 12,
      includedItems: (quote.includedItems && quote.includedItems.length > 0)
        ? quote.includedItems
        : prev.includedItems,
    }));
    setCrmContext({
      accountId: quote.accountId ?? "",
      installationId: quote.installationId ?? "",
      contactId: quote.contactId ?? "",
      dealId: quote.dealId ?? "",
      currency: quote.currency ?? "CLP",
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
          if (d.data.contactEmail && !portalEmailCc) {
            setPortalEmailCc(d.data.contactEmail);
          }
        }
      })
      .catch(() => {});
  }, []);

  // Load CRM accounts on mount
  useEffect(() => {
    fetch("/api/crm/accounts")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.success) setCrmAccounts(d.data.map((a: Record<string, string>) => ({ id: a.id, name: a.name }))); })
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
      const res = await fetch(`/api/cpq/quotes/${quoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
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

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const response = await fetch(`/api/cpq/quotes/${quoteId}/export-pdf`, {
        method: "POST",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Error al generar PDF");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${quote?.code || "cotizacion"}-propuesta.pdf`;
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

  const handleSendPortal = () => {
    if (!quote || !crmContext.accountId || !crmContext.contactId || !crmContext.dealId) {
      toast.error("Asigna cuenta, contacto y negocio antes de enviar por portal");
      return;
    }
    setPortalFollowUpModalOpen(true);
  };

  const handleSendPortalConfirmed = async (decision: FollowUpDecision) => {
    setPortalFollowUpModalOpen(false);
    setSendingPortal(true);

    // Capture sendWhatsApp intent BEFORE any async — must be in same user gesture tick
    const wantsWhatsApp = decision.sendWhatsApp === true;

    try {
      const response = await fetch(`/api/cpq/quotes/${quoteId}/send-portal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          followUp: {
            include: decision.includeFollowUp,
            targetStageId: decision.targetStageId,
          },
          ccEmails: portalEmailCc.trim() ? [portalEmailCc.trim()] : [],
          bccEmails: portalEmailBcc.trim() ? [portalEmailBcc.trim()] : [],
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo enviar por portal");
      }

      toast.success(
        `Invitacion enviada a ${payload.data.sentTo}. ${payload.data.pinGenerated ? "Se genero PIN de acceso." : "PIN existente."}`
      );

      // Build wa.me URL in the browser so encodeURIComponent preserves emojis correctly
      if (wantsWhatsApp && payload.data.whatsappMessage) {
        const phone = payload.data.whatsappPhone ?? "";
        const encoded = encodeURIComponent(payload.data.whatsappMessage);
        const waUrl = phone
          ? `https://wa.me/${phone}?text=${encoded}`
          : `https://wa.me/?text=${encoded}`;
        setWhatsappUrl(waUrl);
        setWhatsappSentTo(payload.data.sentTo);
        setWhatsappModalOpen(true);
      }

      refresh();
    } catch (error) {
      console.error("Error sending via portal:", error);
      toast.error(
        error instanceof Error ? error.message : "No se pudo enviar por portal"
      );
    } finally {
      setSendingPortal(false);
    }
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
    const normalizeUnit = (value: number, unit?: string | null) => {
      if (!unit) return value;
      const n = unit.toLowerCase();
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

  const saveLabel = savingQuote
    ? "Guardando..."
    : quoteDirty
    ? "Cambios sin guardar"
    : lastSavedAt
    ? `Guardado ${formatTime(lastSavedAt)}`
    : "Sin cambios";

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
      <div className="flex items-center gap-2 min-h-[40px]">
        <Link href="/crm/cotizaciones">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-base font-bold tracking-tight shrink-0">{quote.code}</h1>
            {quote.name && <span className="text-sm font-medium truncate text-foreground/80 min-w-0">— {quote.name}</span>}
            <Badge variant="outline" className="text-[10px] h-5 shrink-0">
              {quote.status}
            </Badge>
          </div>
          <span className="text-[11px] text-muted-foreground truncate block">
            {quote.clientName || "Sin cliente"}
            {crmContext.contactId && (() => {
              const c = crmContacts.find((x) => x.id === crmContext.contactId);
              return c ? ` · ${c.firstName} ${c.lastName}`.trim() : "";
            })()}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* Action buttons: Enviar por Portal, Enviar PDF, Enviar cotización (desktop) */}
          <div className="hidden lg:flex items-center gap-1 border-r border-border/60 pr-2 mr-1">
            <Button
              size="sm"
              className="h-7 px-2 text-[11px] gap-1.5 bg-teal-600 hover:bg-teal-700 text-white"
              disabled={
                !quote ||
                (positions.length === 0 && (additionalLines?.length ?? 0) === 0) ||
                quote.status === "sent" ||
                !crmContext.accountId ||
                !crmContext.contactId ||
                !crmContext.dealId ||
                sendingPortal
              }
              onClick={handleSendPortal}
            >
              {sendingPortal ? <Loader2 className="h-3 w-3 animate-spin" /> : <Shield className="h-3 w-3" />}
              {sendingPortal ? "Enviando..." : "Portal"}
            </Button>
            <SendPdfEmailModal
              quoteId={quoteId}
              quoteCode={quote.code}
              contactEmail={crmContext.contactId ? crmContacts.find((x) => x.id === crmContext.contactId)?.email ?? undefined : undefined}
              contactName={crmContext.contactId ? (() => { const c = crmContacts.find((x) => x.id === crmContext.contactId); return c ? `${c.firstName} ${c.lastName}`.trim() : undefined; })() : undefined}
              companyName={quote.clientName || undefined}
              disabled={!crmContext.contactId || !crmContacts.find((x) => x.id === crmContext.contactId)?.email}
              dealId={crmContext.dealId || undefined}
              triggerClassName="h-7 px-2 text-[11px] gap-1.5 shrink-0"
            />
            <SendCpqQuoteModal
              quoteId={quoteId}
              quoteCode={quote.code}
              clientName={quote.clientName || undefined}
              disabled={!quote || (positions.length === 0 && (additionalLines?.length ?? 0) === 0) || quote.status === "sent"}
              hasAccount={!!crmContext.accountId}
              hasContact={!!crmContext.contactId}
              hasDeal={!!crmContext.dealId}
              dealId={crmContext.dealId || undefined}
              contactName={crmContext.contactId ? (() => { const c = crmContacts.find((x) => x.id === crmContext.contactId); return c ? `${c.firstName} ${c.lastName}`.trim() : undefined; })() : undefined}
              contactEmail={crmContext.contactId ? crmContacts.find((x) => x.id === crmContext.contactId)?.email ?? undefined : undefined}
              triggerClassName="h-7 px-2 text-[11px] gap-1.5 shrink-0"
            />
          </div>
          {quote.status === "sent" ? (
            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setStatusChangePending("draft")} disabled={changingStatus}>
              {changingStatus ? "..." : "Borrador"}
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10" onClick={() => setStatusChangePending("sent")} disabled={changingStatus}>
              {changingStatus ? "..." : "Enviada"}
            </Button>
          )}
          <Button size="icon" variant="outline" className="h-7 w-7" onClick={handleDownloadPdf} disabled={downloadingPdf || !quote} title="Descargar PDF">
            {downloadingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          </Button>
          {/* Overflow menu for secondary actions */}
          <div className="relative">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setOverflowMenuOpen((v) => !v)}>
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
            {overflowMenuOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setOverflowMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-30 min-w-[180px] max-w-[calc(100vw-2rem)] rounded-md border bg-popover p-1 shadow-md">
                  <button className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent" onClick={() => { setOverflowMenuOpen(false); handleClone(); }} disabled={cloning}>
                    <Copy className="h-3.5 w-3.5" /> {cloning ? "Clonando..." : "Clonar cotizacion"}
                  </button>
                  <button className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent" onClick={() => { setOverflowMenuOpen(false); handleSendDotacionToInstallation(); }} disabled={sendingDotacion || !crmContext.installationId || positions.length === 0}>
                    <Building2 className="h-3.5 w-3.5" /> {sendingDotacion ? "Enviando..." : "Enviar dotacion"}
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
      </div>{/* end sticky header */}

      {/* -- 2-column layout: pt-14 reserva espacio para que el header sticky no tape el contenido -- */}
      <div className="pt-14 lg:grid lg:grid-cols-[1fr_320px] lg:gap-0 lg:h-[calc(100vh-10rem)] lg:min-h-[420px] min-w-0 overflow-x-hidden">

      {/* -- Editor: scrollable left column (only this scrolls on desktop) -- */}
      <div className="space-y-2 min-w-0 overflow-x-hidden lg:pr-5 overflow-y-auto lg:min-h-0 lg:overscroll-contain">
      {/* -- Section: Datos (scroll-mt-14: visible below sticky header when scrolled) -- */}
      <Card className="shadow-sm overflow-visible scroll-mt-14">
        <button type="button" onClick={() => setSecDatos(v => !v)} className="flex items-center justify-between w-full px-4 py-3 hover:bg-muted/10 transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-bold shrink-0">Datos</h2>
            {!secDatos && (
              <span className="text-[11px] text-muted-foreground truncate">
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
              <span className="text-[11px] text-muted-foreground truncate">
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
                <Label className="text-[11px] text-muted-foreground">Forma de pago</Label>
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
                <Label className="text-[11px] text-muted-foreground">Inicio servicios</Label>
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
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">días háb.</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Duración contrato</Label>
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
                  <span className="text-[10px] text-muted-foreground">meses</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Propuesta económica</Label>
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
                    <option value="">Sin template</option>
                    {proposalTemplates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  {proposalTemplates.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        const slug = proposalTemplates.find((t) => t.id === proposalTemplateId)?.slug || proposalTemplates[0]?.slug || "standard";
                        setPdfDownloading(true);
                        try {
                          const res = await fetch(`/api/cpq/quotes/${quoteId}/export-pdf?templateSlug=${encodeURIComponent(slug)}`);
                          if (!res.ok) throw new Error("Error generando PDF");
                          const blob = await res.blob();
                          const url = URL.createObjectURL(blob);
                          window.open(url, "_blank");
                        } catch {
                          toast.error("Error al generar el PDF");
                        } finally {
                          setPdfDownloading(false);
                        }
                      }}
                      disabled={pdfDownloading}
                      className="h-8 px-2 shrink-0"
                      title="Ver PDF"
                    >
                      {pdfDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* -- Section: Puestos -- */}
      <Card className="shadow-sm overflow-hidden" inert={isLocked ? true : undefined}>
        <div role="button" tabIndex={0} onClick={() => setSecPuestos(v => !v)} className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-muted/10 transition-colors cursor-pointer">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-bold shrink-0">Puestos</h2>
            {!secPuestos && positions.length > 0 && (
              <span className="text-[11px] text-muted-foreground truncate">
                {positions.length} {positions.length === 1 ? "puesto" : "puestos"} · {stats.totalGuards} guardias — <span className="font-mono font-semibold text-blue-400">{formatCurrency(positions.reduce((sum, p) => sum + Number(p.monthlyPositionCost), 0))}</span>
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
            {positions.length === 0 ? (
              <EmptyState
                icon={<Users className="h-6 w-6" />}
                title="Sin puestos"
                description="Agrega el primer puesto para comenzar."
                compact
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {positions.map((position) => (
                  <CpqPositionCard
                    key={position.id}
                    position={position}
                    quoteId={quoteId}
                    onUpdated={refresh}
                    readOnly={isLocked}
                    salePriceMonthlyForPosition={positionSalePrices.get(position.id) ?? 0}
                    clientHourlyRate={positionHourlyRates.get(position.id) ?? 0}
                  />
                ))}
              </div>
            )}
            {positions.length > 0 && (
              <div className="flex justify-between items-center px-3 py-2 border border-dashed border-border/60 rounded-lg mt-2">
                <span className="text-xs font-semibold text-muted-foreground">Total mano de obra</span>
                <span className="text-sm font-bold tabular-nums">
                  {formatCurrency(positions.reduce((sum, p) => sum + Number(p.monthlyPositionCost), 0))}
                </span>
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
              <span className="text-[11px] text-muted-foreground truncate">
                <span className="font-mono font-semibold text-amber-400">{formatCurrency(costSummary.monthlyExtras ?? 0)}</span>
              </span>
            )}
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", secCostos && "rotate-180")} />
        </button>
        {secCostos && (
          <div className="px-4 pb-4">
            <CpqQuoteCosts quoteId={quoteId} variant="inline" showFinancial={false} readOnly={isLocked} onAdditionalLinesChange={setAdditionalLines} onSaved={refresh} />
          </div>
        )}
      </Card>

      {/* -- Section: Líneas adicionales -- */}
      <Card className="shadow-sm overflow-hidden" inert={isLocked ? true : undefined}>
        <button type="button" onClick={() => setSecLineas(v => !v)} className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-muted/10 transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-bold shrink-0">Líneas adicionales</h2>
            {!secLineas && additionalLines.length > 0 && (
              <span className="text-[11px] text-muted-foreground truncate">
                {additionalLines.length} {additionalLines.length === 1 ? "línea" : "líneas"} — <span className="font-mono font-semibold text-purple-400">{formatCurrency(additionalLinesTotal)}</span>
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
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
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
                        className="h-6 bg-transparent border-none text-[11px] text-muted-foreground p-0 focus-visible:ring-0 placeholder:text-muted-foreground/40"
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
                              "h-5 rounded px-1.5 text-[10px] font-semibold capitalize transition-colors",
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
                              "h-5 rounded px-1.5 text-[10px] font-semibold transition-colors",
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
                          <span className="text-[10px] text-muted-foreground">Margen:</span>
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
                            className="h-6 w-12 bg-card text-foreground border-border text-[10px] text-right font-mono px-1"
                            disabled={isLocked}
                          />
                          <span className="text-[10px] text-muted-foreground">%</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[13px] font-bold tabular-nums">
                          {formatCurrency(precioMensual)}
                          <span className="text-[10px] text-muted-foreground font-normal">/mes</span>
                        </span>
                        {isUnico && (
                          <div className="text-[10px] text-muted-foreground">
                            Inv: {formatCurrency(precioVenta)} ÷ {quoteForm.contractDuration}m
                          </div>
                        )}
                        {mPct > 0 && (
                          <div className="text-[10px] text-emerald-400">
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
            )}
            {additionalLines.length > 0 && (
              <div className="flex items-center justify-between pt-1 border-t border-purple-500/20">
                <span className="text-[11px] font-medium text-purple-300">Total líneas adicionales</span>
                <span className="text-sm font-bold font-mono text-purple-300">
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
              <span className="text-[11px] text-muted-foreground truncate">
                <span className="font-mono font-semibold text-orange-400">{formatCurrency((costSummary.monthlyFinancial ?? 0) + (costSummary.monthlyPolicy ?? 0))}</span>
              </span>
            )}
            {savingFinancials && <span className="text-[10px] text-muted-foreground">Guardando...</span>}
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", secFinancieros && "rotate-180")} />
        </button>
        {secFinancieros && (
          <div className="px-4 pb-4 space-y-2">

          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
            {/* Costo financiero */}
            <div className="space-y-1.5 rounded-md border border-border/40 bg-muted/10 p-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold">Financiero</span>
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium transition-colors",
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
                  <Label className="text-[10px] text-muted-foreground">Base venta</Label>
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
                  <Label className="text-[10px] text-muted-foreground">Tasa %</Label>
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
                <div className="text-[10px] text-emerald-700 dark:text-emerald-400">
                  = {formatCurrency(salePriceBase * ((costParams?.financialRatePct ?? 2.5) / 100))}/mes
                </div>
              )}
            </div>

            {/* Poliza */}
            <div className="space-y-1.5 rounded-md border border-border/40 bg-muted/10 p-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold">Poliza</span>
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium transition-colors",
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
                  <Label className="text-[10px] text-muted-foreground">Meses</Label>
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
                  <Label className="text-[10px] text-muted-foreground">% Poliza</Label>
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
                  <Label className="text-[10px] text-muted-foreground">Tasa %</Label>
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
                <div className="text-[10px] text-emerald-700 dark:text-emerald-400">
                  = {formatCurrency(
                    (salePriceBase * policyContractMonths * (policyContractPct / 100) * ((costParams?.policyRatePct ?? 2.5) / 100)) / 12
                  )}/mes
                </div>
              )}
            </div>
          </div>

          {financialError && (
            <div className="text-[11px] text-red-400">{financialError}</div>
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
              <span className="text-[11px] text-muted-foreground truncate">
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

      {/* -- Section: Adjuntos para enviar con el mail -- */}
      <QuoteAttachmentsSection quoteId={quoteId} isLocked={isLocked} />

      </div>{/* end editor column */}

      {/* -- Sidebar: fixed right column (desktop only), stays visible while left column scrolls -- */}
      <aside className="hidden lg:flex flex-col lg:self-start lg:h-full border-l border-border/40 overflow-y-auto pl-4 min-h-0">
        <FinancialPanel
          positionsCount={positions.length}
          totalGuards={stats.totalGuards}
          marginPct={marginPct}
          salePriceMonthly={salePriceMonthly}
          additionalLinesTotal={additionalLinesTotal}
          ufValue={ufValue}
          costSummary={costSummary}
          costCategoryBreakdown={costCategoryBreakdown}
          marginAmount={marginAmount}
          positions={positions}
          positionSalePrices={positionSalePrices}
          positionHourlyRates={positionHourlyRates}
          monthlyHoursStandard={monthlyHours}
          quote={quote}
          crmContext={crmContext}
          crmContacts={crmContacts}
          crmInstallations={crmInstallations}
          crmDeals={crmDeals}
          additionalLines={additionalLines}
          tenantBranding={tenantBranding}
          onGenerateAiDescription={generateAiDescription}
          generatingAi={generatingAi}
          aiCustomInstruction={aiCustomInstruction}
          setAiCustomInstruction={setAiCustomInstruction}
          onGenerateServiceDetail={generateServiceDetail}
          generatingServiceDetail={generatingServiceDetail}
          serviceDetailInstruction={serviceDetailInstruction}
          setServiceDetailInstruction={setServiceDetailInstruction}
          aiDescription={quote.aiDescription ?? null}
          onAiDescriptionChange={(v) => {
            setQuote({ ...quote, aiDescription: v });
            fetch(`/api/cpq/quotes/${quoteId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ aiDescription: v }),
            }).catch(() => {});
          }}
          serviceDetail={quote.serviceDetail ?? null}
          onServiceDetailChange={(v) => {
            setQuote({ ...quote, serviceDetail: v });
            fetch(`/api/cpq/quotes/${quoteId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ serviceDetail: v }),
            }).catch(() => {});
          }}
          quoteId={quoteId}
          quoteCode={quote.code}
          sendingPortal={sendingPortal}
          onSendPortal={handleSendPortal}
          isLocked={isLocked}
          hasAccount={!!crmContext.accountId}
          hasContact={!!crmContext.contactId}
          hasDeal={!!crmContext.dealId}
          dealId={crmContext.dealId || undefined}
          contactName={(() => {
            const c = crmContext.contactId ? crmContacts.find((x) => x.id === crmContext.contactId) : null;
            return c ? `${c.firstName} ${c.lastName}`.trim() : undefined;
          })()}
          contactEmail={(() => {
            const c = crmContext.contactId ? crmContacts.find((x) => x.id === crmContext.contactId) : null;
            return c?.email || undefined;
          })()}
          proposalTemplateSlug={proposalTemplates.find((t) => t.id === proposalTemplateId)?.slug || "standard"}
        />
      </aside>

      </div>{/* end 2-column grid */}

      {/* Mobile spacer for fixed bottom bar */}
      <div className="h-14 lg:hidden" />

      {/* -- Mobile bottom bar (replaces wizard nav) -- */}
      <MobileBottomBar
        className="lg:hidden"
        salePriceMonthly={salePriceMonthly}
        additionalLinesTotal={additionalLinesTotal}
        marginPct={marginPct}
        ufValue={ufValue}
        totalGuards={stats.totalGuards}
        financialPanelContent={
          <FinancialPanel
            positionsCount={positions.length}
            totalGuards={stats.totalGuards}
            marginPct={marginPct}
            salePriceMonthly={salePriceMonthly}
            additionalLinesTotal={additionalLinesTotal}
            ufValue={ufValue}
            costSummary={costSummary}
            costCategoryBreakdown={costCategoryBreakdown}
            marginAmount={marginAmount}
            positions={positions}
            positionSalePrices={positionSalePrices}
            positionHourlyRates={positionHourlyRates}
            monthlyHoursStandard={monthlyHours}
            quote={quote}
            crmContext={crmContext}
            crmContacts={crmContacts}
            crmInstallations={crmInstallations}
            crmDeals={crmDeals}
            additionalLines={additionalLines}
            tenantBranding={tenantBranding}
            onGenerateAiDescription={generateAiDescription}
            generatingAi={generatingAi}
            aiCustomInstruction={aiCustomInstruction}
            setAiCustomInstruction={setAiCustomInstruction}
            onGenerateServiceDetail={generateServiceDetail}
            generatingServiceDetail={generatingServiceDetail}
            serviceDetailInstruction={serviceDetailInstruction}
            setServiceDetailInstruction={setServiceDetailInstruction}
            aiDescription={quote.aiDescription ?? null}
            onAiDescriptionChange={(v) => {
              setQuote({ ...quote, aiDescription: v });
              fetch(`/api/cpq/quotes/${quoteId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ aiDescription: v }),
              }).catch(() => {});
            }}
            serviceDetail={quote.serviceDetail ?? null}
            onServiceDetailChange={(v) => {
              setQuote({ ...quote, serviceDetail: v });
              fetch(`/api/cpq/quotes/${quoteId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ serviceDetail: v }),
              }).catch(() => {});
            }}
            quoteId={quoteId}
            quoteCode={quote.code}
            sendingPortal={sendingPortal}
            onSendPortal={handleSendPortal}
            isLocked={isLocked}
            hasAccount={!!crmContext.accountId}
            hasContact={!!crmContext.contactId}
            hasDeal={!!crmContext.dealId}
            dealId={crmContext.dealId || undefined}
            contactName={(() => {
              const c = crmContext.contactId ? crmContacts.find((x) => x.id === crmContext.contactId) : null;
              return c ? `${c.firstName} ${c.lastName}`.trim() : undefined;
            })()}
            contactEmail={(() => {
              const c = crmContext.contactId ? crmContacts.find((x) => x.id === crmContext.contactId) : null;
              return c?.email || undefined;
            })()}
            proposalTemplateSlug={proposalTemplates.find((t) => t.id === proposalTemplateId)?.slug || "standard"}
          />
        }
        portalButton={
          <Button
            className="w-full h-11 gap-2 text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white"
            disabled={
              !quote ||
              (positions.length === 0 && (additionalLines?.length ?? 0) === 0) ||
              quote.status === "sent" ||
              !crmContext.accountId ||
              !crmContext.contactId ||
              !crmContext.dealId ||
              sendingPortal
            }
            onClick={handleSendPortal}
          >
            <Shield className="h-4 w-4" />
            {sendingPortal ? "Enviando..." : "Enviar por Portal"}
          </Button>
        }
        pdfEmailButton={
          <SendPdfEmailModal
            quoteId={quoteId}
            quoteCode={quote.code}
            contactEmail={(() => {
              const c = crmContext.contactId ? crmContacts.find((x) => x.id === crmContext.contactId) : null;
              return c?.email || undefined;
            })()}
            contactName={(() => {
              const c = crmContext.contactId ? crmContacts.find((x) => x.id === crmContext.contactId) : null;
              return c ? `${c.firstName} ${c.lastName}`.trim() : undefined;
            })()}
            companyName={quote.clientName || undefined}
            disabled={!crmContext.contactId || !crmContacts.find((x) => x.id === crmContext.contactId)?.email}
            dealId={crmContext.dealId || undefined}
          />
        }
        emailButton={
          <SendCpqQuoteModal
            quoteId={quoteId}
            quoteCode={quote.code}
            clientName={quote.clientName || undefined}
            disabled={!quote || (positions.length === 0 && (additionalLines?.length ?? 0) === 0) || quote.status === "sent"}
            hasAccount={!!crmContext.accountId}
            hasContact={!!crmContext.contactId}
            hasDeal={!!crmContext.dealId}
            dealId={crmContext.dealId || undefined}
            contactName={(() => {
              const c = crmContext.contactId ? crmContacts.find((x) => x.id === crmContext.contactId) : null;
              return c ? `${c.firstName} ${c.lastName}`.trim() : undefined;
            })()}
            contactEmail={(() => {
              const c = crmContext.contactId ? crmContacts.find((x) => x.id === crmContext.contactId) : null;
              return c?.email || undefined;
            })()}
          />
        }
      />

      {/* Modal de decisión de seguimiento para Portal */}
      {crmContext.dealId && (
        <FollowUpDecisionModal
          open={portalFollowUpModalOpen}
          onOpenChange={setPortalFollowUpModalOpen}
          dealId={crmContext.dealId}
          onConfirm={handleSendPortalConfirmed}
          loading={sendingPortal}
          showWhatsApp
          recipientEmail={(() => {
            const c = crmContext.contactId ? crmContacts.find((x) => x.id === crmContext.contactId) : null;
            return c?.email || "";
          })()}
          ccEmail={portalEmailCc}
          onCcChange={setPortalEmailCc}
          bccEmail={portalEmailBcc}
          onBccChange={setPortalEmailBcc}
        />
      )}

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

      {/* Confirmacion Volver a borrador */}
      <Dialog open={statusChangePending === "draft"} onOpenChange={(v) => !v && setStatusChangePending(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Volver a borrador</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Volver esta cotizacion a borrador? Podras editar los valores nuevamente. Para marcarla como enviada otra vez, usa &quot;Marcar como enviada&quot;.
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
