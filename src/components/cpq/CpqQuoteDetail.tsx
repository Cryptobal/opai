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
import { EmptyState } from "@/components/opai/EmptyState";
import { CreatePositionModal } from "@/components/cpq/CreatePositionModal";
import { CpqPositionCard } from "@/components/cpq/CpqPositionCard";
import { CpqQuoteCosts } from "@/components/cpq/CpqQuoteCosts";
import { SendCpqQuoteModal } from "@/components/cpq/SendCpqQuoteModal";
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
import { ArrowLeft, Copy, RefreshCw, Users, MoreVertical, Trash2, Download, Loader2, Building2 } from "lucide-react";
import { DatosSection } from "@/components/cpq/DatosSection";
import MarginSection from "@/components/cpq/MarginSection";
import { FinancialPanel } from "@/components/cpq/FinancialPanel";
import { MobileBottomBar } from "@/components/cpq/MobileBottomBar";

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
  const [cloning, setCloning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);
  const [statusChangePending, setStatusChangePending] = useState<"draft" | "sent" | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [sendingDotacion, setSendingDotacion] = useState(false);
  const [sendingPortal, setSendingPortal] = useState(false);
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
  const [generatingAi, setGeneratingAi] = useState(false);
  const [generatingServiceDetail, setGeneratingServiceDetail] = useState(false);
  const [ufValue, setUfValue] = useState<number | null>(null);
  const [aiCustomInstruction, setAiCustomInstruction] = useState("");
  const [serviceDetailInstruction, setServiceDetailInstruction] = useState("");

  const isLocked = quote?.status === "sent";
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
        setAdditionalLines(costsData.data.additionalLines || []);
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

  // Auto-calc salePriceBase when costSummary changes (no longer depends on activeStep)
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
    setQuoteForm({
      name: quote.name || "",
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
      toast.success(aiCustomInstruction.trim() ? "Descripcion refinada con AI" : "Descripcion generada con AI");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo generar la descripcion AI");
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
          name: quoteForm.name || null,
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
    } catch (error) {
      console.error("Error saving CPQ quote:", error);
      setQuoteError("No se pudo guardar la cotizacion.");
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
      toast.success("Abre el dialogo de impresion y elige <<Guardar como PDF>>");
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

  const handleSendPortal = async () => {
    if (!quote || !crmContext.accountId || !crmContext.contactId || !crmContext.dealId) {
      toast.error("Asigna cuenta, contacto y negocio antes de enviar por portal");
      return;
    }
    setSendingPortal(true);
    try {
      const response = await fetch(`/api/cpq/quotes/${quoteId}/send-portal`, {
        method: "POST",
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo enviar por portal");
      }

      toast.success(
        `Invitacion enviada a ${payload.data.sentTo}. ${payload.data.pinGenerated ? "Se genero PIN de acceso." : "PIN existente."}`
      );
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

  // Margin amount calculation
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

  // Additional lines total (pass-through, no margin)
  const additionalLinesTotal = useMemo(
    () => additionalLines.reduce((s, l) => s + Number(l.precio || 0), 0),
    [additionalLines]
  );

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

  // Margin change handler (used by MarginSection)
  const handleMarginChange = async (newMargin: number) => {
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
    <div className="space-y-2 pb-20 lg:pb-4">
      {/* -- Compact header -- */}
      <div className="sticky top-[53px] z-30 bg-background/95 backdrop-blur-xl border-b border-border/40 -mx-5 px-5 py-2.5 mb-4">
      <div className="flex items-center gap-2 min-h-[40px]">
        <Link href="/crm/cotizaciones">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold tracking-tight truncate">{quote.code}</h1>
            {quote.name && <span className="text-sm font-medium truncate text-foreground/80">— {quote.name}</span>}
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

      {/* -- 2-column layout: scrollable editor + sticky sidebar -- */}
      <div className="lg:grid lg:grid-cols-[1fr_380px] lg:gap-0">

      {/* -- Editor: scrollable left column -- */}
      <div className="space-y-0 min-w-0 lg:pr-6">

      {/* -- Section: Datos -- */}
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

      {/* -- Section: Puestos -- */}
      <div className="border-t border-border/10 mt-7 pt-5" inert={isLocked}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h2 className="text-[17px] font-bold tracking-tight">Puestos</h2>
            {positions.length > 0 && (
              <span className="text-xs text-muted-foreground">
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

        {positions.length > 0 && (
          <div className="flex justify-between items-center px-3 py-2 border border-dashed border-border/60 rounded-lg mt-2">
            <span className="text-xs font-semibold text-muted-foreground">Total mano de obra</span>
            <span className="text-sm font-bold tabular-nums">
              {formatCurrency(positions.reduce((sum, p) => sum + Number(p.monthlyPositionCost), 0))}
            </span>
          </div>
        )}
      </div>

      {/* -- Section: Costos -- */}
      <div className="border-t border-border/10 mt-7 pt-5" inert={isLocked}>
        <CpqQuoteCosts quoteId={quoteId} variant="inline" showFinancial={false} readOnly={isLocked} onAdditionalLinesChange={setAdditionalLines} />
      </div>

      {/* -- Section: Margen -- */}
      <div className="border-t border-border/10 mt-7 pt-5" inert={isLocked}>
        <MarginSection
          marginPct={marginPct}
          onMarginChange={handleMarginChange}
          marginAmount={marginAmount}
          isLocked={isLocked}
        />
      </div>

      {/* -- Section: Financials (financial + policy cards) -- */}
      <div className="border-t border-border/10 mt-7 pt-5" inert={isLocked}>
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
        </Card>
      </div>

      </div>{/* end editor column */}

      {/* -- Sidebar: sticky right column (desktop only) -- */}
      <aside className="hidden lg:flex flex-col sticky top-[105px] h-[calc(100vh-105px)] border-l border-border/40 overflow-y-auto pl-4">
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
          quote={quote}
          crmContext={crmContext}
          crmContacts={crmContacts}
          crmInstallations={crmInstallations}
          crmDeals={crmDeals}
          additionalLines={additionalLines}
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
          contactName={(() => {
            const c = crmContext.contactId ? crmContacts.find((x) => x.id === crmContext.contactId) : null;
            return c ? `${c.firstName} ${c.lastName}`.trim() : undefined;
          })()}
          contactEmail={(() => {
            const c = crmContext.contactId ? crmContacts.find((x) => x.id === crmContext.contactId) : null;
            return c?.email || undefined;
          })()}
        />
      </aside>

      </div>{/* end 2-column grid */}

      {/* -- Mobile bottom bar (replaces wizard nav) -- */}
      <MobileBottomBar
        className="lg:hidden"
        salePriceMonthly={salePriceMonthly}
        additionalLinesTotal={additionalLinesTotal}
        marginPct={marginPct}
        ufValue={ufValue}
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
            quote={quote}
            crmContext={crmContext}
            crmContacts={crmContacts}
            crmInstallations={crmInstallations}
            crmDeals={crmDeals}
            additionalLines={additionalLines}
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
        sendButton={
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
        }
      />

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
