/**
 * Detalle de cotización CPQ
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader, KpiCard, Stepper } from "@/components/opai";
import { CreatePositionModal } from "@/components/cpq/CreatePositionModal";
import { CpqPositionCard } from "@/components/cpq/CpqPositionCard";
import { CpqQuoteCosts } from "@/components/cpq/CpqQuoteCosts";
import { CpqPricingCalc } from "@/components/cpq/CpqPricingCalc";
import { SendCpqQuoteModal } from "@/components/cpq/SendCpqQuoteModal";
import { formatCurrency, formatWeekdaysShort, getShiftLabel } from "@/components/cpq/utils";
import { cn, formatNumber, parseLocalizedNumber, formatCLP, formatUFSuffix } from "@/lib/utils";
import { clpToUf } from "@/lib/uf";
import type {
  CpqQuote,
  CpqPosition,
  CpqQuoteCostSummary,
  CpqQuoteParameters,
  CpqQuoteCostItem,
  CpqQuoteUniformItem,
  CpqQuoteExamItem,
  CpqQuoteMeal,
  CpqQuoteVehicle,
  CpqQuoteInfrastructure,
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
import { AddressAutocomplete, type AddressResult } from "@/components/ui/AddressAutocomplete";
import { MapsUrlPasteInput } from "@/components/ui/MapsUrlPasteInput";
import { ArrowLeft, Copy, RefreshCw, FileText, Users, Layers, Calculator, ChevronLeft, ChevronRight, Check, Trash2, Download, Send, Sparkles, Loader2, Plus, Building2 } from "lucide-react";

interface CpqQuoteDetailProps {
  quoteId: string;
}

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

export function CpqQuoteDetail({ quoteId }: CpqQuoteDetailProps) {
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
  const [marginPct, setMarginPct] = useState(13);
  const [cloning, setCloning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [statusChangePending, setStatusChangePending] = useState<"draft" | "sent" | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [sendingDotacion, setSendingDotacion] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [savingFinancials, setSavingFinancials] = useState(false);
  const [financialError, setFinancialError] = useState<string | null>(null);
  const [decimalDrafts, setDecimalDrafts] = useState<Record<string, string>>({});
  const [quoteForm, setQuoteForm] = useState({
    clientName: "",
    validUntil: "",
    notes: "",
    status: "draft" as CpqQuote["status"],
  });
  const [quoteDirty, setQuoteDirty] = useState(false);
  const [savingQuote, setSavingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // CRM context
  const [crmAccounts, setCrmAccounts] = useState<{ id: string; name: string }[]>([]);
  const [crmInstallations, setCrmInstallations] = useState<{ id: string; name: string; city?: string | null }[]>([]);
  const [crmContacts, setCrmContacts] = useState<{ id: string; firstName: string; lastName: string; email?: string | null }[]>([]);
  const [crmDeals, setCrmDeals] = useState<{ id: string; title: string }[]>([]);
  const [crmContext, setCrmContext] = useState({
    accountId: "" as string,
    installationId: "" as string,
    contactId: "" as string,
    dealId: "" as string,
    currency: "CLP" as string,
  });
  const [generatingAi, setGeneratingAi] = useState(false);
  const [generatingServiceDetail, setGeneratingServiceDetail] = useState(false);
  const [ufValue, setUfValue] = useState<number | null>(null);
  const [aiCustomInstruction, setAiCustomInstruction] = useState("");
  const [serviceDetailInstruction, setServiceDetailInstruction] = useState("");

  // Inline creation modals
  const [inlineCreateType, setInlineCreateType] = useState<"account" | "installation" | "contact" | "deal" | null>(null);
  const [inlineForm, setInlineForm] = useState({
    name: "",
    firstName: "",
    lastName: "",
    email: "",
    title: "",
    address: "",
    city: "",
    commune: "",
    lat: null as number | null,
    lng: null as number | null,
  });
  const [inlineCreating, setInlineCreating] = useState(false);

  const createInline = async () => {
    if (!inlineCreateType) return;
    setInlineCreating(true);
    try {
      let endpoint = "";
      let body: Record<string, unknown> = {};

      switch (inlineCreateType) {
        case "account":
          endpoint = "/api/crm/accounts";
          body = { name: inlineForm.name, type: "prospect" };
          break;
        case "installation":
          endpoint = "/api/crm/installations";
          body = {
            accountId: crmContext.accountId,
            name: inlineForm.name,
            address: inlineForm.address || null,
            city: inlineForm.city || null,
            commune: inlineForm.commune || null,
            lat: inlineForm.lat ?? null,
            lng: inlineForm.lng ?? null,
          };
          break;
        case "contact":
          endpoint = "/api/crm/contacts";
          body = { accountId: crmContext.accountId, firstName: inlineForm.firstName, lastName: inlineForm.lastName, email: inlineForm.email };
          break;
        case "deal":
          endpoint = "/api/crm/deals";
          body = { accountId: crmContext.accountId, title: inlineForm.title || `Oportunidad ${quoteForm.clientName}` };
          break;
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        const err = new Error(data.error || "Error") as Error & { status?: number };
        err.status = res.status;
        throw err;
      }

      const created = data.data;

      // Auto-select and refresh lists
      switch (inlineCreateType) {
        case "account":
          setCrmAccounts((prev) => [...prev, { id: created.id, name: created.name }]);
          saveCrmContext({ accountId: created.id, installationId: "", contactId: "", dealId: "" });
          setQuoteForm((prev) => ({ ...prev, clientName: created.name }));
          setQuoteDirty(true);
          break;
        case "installation":
          setCrmInstallations((prev) => [...prev, { id: created.id, name: created.name, city: created.city }]);
          saveCrmContext({ installationId: created.id });
          break;
        case "contact":
          setCrmContacts((prev) => [...prev, { id: created.id, firstName: created.firstName, lastName: created.lastName, email: created.email }]);
          saveCrmContext({ contactId: created.id });
          break;
        case "deal":
          setCrmDeals((prev) => [...prev, { id: created.id, title: created.title }]);
          saveCrmContext({ dealId: created.id });
          break;
      }

      setInlineCreateType(null);
      setInlineForm({ name: "", firstName: "", lastName: "", email: "", title: "", address: "", city: "", commune: "", lat: null, lng: null });
      toast.success("Creado exitosamente");
    } catch (error: unknown) {
      console.error(error);
      const msg = error instanceof Error ? error.message : "No se pudo crear";
      toast.error(msg);
    } finally {
      setInlineCreating(false);
    }
  };

  const isLocked = quote?.status === "sent";
  const steps = ["Datos", "Puestos", "Costos", "Resumen", "Documento"];
  const stepIcons = [FileText, Users, Layers, Calculator, Send];
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
  const updateCostItem = (catalogItemId: string, patch: Partial<CpqQuoteCostItem>) => {
    setCostItems((prev) =>
      prev.map((item) =>
        item.catalogItemId === catalogItemId ? { ...item, ...patch } : item
      )
    );
  };

  const refresh = async () => {
    setLoading(true);
    try {
      const [quoteRes, costsRes] = await Promise.all([
        fetch(`/api/cpq/quotes/${quoteId}`),
        fetch(`/api/cpq/quotes/${quoteId}/costs`),
      ]);
      const quoteData = await quoteRes.json();
      const costsData = await costsRes.json();
      if (quoteData.success) {
        setQuote(quoteData.data);
        setPositions(quoteData.data.positions || []);
      }
      if (costsData.success) {
        setCostSummary(costsData.data.summary);
        setCostParams(
          costsData.data.parameters
            ? { ...costsData.data.parameters, financialEnabled: true }
            : null
        );
        setMarginPct(costsData.data.parameters?.marginPct ?? 13);
        setCostItems(costsData.data.costItems || []);
        setUniforms(costsData.data.uniforms || []);
        setExams(costsData.data.exams || []);
        setMeals(costsData.data.meals || []);
        setVehicles(costsData.data.vehicles || []);
        setInfrastructure(costsData.data.infrastructure || []);
      }
    } catch (err) {
      console.error("Error loading CPQ quote:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [quoteId]);

  // Refresh data when navigating to Resumen or Documento steps
  useEffect(() => {
    if (activeStep >= 3) {
      refresh();
    }
  }, [activeStep]);

  useEffect(() => {
    if (activeStep !== 3 || !costSummary || !costParams) return;
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
  }, [activeStep, costSummary, costParams, marginPct]);

  useEffect(() => {
    if (!quote) return;
    setQuoteForm({
      clientName: quote.clientName || "",
      validUntil: formatDateInput(quote.validUntil),
      notes: quote.notes || "",
      status: quote.status,
    });
    setCrmContext({
      accountId: quote.accountId ?? "",
      installationId: quote.installationId ?? "",
      contactId: quote.contactId ?? "",
      dealId: quote.dealId ?? "",
      currency: quote.currency ?? "CLP",
    });
    setQuoteDirty(false);
  }, [quote]);

  // Load UF value for CLP/UF display
  useEffect(() => {
    fetch("/api/fx/uf")
      .then((r) => r.json())
      .then((d) => { if (d.success) setUfValue(d.value); })
      .catch(() => {});
  }, []);

  // Load CRM accounts on mount
  useEffect(() => {
    fetch("/api/crm/accounts")
      .then((r) => r.json())
      .then((d) => { if (d.success) setCrmAccounts(d.data.map((a: Record<string, string>) => ({ id: a.id, name: a.name }))); })
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
      fetch(`/api/crm/installations?accountId=${crmContext.accountId}`).then((r) => r.json()),
      fetch("/api/crm/contacts").then((r) => r.json()),
      fetch("/api/crm/deals").then((r) => r.json()),
    ]).then(([instData, contactData, dealData]) => {
      if (instData.success) setCrmInstallations(instData.data);
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
      toast.success(aiCustomInstruction.trim() ? "Descripción refinada con AI" : "Descripción generada con AI");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo generar la descripción AI");
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
      toast.error("No se pudo generar el detalle de servicio");
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
          clientName: quoteForm.clientName,
          validUntil: quoteForm.validUntil || null,
          notes: quoteForm.notes,
          status: quoteForm.status,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Error");
      setQuote(data.data);
      setQuoteDirty(false);
      setLastSavedAt(new Date());
      if (options?.nextStep !== undefined) setActiveStep(options.nextStep);
    } catch (error) {
      console.error("Error saving CPQ quote:", error);
      setQuoteError("No se pudo guardar la cotización.");
    } finally {
      setSavingQuote(false);
    }
  };

  const handleSaveFinancials = async () => {
    if (!costParams) return;
    setSavingFinancials(true);
    setFinancialError(null);
    try {
      const res = await fetch(`/api/cpq/quotes/${quoteId}/costs`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parameters: { ...costParams, financialEnabled: true },
          uniforms,
          exams,
          costItems,
          meals,
          vehicles,
          infrastructure,
        }),
      });
      const data = await res.json();
      if (!data?.success) {
        throw new Error(data?.error || "Error");
      }
      setCostSummary(data.data);
      await refresh();
      toast.success("Financieros guardados");
    } catch (error) {
      console.error("Error saving financials:", error);
      setFinancialError("No se pudieron guardar los financieros.");
      toast.error("No se pudieron guardar los financieros");
    } finally {
      setSavingFinancials(false);
    }
  };

  const goToStep = async (nextStep: number) => {
    const clamped = Math.max(0, Math.min(steps.length - 1, nextStep));
    if (clamped === activeStep) return;
    if (activeStep === 0 && quoteDirty) {
      await saveQuoteBasics({ nextStep: clamped });
      return;
    }
    setActiveStep(clamped);
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
      toast.success(newStatus === "draft" ? "Cotización en borrador. Ya puedes editar." : "Cotización marcada como enviada.");
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
        router.push(`/cpq/${data.data.id}`);
      }
    } catch (error) {
      console.error("Error cloning quote:", error);
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
      toast.success("Cotización eliminada");
      router.push("/crm/cotizaciones");
      router.refresh();
    } catch (error) {
      console.error("Error deleting quote:", error);
      toast.error("No se pudo eliminar la cotización");
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
        throw new Error("Error al generar PDF");
      }
      const html = await response.text();
      const iframe = document.createElement("iframe");
      iframe.setAttribute("style", "position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none;");
      iframe.srcdoc = html;
      document.body.appendChild(iframe);
      const onLoad = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } finally {
          setTimeout(() => document.body.removeChild(iframe), 1000);
        }
      };
      iframe.onload = onLoad;
      toast.success("Abre el diálogo de impresión y elige «Guardar como PDF»");
    } catch (error) {
      console.error("Error downloading PDF:", error);
      toast.error("No se pudo generar el PDF");
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleSendDotacionToInstallation = async () => {
    if (!quote) return;
    if (!crmContext.installationId) {
      toast.error("Selecciona una instalación en Contexto CRM antes de enviar dotación");
      return;
    }
    if (!positions.length) {
      toast.error("La cotización no tiene puestos para enviar");
      return;
    }

    const confirmed = window.confirm(
      "Esta acción reemplazará la dotación activa de la instalación con los puestos de esta cotización. ¿Continuar?"
    );
    if (!confirmed) return;

    setSendingDotacion(true);
    try {
      const response = await fetch(`/api/cpq/quotes/${quoteId}/send-to-installation`, {
        method: "POST",
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo enviar la dotación");
      }

      toast.success(
        `Dotación enviada a ${payload.data.installationName}: ${payload.data.createdPuestos} puestos creados`
      );
    } catch (error) {
      console.error("Error sending staffing to installation:", error);
      toast.error("No se pudo enviar la dotación a instalación");
    } finally {
      setSendingDotacion(false);
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
  const baseAdditionalCostsTotal = costSummary
    ? Math.max(
        0,
        additionalCostsTotal - costSummary.monthlyFinancial - costSummary.monthlyPolicy
      )
    : 0;
  const financialRatePct = costSummary?.financialRatePct ?? 2.5;
  const policyRatePct = costSummary?.policyRatePct ?? 0;
  const monthlyHours = costParams?.monthlyHoursStandard ?? 180;
  const policyContractMonths = costParams?.policyContractMonths ?? 12;
  const policyContractPct = costParams?.policyContractPct ?? 20;
  const contractMonths = costParams?.contractMonths ?? 12;
  const policyEnabled = costParams?.policyEnabled ?? false;
  const salePriceBase = Number(costParams?.salePriceBase ?? 0);
  const monthlyTotal = costSummary?.monthlyTotal ?? stats.monthly + additionalCostsTotal;

  // Per-category cost breakdown for the Resumen step (breaks down monthlyCostItems by type)
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
        if (!cat || !types.includes(cat.type)) return sum;
        const base = Number(cat.basePrice || 0);
        const override = item.unitPriceOverride != null ? Number(item.unitPriceOverride) : null;
        const unitPrice = normalizeUnit(override ?? base, cat.unit);
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

  // Sale price calculation (same formula as CpqPricingCalc)
  const salePriceMonthly = useMemo(() => {
    if (!costSummary) return 0;
    const margin = marginPct / 100;
    const costsBase =
      costSummary.monthlyPositions +
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
  const isLastStep = activeStep === steps.length - 1;
  const nextLabel =
    isLastStep
      ? "Volver a cotizaciones"
      : activeStep === 0 && quoteDirty
      ? "Guardar y seguir"
      : "Siguiente";
  const nextDisabled = activeStep === 0 && savingQuote;

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
        <div className="text-sm text-muted-foreground">Cotización no encontrada.</div>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-16">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href="/crm/cotizaciones">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <PageHeader
            title={quote.code}
            description={
              <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0 text-xs">
                {/* Cuenta */}
                {crmContext.accountId ? (
                  <span className="inline-flex items-center gap-1">
                    <span className="text-muted-foreground">Cuenta:</span>
                    <Link href={`/crm/accounts/${crmContext.accountId}`} className="text-primary hover:underline font-medium">
                      {quote.clientName || "Sin cliente"}
                    </Link>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <span className="text-muted-foreground">Cuenta:</span>
                    <span>{quote.clientName || "Sin cliente"}</span>
                  </span>
                )}
                {/* Contacto */}
                {crmContext.contactId && (() => {
                  const c = crmContacts.find((x) => x.id === crmContext.contactId);
                  const name = c ? `${c.firstName} ${c.lastName}`.trim() : "";
                  if (!name) return null;
                  return (
                    <>
                      <span className="text-muted-foreground/40">·</span>
                      <span className="inline-flex items-center gap-1">
                        <span className="text-muted-foreground">Contacto:</span>
                        <Link href={`/crm/contacts/${crmContext.contactId}`} className="text-primary hover:underline font-medium">
                          {name}
                        </Link>
                      </span>
                    </>
                  );
                })()}
                {/* Instalación */}
                {crmContext.installationId && (() => {
                  const inst = crmInstallations.find((x) => x.id === crmContext.installationId);
                  const name = inst?.name || "";
                  if (!name) return null;
                  return (
                    <>
                      <span className="text-muted-foreground/40">·</span>
                      <span className="inline-flex items-center gap-1">
                        <span className="text-muted-foreground">Instalación:</span>
                        <Link href={`/crm/installations/${crmContext.installationId}`} className="text-primary hover:underline font-medium">
                          {name}
                        </Link>
                      </span>
                    </>
                  );
                })()}
                {/* Negocio */}
                {crmContext.dealId && (() => {
                  const deal = crmDeals.find((d) => d.id === crmContext.dealId);
                  const name = deal?.title || "";
                  if (!name) return null;
                  return (
                    <>
                      <span className="text-muted-foreground/40">·</span>
                      <span className="inline-flex items-center gap-1">
                        <span className="text-muted-foreground">Negocio:</span>
                        <Link href={`/crm/deals/${crmContext.dealId}`} className="text-primary hover:underline font-medium">
                          {name}
                        </Link>
                      </span>
                    </>
                  );
                })()}
              </span>
            }
          />
        </div>
        <div className="flex items-center gap-2">
          {quote.status === "sent" ? (
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() => setStatusChangePending("draft")}
              disabled={changingStatus}
            >
              {changingStatus ? "Guardando..." : "Volver a borrador"}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="gap-2 border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10"
              onClick={() => setStatusChangePending("sent")}
              disabled={changingStatus}
            >
              {changingStatus ? "Guardando..." : "Marcar como enviada"}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={handleDownloadPdf}
            disabled={downloadingPdf || !quote}
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">
              {downloadingPdf ? "Generando..." : "PDF"}
            </span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={handleClone}
            disabled={cloning}
          >
            <Copy className="h-4 w-4" />
            <span className="hidden sm:inline">
              {cloning ? "Clonando..." : "Clonar"}
            </span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={handleSendDotacionToInstallation}
            disabled={sendingDotacion || !crmContext.installationId || positions.length === 0}
            title={
              !crmContext.installationId
                ? "Vincula una instalación para enviar la dotación"
                : positions.length === 0
                ? "Agrega al menos un puesto"
                : "Enviar dotación a instalación"
            }
          >
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">
              {sendingDotacion ? "Enviando..." : "Enviar dotación"}
            </span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={refresh}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="gap-2"
            onClick={() => setDeleteConfirmOpen(true)}
            disabled={deleting || isLocked}
          >
            <Trash2 className="h-4 w-4" />
            <span className="hidden sm:inline">
              {deleting ? "Eliminando..." : "Eliminar"}
            </span>
          </Button>
        </div>
      </div>

      <Stepper steps={steps} currentStep={activeStep} onStepClick={goToStep} className="mb-6" />

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-5">
        <KpiCard
          title="Puestos"
          value={positions.length}
          variant="blue"
          size="lg"
          className="col-span-1"
        />
        <KpiCard
          title="Guardias"
          value={stats.totalGuards}
          variant="purple"
          size="lg"
          className="col-span-1"
        />
        <KpiCard
          title="Costo mensual"
          value={formatCurrency(monthlyTotal)}
          variant="amber"
          size="lg"
          className="col-span-1"
        />
        <KpiCard
          title="Margen"
          value={`${formatNumber(marginPct, { minDecimals: 1, maxDecimals: 1 })}%`}
          variant="emerald"
          size="lg"
          className="col-span-1"
        />
        <KpiCard
          title="Precio venta"
          value={formatCLP(salePriceMonthly)}
          description={ufValue && ufValue > 0 ? formatUFSuffix(clpToUf(salePriceMonthly, ufValue)) : undefined}
          descriptionClassName="text-base font-semibold text-emerald-400"
          variant="emerald"
          size="md"
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {activeStep === 0 && (
        <Card className="p-3 sm:p-4 space-y-3" inert={isLocked}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Datos básicos</h2>
              <p className="text-xs text-muted-foreground">
                Se guarda automáticamente al avanzar.
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge variant="outline" className="text-xs">
                {quote.status}
              </Badge>
              <span
                className={`text-xs ${
                  quoteDirty ? "text-amber-400" : "text-muted-foreground"
                }`}
              >
                {saveLabel}
              </span>
            </div>
          </div>

          {/* CRM Context */}
          <div className="space-y-3 rounded-md border border-border p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contexto CRM</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Cuenta (empresa)</Label>
                <div className="flex gap-1">
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={crmContext.accountId}
                    onChange={(e) => {
                      const accountId = e.target.value;
                      const account = crmAccounts.find((a) => a.id === accountId);
                      saveCrmContext({ accountId, installationId: "", contactId: "", dealId: "" });
                      if (account) {
                        setQuoteForm((prev) => ({ ...prev, clientName: account.name }));
                        setQuoteDirty(true);
                      }
                    }}
                  >
                    <option value="">Seleccionar cuenta...</option>
                    {crmAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                  <Button size="icon" variant="outline" className="h-10 w-10 shrink-0" onClick={() => { setInlineForm({ name: "", firstName: "", lastName: "", email: "", title: "", address: "", city: "", commune: "", lat: null, lng: null }); setInlineCreateType("account"); }}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Instalación</Label>
                <div className="flex gap-1">
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={crmContext.installationId}
                    onChange={(e) => saveCrmContext({ installationId: e.target.value })}
                    disabled={!crmContext.accountId}
                  >
                    <option value="">Seleccionar instalación...</option>
                    {crmInstallations.map((i) => (
                      <option key={i.id} value={i.id}>{i.name}{i.city ? ` (${i.city})` : ""}</option>
                    ))}
                  </select>
                  <Button size="icon" variant="outline" className="h-10 w-10 shrink-0" disabled={!crmContext.accountId} onClick={() => { setInlineForm({ name: "", firstName: "", lastName: "", email: "", title: "", address: "", city: "", commune: "", lat: null, lng: null }); setInlineCreateType("installation"); }}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Contacto</Label>
                <div className="flex gap-1">
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={crmContext.contactId}
                    onChange={(e) => saveCrmContext({ contactId: e.target.value })}
                    disabled={!crmContext.accountId}
                  >
                    <option value="">Seleccionar contacto...</option>
                    {crmContacts.map((c) => (
                      <option key={c.id} value={c.id}>{c.firstName} {c.lastName}{c.email ? ` (${c.email})` : ""}</option>
                    ))}
                  </select>
                  <Button size="icon" variant="outline" className="h-10 w-10 shrink-0" disabled={!crmContext.accountId} onClick={() => { setInlineForm({ name: "", firstName: "", lastName: "", email: "", title: "", address: "", city: "", commune: "", lat: null, lng: null }); setInlineCreateType("contact"); }}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Negocio</Label>
                <div className="flex gap-1">
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={crmContext.dealId}
                    onChange={(e) => saveCrmContext({ dealId: e.target.value })}
                    disabled={!crmContext.accountId}
                  >
                    <option value="">Seleccionar negocio...</option>
                    {crmDeals.map((d) => (
                      <option key={d.id} value={d.id}>{d.title}</option>
                    ))}
                  </select>
                  <Button size="icon" variant="outline" className="h-10 w-10 shrink-0" disabled={!crmContext.accountId} onClick={() => { setInlineForm({ name: "", firstName: "", lastName: "", email: "", title: "", address: "", city: "", commune: "", lat: null, lng: null }); setInlineCreateType("deal"); }}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Inline Create Modal */}
          <Dialog open={!!inlineCreateType} onOpenChange={(v) => !v && setInlineCreateType(null)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {inlineCreateType === "account" && "Nueva cuenta"}
                  {inlineCreateType === "installation" && "Nueva instalación"}
                  {inlineCreateType === "contact" && "Nuevo contacto"}
                  {inlineCreateType === "deal" && "Nuevo negocio"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                {(inlineCreateType === "account" || inlineCreateType === "installation") && (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Nombre *</Label>
                      <Input
                        value={inlineForm.name}
                        onChange={(e) => setInlineForm((p) => ({ ...p, name: e.target.value }))}
                        placeholder={inlineCreateType === "account" ? "Nombre de empresa" : "Nombre de instalación"}
                        className="bg-background"
                        autoFocus
                      />
                    </div>
                    {inlineCreateType === "installation" && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Dirección * (Google Maps)</Label>
                        <AddressAutocomplete
                          value={inlineForm.address}
                          onChange={(result: AddressResult) =>
                            setInlineForm((p) => ({
                              ...p,
                              address: result.address,
                              city: result.city ?? p.city,
                              commune: result.commune ?? p.commune,
                              lat: result.lat,
                              lng: result.lng,
                            }))
                          }
                          placeholder="Buscar dirección en Google Maps..."
                          className="bg-background"
                          showMap={false}
                        />
                        <MapsUrlPasteInput
                          onResolve={(result) =>
                            setInlineForm((p) => ({
                              ...p,
                              address: result.address,
                              city: result.city ?? p.city,
                              commune: result.commune ?? p.commune,
                              lat: result.lat,
                              lng: result.lng,
                            }))
                          }
                        />
                      </div>
                    )}
                  </>
                )}
                {inlineCreateType === "contact" && (
                  <>
                    <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
                      El email identifica al contacto. Es obligatorio y evita duplicados.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Nombre *</Label>
                        <Input value={inlineForm.firstName} onChange={(e) => setInlineForm((p) => ({ ...p, firstName: e.target.value }))} className="bg-background" autoFocus />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Apellido *</Label>
                        <Input value={inlineForm.lastName} onChange={(e) => setInlineForm((p) => ({ ...p, lastName: e.target.value }))} className="bg-background" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Email *</Label>
                      <Input value={inlineForm.email} onChange={(e) => setInlineForm((p) => ({ ...p, email: e.target.value }))} placeholder="correo@empresa.com" className="bg-background" />
                    </div>
                  </>
                )}
                {inlineCreateType === "deal" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Título del negocio</Label>
                    <Input
                      value={inlineForm.title}
                      onChange={(e) => setInlineForm((p) => ({ ...p, title: e.target.value }))}
                      placeholder={`Oportunidad ${quoteForm.clientName}`}
                      className="bg-background"
                      autoFocus
                    />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setInlineCreateType(null)}>Cancelar</Button>
                <Button
                  onClick={createInline}
                  disabled={
                    inlineCreating ||
                    (inlineCreateType === "account" && !inlineForm.name.trim()) ||
                    (inlineCreateType === "installation" && (!inlineForm.name.trim() || !inlineForm.address.trim())) ||
                    (inlineCreateType === "contact" && (!inlineForm.firstName.trim() || !inlineForm.lastName.trim() || !inlineForm.email.trim()))
                  }
                >
                  {inlineCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Crear
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Válida hasta</Label>
              <Input
                type="date"
                value={quoteForm.validUntil}
                onChange={(e) => {
                  setQuoteForm((prev) => ({ ...prev, validUntil: e.target.value }));
                  setQuoteDirty(true);
                }}
                className="h-10 bg-background text-sm text-foreground [color-scheme:dark]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Moneda</Label>
              <div className="flex gap-1">
                {["CLP", "UF"].map((cur) => (
                  <button
                    key={cur}
                    type="button"
                    onClick={() => saveCrmContext({ currency: cur })}
                    className={cn(
                      "flex-1 rounded-md px-3 py-2 text-sm font-medium border transition-colors",
                      crmContext.currency === cur
                        ? "bg-primary/15 text-primary border-primary/30"
                        : "bg-background text-muted-foreground border-input hover:bg-accent/50"
                    )}
                  >
                    {cur}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {quoteError && (
            <div className="text-xs text-red-400">{quoteError}</div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => saveQuoteBasics()}
              disabled={!quoteDirty || savingQuote}
            >
              {savingQuote ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </Card>
      )}

      {activeStep === 1 && (
        <Card className="p-3 sm:p-4" inert={isLocked}>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-semibold">Puestos de trabajo</h2>
              {positions.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  Costo total:{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {formatCurrency(
                      positions.reduce((sum, p) => sum + Number(p.monthlyPositionCost), 0)
                    )}
                  </span>
                </span>
              )}
              <Badge variant="outline" className="text-xs">
                {quote.status}
              </Badge>
            </div>
            <CreatePositionModal quoteId={quoteId} onCreated={refresh} disabled={isLocked} />
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Agrega uno o más puestos. Puedes editar o duplicar luego.
          </p>

          {positions.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Agrega el primer puesto para comenzar la estructura de servicio.
            </div>
          ) : (
            <div className="space-y-3">
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
        </Card>
      )}

      {activeStep === 2 && (
        <div inert={isLocked}>
          <CpqQuoteCosts quoteId={quoteId} variant="inline" showFinancial={false} readOnly={isLocked} />
        </div>
      )}

      {activeStep === 3 && (
        <div className="space-y-3" inert={isLocked}>
          <CpqPricingCalc
            summary={costSummary}
            marginPct={marginPct}
            onMarginChange={isLocked ? undefined : async (newMargin) => {
              setMarginPct(newMargin);
              try {
                await fetch(`/api/cpq/quotes/${quoteId}/margin`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ marginPct: newMargin }),
                });
                await refresh();
              } catch (error) {
                console.error("Error saving margin:", error);
              }
            }}
            uniformTotal={costSummary?.monthlyUniforms ?? 0}
            examTotal={costSummary?.monthlyExams ?? 0}
            mealTotal={costSummary?.monthlyMeals ?? 0}
            operationalTotal={costCategoryBreakdown.equipment}
            transportTotal={costCategoryBreakdown.transport}
            vehicleTotal={costCategoryBreakdown.vehicle}
            infraTotal={costCategoryBreakdown.infra}
            systemTotal={costCategoryBreakdown.system}
            financialRatePct={financialRatePct}
            policyRatePct={policyRatePct}
            policyContractMonths={policyContractMonths}
            policyContractPct={policyContractPct}
            contractMonths={contractMonths}
            positions={positions}
            monthlyHours={monthlyHours}
          />

          <Card className="p-3 sm:p-4 space-y-3">
            <div>
              <h2 className="text-sm font-semibold">Gastos financieros</h2>
              <p className="text-xs text-muted-foreground">
                Costo financiero siempre activo y póliza configurable.
              </p>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Costo financiero</p>
                  <button
                    type="button"
                    className={cn(
                      "inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                      costParams?.financialEnabled
                        ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-200"
                        : "border-border bg-muted/30 text-muted-foreground"
                    )}
                    onClick={() => updateParams({ financialEnabled: !costParams?.financialEnabled })}
                    aria-pressed={costParams?.financialEnabled}
                  >
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        costParams?.financialEnabled ? "bg-emerald-400" : "bg-muted-foreground"
                      )}
                    />
                    {costParams?.financialEnabled ? "Activo" : "Inactivo"}
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Precio de venta base</Label>
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
                      className="h-9 bg-card text-foreground border-border placeholder:text-muted-foreground"
                      placeholder="Ej: 4000000"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tasa (%)</Label>
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
                      className="h-9 bg-card text-foreground border-border placeholder:text-muted-foreground"
                      placeholder="2,5"
                    />
                  </div>
                </div>
                {salePriceBase > 0 && (
                  <div className="text-xs text-emerald-400">
                    Costo financiero mensual:{" "}
                    {formatCurrency(salePriceBase * ((costParams?.financialRatePct ?? 2.5) / 100))}
                  </div>
                )}
              </div>

              <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Póliza de garantía</p>
                  <button
                    type="button"
                    className={cn(
                      "inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                      policyEnabled
                        ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-200"
                        : "border-border bg-muted/30 text-muted-foreground"
                    )}
                    onClick={() => updateParams({ policyEnabled: !policyEnabled, financialEnabled: true })}
                    aria-pressed={policyEnabled}
                  >
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        policyEnabled ? "bg-emerald-400" : "bg-muted-foreground"
                      )}
                    />
                    {policyEnabled ? "Activa" : "Inactiva"}
                  </button>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Meses póliza</Label>
                    <Input
                      type="number"
                      value={policyContractMonths}
                      onChange={(e) =>
                        updateParams({
                          policyContractMonths: parseLocalizedNumber(e.target.value),
                          financialEnabled: true,
                        })
                      }
                      className="h-9 bg-card text-foreground border-border placeholder:text-muted-foreground"
                      placeholder="12"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Porcentaje (%)</Label>
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
                      className="h-9 bg-card text-foreground border-border placeholder:text-muted-foreground"
                      placeholder="20"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tasa (%)</Label>
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
                      className="h-9 bg-card text-foreground border-border placeholder:text-muted-foreground"
                      placeholder="2,5"
                    />
                  </div>
                </div>

                {policyEnabled && salePriceBase > 0 && (
                  <div className="text-xs text-emerald-400">
                    Póliza mensual:{" "}
                    {formatCurrency(
                      (salePriceBase * policyContractMonths * (policyContractPct / 100) * ((costParams?.policyRatePct ?? 2.5) / 100)) / 12
                    )}
                  </div>
                )}
              </div>
            </div>

            {financialError && (
              <div className="text-xs text-red-400">{financialError}</div>
            )}

            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={handleSaveFinancials}
                disabled={savingFinancials || !costParams}
              >
                {savingFinancials ? "Guardando..." : "Guardar financieros"}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ── Step 5: Documento ── */}
      {activeStep === 4 && (
        <div className="space-y-4" inert={isLocked}>
          <Card className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">Documento y envío</h2>
                <p className="text-xs text-muted-foreground">
                  Genera la descripción AI, revisa el documento y envía al cliente.
                </p>
              </div>
              <Badge variant="outline" className="text-xs">{quote.status}</Badge>
            </div>

            {/* AI Description */}
            <div className="space-y-2 rounded-md border border-border p-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Descripción AI</Label>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs"
                  onClick={generateAiDescription}
                  disabled={generatingAi}
                >
                  {generatingAi ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {generatingAi ? "Generando..." : aiCustomInstruction.trim() ? "Refinar con AI" : "Generar con AI"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Genera un resumen ejecutivo profesional para la propuesta. Puedes editarlo después.
              </p>
              <Input
                value={aiCustomInstruction}
                onChange={(e) => setAiCustomInstruction(e.target.value)}
                placeholder="Instrucción para ajustar la descripción (ej: «más corto», «énfasis en retail») — opcional"
                className="h-9 text-sm"
              />
              <textarea
                value={quote.aiDescription ?? ""}
                onChange={(e) => {
                  // Save AI description directly
                  fetch(`/api/cpq/quotes/${quoteId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ aiDescription: e.target.value }),
                  }).catch(() => {});
                }}
                placeholder="Haz clic en 'Generar con AI' para crear una descripción profesional basada en los datos de la cotización..."
                className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                rows={5}
              />
            </div>

            {/* Service Detail */}
            <div className="space-y-2 rounded-md border border-border p-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Detalle del servicio</Label>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs"
                  onClick={generateServiceDetail}
                  disabled={generatingServiceDetail}
                >
                  {generatingServiceDetail ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {generatingServiceDetail ? "Generando..." : serviceDetailInstruction.trim() ? "Refinar con AI" : "Generar con AI"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Genera un resumen de lo que incluye el servicio (uniformes, exámenes, alimentación, equipos, etc.). Aparecerá en la propuesta.
              </p>
              <Input
                value={serviceDetailInstruction}
                onChange={(e) => setServiceDetailInstruction(e.target.value)}
                placeholder="Instrucción para ajustar el detalle (ej: «más detallado», «mencionar turnos 4x4») — opcional"
                className="h-9 text-sm"
              />
              <textarea
                value={quote.serviceDetail ?? ""}
                onChange={(e) => {
                  setQuote({ ...quote, serviceDetail: e.target.value });
                  fetch(`/api/cpq/quotes/${quoteId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ serviceDetail: e.target.value }),
                  }).catch(() => {});
                }}
                placeholder="Haz clic en 'Generar con AI' para crear un detalle profesional de lo que incluye el servicio..."
                className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                rows={5}
              />
            </div>

            {/* Document Preview */}
            <div className="rounded-md border border-border overflow-hidden">
              <div className="bg-muted/30 px-4 py-3 border-b">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Vista previa del documento</p>
              </div>
              <div className="p-4 space-y-3 bg-white text-black text-sm" style={{ fontFamily: "Arial, sans-serif" }}>
                <div className="flex justify-between items-start border-b-2 pb-2" style={{ borderColor: "#2563eb" }}>
                  <div className="text-lg font-bold" style={{ color: "#1e3a5f" }}>GARD SECURITY</div>
                  <div className="text-right text-xs text-gray-600">
                    <p className="font-bold text-sm text-black">{quote.code}</p>
                    <p>{quote.clientName || "Cliente"}</p>
                    {(() => {
                      const c = crmContext.contactId ? crmContacts.find((x) => x.id === crmContext.contactId) : null;
                      return c ? <p>{c.firstName} {c.lastName}</p> : null;
                    })()}
                    {(() => {
                      const inst = crmContext.installationId ? crmInstallations.find((x) => x.id === crmContext.installationId) : null;
                      return inst ? <p>{inst.name}</p> : null;
                    })()}
                    {quote.validUntil && <p>Válida hasta: {new Date(quote.validUntil).toLocaleDateString("es-CL")}</p>}
                  </div>
                </div>

                {/* Contexto: Negocio e Instalación */}
                {(crmContext.dealId || crmContext.installationId) && (
                  <div className="text-[10px] rounded" style={{ padding: "6px 10px", background: "#f0fdf4", borderLeft: "3px solid #2563eb", color: "#333" }}>
                    {(() => {
                      const deal = crmContext.dealId ? crmDeals.find((d) => d.id === crmContext.dealId) : null;
                      return deal ? <span><strong>Negocio:</strong> {deal.title}</span> : null;
                    })()}
                    {crmContext.dealId && crmContext.installationId && " · "}
                    {(() => {
                      const inst = crmContext.installationId ? crmInstallations.find((x) => x.id === crmContext.installationId) : null;
                      return inst ? <span><strong>Instalación:</strong> {inst.name}</span> : null;
                    })()}
                  </div>
                )}

                {quote.aiDescription && (
                  <p className="text-xs text-gray-600 bg-blue-50 rounded p-2 italic">
                    {quote.aiDescription}
                  </p>
                )}

                <div className="overflow-x-auto">
                  <p className="text-xs font-semibold border-b pb-1 mb-2">
                    Puestos de trabajo · {stats.totalGuards} guardia(s)
                  </p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: "#eff6ff" }}>
                        <th className="text-left p-1.5 font-semibold">Puesto</th>
                        <th className="text-left p-1.5 font-semibold">Guardias</th>
                        <th className="text-left p-1.5 font-semibold">Cantidad</th>
                        <th className="text-left p-1.5 font-semibold">Días</th>
                        <th className="text-left p-1.5 font-semibold">Horario</th>
                        <th className="text-left p-1.5 font-semibold">Turno</th>
                        <th className="text-right p-1.5 font-semibold">Precio mensual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map((pos) => {
                        const clp = positionSalePrices.get(pos.id) ?? Number(pos.monthlyPositionCost);
                        const formatted =
                          crmContext.currency === "UF" && ufValue && ufValue > 0
                            ? formatUFSuffix(clpToUf(clp, ufValue))
                            : formatCLP(clp);
                        const shiftLabel = getShiftLabel(pos.startTime);
                        return (
                          <tr key={pos.id} className="border-b border-gray-100">
                            <td className="p-1.5">{pos.customName || pos.puestoTrabajo?.name || "Puesto"}</td>
                            <td className="p-1.5">{pos.numGuards}</td>
                            <td className="p-1.5">{pos.numPuestos || 1}</td>
                            <td className="p-1.5">{formatWeekdaysShort(pos.weekdays)}</td>
                            <td className="p-1.5">{pos.startTime} - {pos.endTime}</td>
                            <td className="p-1.5">
                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "1px 6px",
                                  borderRadius: "4px",
                                  fontSize: "9px",
                                  fontWeight: 600,
                                  background: shiftLabel === "Nocturno" ? "#eef2ff" : "#fefce8",
                                  color: shiftLabel === "Nocturno" ? "#4338ca" : "#a16207",
                                }}
                              >
                                {shiftLabel === "Nocturno" ? "🌙" : "☀️"} {shiftLabel}
                              </span>
                            </td>
                            <td className="p-1.5 text-right">{formatted}</td>
                          </tr>
                        );
                      })}
                      <tr className="font-bold border-t-2" style={{ borderColor: "#2563eb", background: "#eff6ff" }}>
                        <td colSpan={6} className="p-1.5 text-right">Total mensual</td>
                        <td className="p-1.5 text-right">
                          {crmContext.currency === "UF" && ufValue && ufValue > 0
                            ? formatUFSuffix(clpToUf(salePriceMonthly, ufValue))
                            : formatCLP(salePriceMonthly)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {quote.serviceDetail && (
                  <div className="mt-2">
                    <p className="text-xs font-semibold border-b pb-1 mb-2" style={{ color: "#1e3a5f" }}>
                      Detalle del servicio
                    </p>
                    <div className="text-xs text-gray-700 whitespace-pre-line leading-relaxed">
                      {quote.serviceDetail}
                    </div>
                  </div>
                )}

                <div className="text-center text-[10px] text-gray-400 border-t pt-2">
                  Generado el {new Date().toLocaleDateString("es-CL")} · www.gard.cl
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                className="flex-1 gap-2"
                onClick={handleDownloadPdf}
                disabled={downloadingPdf || !quote}
              >
                <Download className="h-4 w-4" />
                {downloadingPdf ? "Generando PDF..." : "Descargar PDF"}
              </Button>
              <SendCpqQuoteModal
                quoteId={quoteId}
                quoteCode={quote.code}
                clientName={quote.clientName || undefined}
                disabled={!quote || positions.length === 0 || quote.status === "sent"}
                hasAccount={!!crmContext.accountId}
                hasContact={!!crmContext.contactId}
                hasDeal={!!crmContext.dealId}
                contactName={(() => {
                  const c = crmContext.contactId ? crmContacts.find((x) => x.id === crmContext.contactId) : null;
                  return c ? `${c.firstName} ${c.lastName}`.trim() : undefined;
                })()}
                contactEmail={(() => {
                  const c = crmContext.contactId ? crmContacts.find((x) => x.id === crmContext.contactId) : null;
                  return c?.email || undefined;
                })()}
              />
            </div>
          </Card>
        </div>
      )}

      <div className="sticky bottom-0 z-20 -mx-4 border-t border-border/60 bg-background/95 px-4 py-2 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() => void goToStep(activeStep - 1)}
            disabled={activeStep === 0}
          >
            <ChevronLeft className="h-4 w-4" />
            Atrás
          </Button>
          <span className="text-xs text-muted-foreground">
            Paso {activeStep + 1} de {steps.length} · {steps[activeStep]}
          </span>
          <Button
            size="sm"
            className="gap-1"
            onClick={() => {
              if (isLastStep) {
                router.push("/crm/cotizaciones");
              } else {
                void goToStep(activeStep + 1);
              }
            }}
            disabled={nextDisabled}
          >
            {nextLabel}
            {!isLastStep && <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Confirmación Volver a borrador */}
      <Dialog open={statusChangePending === "draft"} onOpenChange={(v) => !v && setStatusChangePending(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Volver a borrador</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Volver esta cotización a borrador? Podrás editar los valores nuevamente. Para marcarla como enviada otra vez, usa &quot;Marcar como enviada&quot;.
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

      {/* Confirmación Marcar como enviada */}
      <Dialog open={statusChangePending === "sent"} onOpenChange={(v) => !v && setStatusChangePending(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Marcar como enviada</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Marcar esta cotización como enviada? Una vez enviada, no podrás modificar nada hasta que la vuelvas a borrador.
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
        title="Eliminar cotización"
        description="La cotización será eliminada permanentemente. Esta acción no se puede deshacer."
        onConfirm={handleDelete}
      />
    </div>
  );
}
