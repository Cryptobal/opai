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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Stepper } from "@/components/opai";
import { EmptyState } from "@/components/opai/EmptyState";
import { CreatePositionModal } from "@/components/cpq/CreatePositionModal";
import { CpqPositionCard } from "@/components/cpq/CpqPositionCard";
import { CpqQuoteCosts } from "@/components/cpq/CpqQuoteCosts";
import { CpqPricingCalc } from "@/components/cpq/CpqPricingCalc";
import { SendCpqQuoteModal } from "@/components/cpq/SendCpqQuoteModal";
import { formatCurrency, formatWeekdaysShort } from "@/components/cpq/utils";
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
import { ArrowLeft, Copy, RefreshCw, FileText, Users, Layers, Calculator, ChevronLeft, ChevronRight, ChevronDown, Check, Trash2, Download, Send, Sparkles, Loader2, Plus, Building2, MapPin, ExternalLink } from "lucide-react";

interface CpqQuoteDetailProps {
  quoteId: string;
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
  const [docAiTab, setDocAiTab] = useState<"description" | "service">("description");
  const [docPreviewOpen, setDocPreviewOpen] = useState(false);

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
          setCrmInstallations((prev) => [
            ...prev,
            {
              id: created.id,
              name: created.name,
              address: created.address ?? null,
              commune: created.commune ?? null,
              city: created.city ?? null,
              lat: created.lat ?? null,
              lng: created.lng ?? null,
            },
          ]);
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

  const selectedInstallation = useMemo(
    () =>
      crmContext.installationId
        ? crmInstallations.find((installation) => installation.id === crmContext.installationId) ?? null
        : null,
    [crmContext.installationId, crmInstallations]
  );

  const selectedInstallationAddress = useMemo(() => {
    if (!selectedInstallation) return "";
    return [selectedInstallation.address, selectedInstallation.commune, selectedInstallation.city]
      .filter((part): part is string => Boolean(part && part.trim()))
      .join(", ");
  }, [selectedInstallation]);

  const selectedInstallationMapsUrl = useMemo(() => {
    if (!selectedInstallation) return "";
    if (selectedInstallation.lat != null && selectedInstallation.lng != null) {
      return `https://www.google.com/maps/search/?api=1&query=${selectedInstallation.lat},${selectedInstallation.lng}`;
    }
    if (selectedInstallationAddress) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedInstallationAddress)}`;
    }
    return "";
  }, [selectedInstallation, selectedInstallationAddress]);

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
    <div className="space-y-2 pb-14">
      {/* ── Compact header ── */}
      <div className="flex items-center gap-2 min-h-[40px]">
        <Link href="/crm/cotizaciones">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold truncate">{quote.code}</h1>
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
          {quote.status === "sent" ? (
            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setStatusChangePending("draft")} disabled={changingStatus}>
              {changingStatus ? "..." : "Borrador"}
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10" onClick={() => setStatusChangePending("sent")} disabled={changingStatus}>
              {changingStatus ? "..." : "Enviada"}
            </Button>
          )}
          <Button size="icon" variant="outline" className="h-7 w-7" onClick={handleDownloadPdf} disabled={downloadingPdf || !quote} title="PDF">
            <Download className="h-3.5 w-3.5" />
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
          {/* Overflow menu for secondary actions */}
          <div className="relative group">
            <Button size="icon" variant="ghost" className="h-7 w-7">
              <Layers className="h-3.5 w-3.5" />
            </Button>
            <div className="absolute right-0 top-full mt-1 z-30 hidden group-focus-within:block hover:block min-w-[160px] rounded-md border bg-popover p-1 shadow-md">
              <button className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent" onClick={handleClone} disabled={cloning}>
                <Copy className="h-3.5 w-3.5" /> {cloning ? "Clonando..." : "Clonar"}
              </button>
              <button className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent" onClick={handleSendDotacionToInstallation} disabled={sendingDotacion || !crmContext.installationId || positions.length === 0}>
                <Building2 className="h-3.5 w-3.5" /> {sendingDotacion ? "Enviando..." : "Enviar dotación"}
              </button>
              <button className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent" onClick={refresh}>
                <RefreshCw className="h-3.5 w-3.5" /> Refrescar
              </button>
              <button className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-destructive hover:bg-accent" onClick={() => setDeleteConfirmOpen(true)} disabled={deleting || isLocked}>
                <Trash2 className="h-3.5 w-3.5" /> {deleting ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <Stepper steps={steps} currentStep={activeStep} onStepClick={goToStep} />

      {/* ── KPI strip compacta (sin scroll horizontal) ── */}
      <div className="grid grid-cols-2 gap-1.5 py-1 sm:grid-cols-5">
        <div className="rounded-md border border-border/60 bg-muted/20 px-2 py-1.5">
          <p className="text-[10px] uppercase text-muted-foreground">Puestos</p>
          <p className="text-xs font-bold font-mono">{positions.length}</p>
        </div>
        <div className="rounded-md border border-border/60 bg-muted/20 px-2 py-1.5">
          <p className="text-[10px] uppercase text-muted-foreground">Guardias</p>
          <p className="text-xs font-bold font-mono">{stats.totalGuards}</p>
        </div>
        <div className="rounded-md border border-border/60 bg-muted/20 px-2 py-1.5">
          <p className="text-[10px] uppercase text-muted-foreground">Costo</p>
          <p className="text-xs font-bold font-mono truncate">{formatCurrency(monthlyTotal)}</p>
        </div>
        <div className="rounded-md border border-border/60 bg-muted/20 px-2 py-1.5">
          <p className="text-[10px] uppercase text-muted-foreground">Margen</p>
          <p className="text-xs font-bold font-mono">{formatNumber(marginPct, { minDecimals: 1, maxDecimals: 1 })}%</p>
        </div>
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2 py-1.5 col-span-2 sm:col-span-1">
          <p className="text-[10px] uppercase text-emerald-600 dark:text-emerald-400">Venta</p>
          <p className="text-xs font-bold font-mono text-emerald-700 dark:text-emerald-400 truncate">{formatCLP(salePriceMonthly)}</p>
          {ufValue && ufValue > 0 && (
            <p className="text-[10px] font-semibold text-emerald-600/70 dark:text-emerald-400/70 truncate">{formatUFSuffix(clpToUf(salePriceMonthly, ufValue))}</p>
          )}
        </div>
      </div>

      {activeStep === 0 && (
        <div className="space-y-2">
          <div className="space-y-2" inert={isLocked}>
            {/* ── CRM Context: compact 2-col grid ── */}
            <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Cuenta</Label>
              <div className="flex gap-0.5">
                <Select
                  value={crmContext.accountId || "__none__"}
                  onValueChange={(val) => {
                    const accountId = val === "__none__" ? "" : val;
                    const account = crmAccounts.find((a) => a.id === accountId);
                    saveCrmContext({ accountId, installationId: "", contactId: "", dealId: "" });
                    if (account) {
                      setQuoteForm((prev) => ({ ...prev, clientName: account.name }));
                      setQuoteDirty(true);
                    }
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Seleccionar...</SelectItem>
                    {crmAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => { setInlineForm({ name: "", firstName: "", lastName: "", email: "", title: "", address: "", city: "", commune: "", lat: null, lng: null }); setInlineCreateType("account"); }}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Instalación</Label>
              <div className="flex gap-0.5">
                <Select
                  value={crmContext.installationId || "__none__"}
                  onValueChange={(val) => saveCrmContext({ installationId: val === "__none__" ? "" : val })}
                  disabled={!crmContext.accountId}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Seleccionar...</SelectItem>
                    {crmInstallations.map((i) => (
                      <SelectItem key={i.id} value={i.id}>{i.name}{i.city ? ` (${i.city})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" disabled={!crmContext.accountId} onClick={() => { setInlineForm({ name: "", firstName: "", lastName: "", email: "", title: "", address: "", city: "", commune: "", lat: null, lng: null }); setInlineCreateType("installation"); }}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Contacto</Label>
              <div className="flex gap-0.5">
                <Select
                  value={crmContext.contactId || "__none__"}
                  onValueChange={(val) => saveCrmContext({ contactId: val === "__none__" ? "" : val })}
                  disabled={!crmContext.accountId}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Seleccionar...</SelectItem>
                    {crmContacts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName}{c.email ? ` (${c.email})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" disabled={!crmContext.accountId} onClick={() => { setInlineForm({ name: "", firstName: "", lastName: "", email: "", title: "", address: "", city: "", commune: "", lat: null, lng: null }); setInlineCreateType("contact"); }}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Negocio</Label>
              <div className="flex gap-0.5">
                <Select
                  value={crmContext.dealId || "__none__"}
                  onValueChange={(val) => saveCrmContext({ dealId: val === "__none__" ? "" : val })}
                  disabled={!crmContext.accountId}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Seleccionar...</SelectItem>
                    {crmDeals.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" disabled={!crmContext.accountId} onClick={() => { setInlineForm({ name: "", firstName: "", lastName: "", email: "", title: "", address: "", city: "", commune: "", lat: null, lng: null }); setInlineCreateType("deal"); }}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

          </div>

          {/* ── Inline Create Modal (unchanged logic) ── */}
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

          {/* ── Date + Currency in a single compact row ── */}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Válida hasta</Label>
              <Input
                type="date"
                value={quoteForm.validUntil}
                onChange={(e) => {
                  setQuoteForm((prev) => ({ ...prev, validUntil: e.target.value }));
                  setQuoteDirty(true);
                }}
                className="h-8 bg-background text-xs text-foreground [color-scheme:dark]"
              />
            </div>
            <div className="shrink-0">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Moneda</Label>
              <div className="flex gap-0.5">
                {["CLP", "UF"].map((cur) => (
                  <button
                    key={cur}
                    type="button"
                    onClick={() => saveCrmContext({ currency: cur })}
                    className={cn(
                      "rounded-md px-3 h-8 text-xs font-medium border transition-colors",
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
            <Button
              size="sm"
              variant={quoteDirty ? "default" : "outline"}
              className="h-8 px-3 text-xs shrink-0"
              onClick={() => saveQuoteBasics()}
              disabled={!quoteDirty || savingQuote}
            >
              {savingQuote ? "..." : quoteDirty ? "Guardar" : "Guardado"}
            </Button>
          </div>

          {quoteError && (
            <div className="text-[11px] text-red-400">{quoteError}</div>
          )}

          </div>

          {crmContext.installationId && (
            <div className="rounded-md border border-border/60 bg-muted/20 px-2.5 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                    Ubicación de instalación
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-foreground truncate">
                    {selectedInstallation?.name || "Instalación seleccionada"}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground break-words">
                    {selectedInstallationAddress || "Sin dirección registrada"}
                  </p>
                </div>
                {selectedInstallationMapsUrl ? (
                  <button
                    type="button"
                    onClick={() => window.open(selectedInstallationMapsUrl, "_blank", "noopener,noreferrer")}
                    className="shrink-0 inline-flex items-center gap-1 rounded-md border border-border/70 bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    <MapPin className="h-3 w-3" />
                    Ver dirección de instalación
                    <ExternalLink className="h-3 w-3" />
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}

      {activeStep === 1 && (
        <div className="space-y-1.5" inert={isLocked}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold">Puestos</span>
              {positions.length > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  Total: <span className="font-mono font-semibold text-foreground">{formatCurrency(positions.reduce((sum, p) => sum + Number(p.monthlyPositionCost), 0))}</span>
                </span>
              )}
            </div>
            <CreatePositionModal quoteId={quoteId} onCreated={refresh} disabled={isLocked} />
          </div>

          {positions.length === 0 ? (
            <EmptyState
              icon={<Users className="h-6 w-6" />}
              title="Sin puestos"
              description="Agrega el primer puesto para comenzar."
              compact
            />
          ) : (
            <div className="space-y-1.5">
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
        </div>
      )}

      {activeStep === 2 && (
        <div inert={isLocked}>
          <CpqQuoteCosts quoteId={quoteId} variant="inline" showFinancial={false} readOnly={isLocked} />
        </div>
      )}

      {activeStep === 3 && (
        <div className="space-y-2" inert={isLocked}>
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

          {/* ── Financials: compact 2-col side-by-side ── */}
          <Card className="p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold">Gastos financieros</h2>
              <Button
                size="sm"
                className="h-7 px-2.5 text-[11px]"
                onClick={handleSaveFinancials}
                disabled={savingFinancials || !costParams}
              >
                {savingFinancials ? "..." : "Guardar"}
              </Button>
            </div>

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

              {/* Póliza */}
              <div className="space-y-1.5 rounded-md border border-border/40 bg-muted/10 p-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold">Póliza</span>
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
                    <Label className="text-[10px] text-muted-foreground">% Póliza</Label>
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
          </Card>
        </div>
      )}

      {/* ── Step 5: Documento ── */}
      {activeStep === 4 && (
        <div className="space-y-2" inert={isLocked}>
          {/* ── Action bar: PDF + Send (always visible, top) ── */}
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 h-9 gap-1.5 text-xs"
              onClick={handleDownloadPdf}
              disabled={downloadingPdf || !quote}
            >
              <Download className="h-3.5 w-3.5" />
              {downloadingPdf ? "Generando..." : "PDF"}
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

          {/* ── AI sections as tabs ── */}
          <Card className="p-2.5 space-y-2">
            <div className="inline-flex rounded-md border border-border overflow-hidden">
              <button
                type="button"
                className={cn("px-3 py-1.5 text-xs font-medium transition-colors", docAiTab === "description" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent/50")}
                onClick={() => setDocAiTab("description")}
              >
                Descripción AI
              </button>
              <button
                type="button"
                className={cn("px-3 py-1.5 text-xs font-medium border-l border-border transition-colors", docAiTab === "service" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent/50")}
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
                    className="h-7 text-xs flex-1"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-[11px] shrink-0"
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
                    fetch(`/api/cpq/quotes/${quoteId}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ aiDescription: e.target.value }),
                    }).catch(() => {});
                  }}
                  placeholder="Clic en 'Generar' para crear una descripción profesional..."
                  className="w-full min-h-[80px] rounded-md border border-input bg-background px-2.5 py-1.5 text-xs resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  rows={4}
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
                    className="h-7 text-xs flex-1"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-[11px] shrink-0"
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
                    setQuote({ ...quote, serviceDetail: e.target.value });
                    fetch(`/api/cpq/quotes/${quoteId}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ serviceDetail: e.target.value }),
                    }).catch(() => {});
                  }}
                  placeholder="Clic en 'Generar' para detalle de servicios..."
                  className="w-full min-h-[80px] rounded-md border border-input bg-background px-2.5 py-1.5 text-xs resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  rows={4}
                />
              </div>
            )}
          </Card>

          {/* ── Document Preview: collapsible ── */}
          <div className="rounded-md border border-border/40 overflow-hidden">
            <button
              type="button"
              className="flex w-full items-center justify-between bg-muted/20 px-3 py-2 hover:bg-muted/30 transition-colors"
              onClick={() => setDocPreviewOpen(!docPreviewOpen)}
            >
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Vista previa</span>
              <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", docPreviewOpen && "rotate-180")} />
            </button>
            {docPreviewOpen && (
              <div className="p-3 space-y-2 bg-white text-black text-xs" style={{ fontFamily: "Arial, sans-serif" }}>
                <div className="flex justify-between items-start border-b-2 pb-1.5" style={{ borderColor: "#2563eb" }}>
                  <div className="text-sm font-bold" style={{ color: "#1e3a5f" }}>GARD SECURITY</div>
                  <div className="text-right text-[10px] text-gray-600">
                    <p className="font-bold text-xs text-black">{quote.code}</p>
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

                {(crmContext.dealId || crmContext.installationId) && (
                  <div className="text-[10px] rounded" style={{ padding: "4px 8px", background: "#f0fdf4", borderLeft: "3px solid #2563eb", color: "#333" }}>
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
                  <p className="text-[10px] text-gray-600 bg-blue-50 rounded p-1.5 italic">{quote.aiDescription}</p>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr style={{ background: "#eff6ff" }}>
                        <th className="text-left p-1 font-semibold">Puesto</th>
                        <th className="text-left p-1 font-semibold">G</th>
                        <th className="text-left p-1 font-semibold">Cant</th>
                        <th className="text-left p-1 font-semibold">Días</th>
                        <th className="text-left p-1 font-semibold">Horario</th>
                        <th className="text-right p-1 font-semibold">Precio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map((pos) => {
                        const clp = positionSalePrices.get(pos.id) ?? Number(pos.monthlyPositionCost);
                        const formatted =
                          crmContext.currency === "UF" && ufValue && ufValue > 0
                            ? formatUFSuffix(clpToUf(clp, ufValue))
                            : formatCLP(clp);
                        return (
                          <tr key={pos.id} className="border-b border-gray-100">
                            <td className="p-1">{pos.customName || pos.puestoTrabajo?.name || "Puesto"}</td>
                            <td className="p-1">{pos.numGuards}</td>
                            <td className="p-1">{pos.numPuestos || 1}</td>
                            <td className="p-1">{formatWeekdaysShort(pos.weekdays)}</td>
                            <td className="p-1">{pos.startTime}-{pos.endTime}</td>
                            <td className="p-1 text-right">{formatted}</td>
                          </tr>
                        );
                      })}
                      <tr className="font-bold border-t-2" style={{ borderColor: "#2563eb", background: "#eff6ff" }}>
                        <td colSpan={5} className="p-1 text-right">Total</td>
                        <td className="p-1 text-right">
                          {crmContext.currency === "UF" && ufValue && ufValue > 0
                            ? formatUFSuffix(clpToUf(salePriceMonthly, ufValue))
                            : formatCLP(salePriceMonthly)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {quote.serviceDetail && (
                  <div>
                    <p className="text-[10px] font-semibold border-b pb-0.5 mb-1" style={{ color: "#1e3a5f" }}>Detalle del servicio</p>
                    <div className="text-[10px] text-gray-700 whitespace-pre-line leading-relaxed">{quote.serviceDetail}</div>
                  </div>
                )}

                <div className="text-center text-[9px] text-gray-400 border-t pt-1">
                  Generado el {new Date().toLocaleDateString("es-CL")} · www.gard.cl
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="sticky bottom-0 z-20 -mx-4 border-t border-border/60 bg-background/95 px-4 py-1.5 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1 px-2 text-xs"
            onClick={() => void goToStep(activeStep - 1)}
            disabled={activeStep === 0}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Atrás</span>
          </Button>
          <span className="text-[11px] text-muted-foreground">
            {activeStep + 1}/{steps.length}
          </span>
          <Button
            size="sm"
            className="h-8 gap-1 px-3 text-xs"
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
            {!isLastStep && <ChevronRight className="h-3.5 w-3.5" />}
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
