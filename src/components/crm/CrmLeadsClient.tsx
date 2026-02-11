/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CrmLead } from "@/types";
import { Plus, Loader2, AlertTriangle, Trash2, ChevronRight, UserPlus, Phone, Mail, MessageSquare, Clock, Users, Calendar, Briefcase, MapPin, X, Copy } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/opai/StatusBadge";
import { EmptyState } from "@/components/opai/EmptyState";
import { CrmDates } from "@/components/crm/CrmDates";
import { CrmToolbar } from "./CrmToolbar";
import type { ViewMode } from "./ViewToggle";
import { AddressAutocomplete, type AddressResult } from "@/components/ui/AddressAutocomplete";
import { toast } from "sonner";
import { formatNumber, parseLocalizedNumber } from "@/lib/utils";
import { resolveDocument, tiptapToPlainText } from "@/lib/docs/token-resolver";

/* ─── Dotación & Installation draft types ─── */

type DotacionItem = {
  puestoTrabajoId?: string;
  puesto: string;
  customName?: string;
  cargoId?: string;
  rolId?: string;
  baseSalary?: number;
  shiftType?: "day" | "night";
  cantidad: number;
  horaInicio: string;
  horaFin: string;
  dias: string[];
};

type InstallationDraft = {
  _key: string; // client-side key
  name: string;
  address: string;
  city: string;
  commune: string;
  lat?: number;
  lng?: number;
  dotacion: DotacionItem[];
};

const WEEKDAYS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
const WEEKDAYS_SHORT: Record<string, string> = {
  lunes: "Lu", martes: "Ma", miercoles: "Mi", jueves: "Ju", viernes: "Vi", sabado: "Sa", domingo: "Do",
};
const DAY_START_OPTIONS = ["07:00", "07:30", "08:00", "08:30", "09:00", "09:30"] as const;

type CpqCatalogOption = { id: string; name: string };

/** Normaliza días que vienen del lead (ej. "Lunes", "Miércoles") al formato interno (minúsculas, sin tilde). */
function normalizeLeadDias(dias: string[] | undefined): string[] {
  if (!dias || dias.length === 0) return [...WEEKDAYS];
  const map: Record<string, string> = {
    lunes: "lunes", Lunes: "lunes", LUNES: "lunes",
    martes: "martes", Martes: "martes", MARTES: "martes",
    miercoles: "miercoles", Miercoles: "miercoles", "Miércoles": "miercoles", MIERCOLES: "miercoles",
    jueves: "jueves", Jueves: "jueves", JUEVES: "jueves",
    viernes: "viernes", Viernes: "viernes", VIERNES: "viernes",
    sabado: "sabado", Sabado: "sabado", "Sábado": "sabado", SABADO: "sabado",
    domingo: "domingo", Domingo: "domingo", DOMINGO: "domingo",
  };
  const normalized = dias
    .map((d) => (d != null && typeof d === "string" ? map[d.trim()] : undefined))
    .filter((x): x is string => Boolean(x));
  const unique = [...new Set(normalized)];
  return unique.length > 0 ? unique : [...WEEKDAYS];
}

function toMinutes(value: string): number | null {
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function minutesToTime(total: number): string {
  const normalized = ((total % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function normalizeTimeToHHmm(value: unknown, fallback = "08:00"): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const raw = value.trim().toLowerCase();
  const match = raw.match(/^(\d{1,2}):(\d{2})(?:\s*(a\.?\s*m\.?|p\.?\s*m\.?))?$/i);
  if (!match) return fallback;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const suffix = match[3]?.toLowerCase().replace(/\s|\./g, "") || "";
  if (Number.isNaN(hour) || Number.isNaN(minute) || minute < 0 || minute > 59) return fallback;
  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  if (hour < 0 || hour > 23) return fallback;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function inferShiftType(horaInicio: string, horaFin: string): "day" | "night" {
  const start = normalizeTimeToHHmm(horaInicio, "08:00");
  const end = normalizeTimeToHHmm(horaFin, "20:00");
  if (start === "20:00" && end === "08:00") return "night";
  const startMin = toMinutes(start);
  const endMin = toMinutes(end);
  if (startMin == null || endMin == null) return "day";
  if (endMin <= startMin) return "night";
  return "day";
}

let _installationCounter = 0;
function newInstallationKey() { return `inst_${++_installationCounter}_${Date.now()}`; }

function createEmptyInstallation(name = "", address = "", city = "", commune = ""): InstallationDraft {
  return { _key: newInstallationKey(), name, address, city, commune, dotacion: [] };
}

function createEmptyDotacion(defaultCargoId = "", defaultRolId = ""): DotacionItem {
  return {
    puestoTrabajoId: "",
    puesto: "",
    customName: "",
    cargoId: defaultCargoId,
    rolId: defaultRolId,
    baseSalary: 550000,
    shiftType: "day",
    cantidad: 1,
    horaInicio: "08:00",
    horaFin: "20:00",
    dias: [...WEEKDAYS],
  };
}

/* ─── Form types ─── */

type LeadFormState = {
  companyName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  source: string;
};

// Dominios genéricos que NO deben usarse como página web de la empresa
const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "outlook.com", "outlook.es",
  "yahoo.com", "yahoo.es", "live.com", "live.cl", "msn.com",
  "icloud.com", "me.com", "mac.com", "protonmail.com", "proton.me",
  "mail.com", "aol.com", "zoho.com", "yandex.com", "tutanota.com",
]);

/** Extrae dominio del email y retorna URL si no es genérico */
function extractWebsiteFromEmail(email: string): string {
  if (!email) return "";
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain || GENERIC_EMAIL_DOMAINS.has(domain)) return "";
  return `https://${domain}`;
}

/** Normaliza teléfono para tel: (solo dígitos) */
function telHref(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 0) return "";
  return `tel:${digits.length <= 9 ? "+56" + digits : "+" + digits}`;
}

/** URL WhatsApp Chile: +56 9 XXXXXXXX */
function whatsappHref(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 0) return "";
  const withCountry = digits.length === 9 && digits.startsWith("9") ? "56" + digits : digits.length >= 10 ? digits : "56" + digits;
  return `https://wa.me/${withCountry}`;
}

type ApproveFormState = {
  accountName: string;
  contactFirstName: string;
  contactLastName: string;
  email: string;
  phone: string;
  dealTitle: string;
  rut: string;
  industry: string;
  segment: string;
  roleTitle: string;
  website: string;
  companyInfo: string;
  notes: string;
};

const DEFAULT_FORM: LeadFormState = {
  companyName: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  source: "",
};

type DuplicateAccount = { id: string; name: string; rut?: string | null; type?: string };
type ExistingContact = { id: string; firstName: string | null; lastName: string | null; email: string | null };
type InstallationConflict = { name: string; id: string };
type DocTemplateForReject = { id: string; name: string; content: unknown; module: string };

type LeadStatusFilter = "all" | "pending" | "approved" | "rejected";
type LeadRejectReason =
  | "spot_service"
  | "out_of_scope"
  | "no_budget"
  | "duplicate"
  | "no_response"
  | "other";

const REJECTION_REASON_OPTIONS: { value: LeadRejectReason; label: string }[] = [
  { value: "spot_service", label: "Servicio spot" },
  { value: "out_of_scope", label: "Fuera de perfil / alcance" },
  { value: "no_budget", label: "Sin presupuesto" },
  { value: "duplicate", label: "Duplicado" },
  { value: "no_response", label: "Sin respuesta" },
  { value: "other", label: "Otro" },
];

type LeadRejectReasonFilter = "all" | LeadRejectReason;

function getLeadRejectReasonLabel(value: LeadRejectReasonFilter): string {
  if (value === "all") return "Todos";
  return REJECTION_REASON_OPTIONS.find((opt) => opt.value === value)?.label ?? value;
}

function getLeadRejectReasonFromMetadata(metadata: unknown): LeadRejectReason | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const rejection = (metadata as Record<string, unknown>).rejection;
  if (!rejection || typeof rejection !== "object" || Array.isArray(rejection)) return null;
  const reason = (rejection as Record<string, unknown>).reason;
  if (typeof reason !== "string") return null;
  const validReasons = new Set<LeadRejectReason>([
    "spot_service",
    "out_of_scope",
    "no_budget",
    "duplicate",
    "no_response",
    "other",
  ]);
  return validReasons.has(reason as LeadRejectReason) ? (reason as LeadRejectReason) : null;
}

function getLeadRejectionInfo(metadata: unknown): {
  emailSent: boolean;
  emailProviderMessageId: string | null;
  note: string | null;
} | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const rejection = (metadata as Record<string, unknown>).rejection;
  if (!rejection || typeof rejection !== "object" || Array.isArray(rejection)) return null;
  const emailSent = Boolean((rejection as Record<string, unknown>).emailSent);
  const messageId = (rejection as Record<string, unknown>).emailProviderMessageId;
  const note = (rejection as Record<string, unknown>).note;
  return {
    emailSent,
    emailProviderMessageId: typeof messageId === "string" && messageId.trim() ? messageId : null,
    note: typeof note === "string" && note.trim() ? note.trim() : null,
  };
}

function getLeadFilterLabel(filter: LeadStatusFilter): string | null {
  if (filter === "pending") return "Mostrando leads pendientes";
  if (filter === "approved") return "Mostrando leads aprobados";
  if (filter === "rejected") return "Mostrando leads rechazados";
  return null;
}

export function CrmLeadsClient({
  initialLeads,
  initialStatusFilter = "all",
}: {
  initialLeads: CrmLead[];
  initialStatusFilter?: LeadStatusFilter;
}) {
  const [leads, setLeads] = useState<CrmLead[]>(initialLeads);
  const [form, setForm] = useState<LeadFormState>(DEFAULT_FORM);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatusFilter>(initialStatusFilter);
  const [sort, setSort] = useState("newest");
  const [view, setView] = useState<ViewMode>("list");

  // Approve modal state
  const [approveOpen, setApproveOpen] = useState(false);
  const [approveLeadId, setApproveLeadId] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateAccount[]>([]);
  const [existingContact, setExistingContact] = useState<ExistingContact | null>(null);
  const [installationConflicts, setInstallationConflicts] = useState<InstallationConflict[]>([]);
  const [duplicateChecked, setDuplicateChecked] = useState(false);
  const [useExistingAccountId, setUseExistingAccountId] = useState<string | null>(null);
  const [contactResolution, setContactResolution] = useState<"create" | "overwrite" | "use_existing">("create");
  const [installationUseExisting, setInstallationUseExisting] = useState<Record<string, string>>({}); // instKey -> installation id to use
  const [approveForm, setApproveForm] = useState<ApproveFormState>({
    accountName: "",
    contactFirstName: "",
    contactLastName: "",
    email: "",
    phone: "",
    dealTitle: "",
    rut: "",
    industry: "",
    segment: "",
    roleTitle: "",
    website: "",
    companyInfo: "",
    notes: "",
  });
  const [installations, setInstallations] = useState<InstallationDraft[]>([]);

  const [industries, setIndustries] = useState<{ id: string; name: string }[]>([]);
  const [docTemplatesReject, setDocTemplatesReject] = useState<DocTemplateForReject[]>([]);
  const [cpqPuestos, setCpqPuestos] = useState<CpqCatalogOption[]>([]);
  const [cpqCargos, setCpqCargos] = useState<CpqCatalogOption[]>([]);
  const [cpqRoles, setCpqRoles] = useState<CpqCatalogOption[]>([]);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectLeadId, setRejectLeadId] = useState<string | null>(null);
  const [rejectLeadData, setRejectLeadData] = useState<CrmLead | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState<LeadRejectReason>("other");
  const [rejectNote, setRejectNote] = useState("");
  const [rejectSendEmail, setRejectSendEmail] = useState(false);
  const [rejectTemplateId, setRejectTemplateId] = useState<string>("");
  const [rejectEmailSubject, setRejectEmailSubject] = useState("");
  const [rejectEmailBody, setRejectEmailBody] = useState("");
  const [rejectReasonFilter, setRejectReasonFilter] = useState<LeadRejectReasonFilter>("all");
  const [enrichingCompanyInfo, setEnrichingCompanyInfo] = useState(false);
  const [detectedCompanyLogoUrl, setDetectedCompanyLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/crm/industries?active=true")
      .then((r) => r.json())
      .then((res) => res.success && setIndustries(res.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/docs/templates?active=true")
      .then((r) => r.json())
      .then((res) => {
        if (res?.success) {
          const all = (res.data || []) as DocTemplateForReject[];
          const forReject = all.filter((t) => t.module === "crm" || t.module === "mail");
          setDocTemplatesReject(forReject);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/cpq/puestos?active=true").then((r) => r.json()),
      fetch("/api/cpq/cargos?active=true").then((r) => r.json()),
      fetch("/api/cpq/roles?active=true").then((r) => r.json()),
    ])
      .then(([puestosRes, cargosRes, rolesRes]) => {
        if (puestosRes?.success) setCpqPuestos(puestosRes.data || []);
        if (cargosRes?.success) setCpqCargos(cargosRes.data || []);
        if (rolesRes?.success) setCpqRoles(rolesRes.data || []);
      })
      .catch(() => {});
  }, []);

  const defaultCargoId = useMemo(
    () => cpqCargos.find((c) => c.name.toLowerCase().includes("guardia"))?.id || cpqCargos[0]?.id || "",
    [cpqCargos]
  );
  const defaultRolId = useMemo(
    () => cpqRoles.find((r) => r.name.trim().toLowerCase() === "2x5")?.id || cpqRoles[0]?.id || "",
    [cpqRoles]
  );

  const inputClassName =
    "bg-background text-foreground placeholder:text-muted-foreground border-input focus-visible:ring-ring";
  const selectClassName =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
  const selectCompactClassName =
    "flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  useEffect(() => {
    if (!approveOpen) return;
    if (!defaultCargoId && !defaultRolId) return;
    setInstallations((prev) =>
      prev.map((inst) => ({
        ...inst,
        dotacion: inst.dotacion.map((dot) => ({
          ...dot,
          cargoId: dot.cargoId || defaultCargoId,
          rolId: dot.rolId || defaultRolId,
          baseSalary: dot.baseSalary || 550000,
          shiftType: dot.shiftType || inferShiftType(dot.horaInicio, dot.horaFin),
        })),
      }))
    );
  }, [approveOpen, defaultCargoId, defaultRolId]);

  const counts = useMemo(() => ({
    total: leads.filter((l) => l.status !== "approved").length,
    pending: leads.filter((l) => l.status === "pending").length,
    approved: leads.filter((l) => l.status === "approved").length,
    rejected: leads.filter((l) => l.status === "rejected").length,
  }), [leads]);

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = leads.filter((lead) => {
      // "all" muestra solo pendientes + rechazados (aprobados ya son cuentas)
      if (statusFilter === "all" && lead.status === "approved") return false;
      if (statusFilter !== "all" && lead.status !== statusFilter) return false;
      if (q) {
        const searchable = `${lead.companyName || ""} ${lead.firstName || ""} ${lead.lastName || ""} ${lead.email || ""}`.toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      return true;
    });

    if (statusFilter === "rejected" && rejectReasonFilter !== "all") {
      result = result.filter(
        (lead) => getLeadRejectReasonFromMetadata(lead.metadata) === rejectReasonFilter
      );
    }

    result = [...result].sort((a, b) => {
      switch (sort) {
        case "oldest":
          return (a.createdAt || "").localeCompare(b.createdAt || "");
        case "az":
          return (a.companyName || "").localeCompare(b.companyName || "");
        case "za":
          return (b.companyName || "").localeCompare(a.companyName || "");
        case "newest":
        default:
          return (b.createdAt || "").localeCompare(a.createdAt || "");
      }
    });

    return result;
  }, [leads, statusFilter, rejectReasonFilter, search, sort]);

  const updateForm = (key: keyof LeadFormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateApproveForm = (key: keyof ApproveFormState, value: string) => {
    setApproveForm((prev) => ({ ...prev, [key]: value }));
    if (key === "accountName") {
      setDuplicateChecked(false);
      setDuplicates([]);
      setExistingContact(null);
      setUseExistingAccountId(null);
      setInstallationConflicts([]);
      setInstallationUseExisting({});
    }
  };

  const enrichCompanyInfoFromWebsite = async () => {
    const website = approveForm.website.trim();
    if (!website) {
      toast.error("Primero ingresa la página web de la empresa.");
      return;
    }
    setEnrichingCompanyInfo(true);
    try {
      const response = await fetch("/api/crm/company-enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          website,
          companyName: approveForm.accountName,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "No se pudo obtener información del sitio.");
      }
      const summary = payload?.data?.summary || "";
      const normalizedWebsite = payload?.data?.websiteNormalized || "";
      const logoUrl = payload?.data?.localLogoUrl || payload?.data?.logoUrl || null;
      if (normalizedWebsite) updateApproveForm("website", normalizedWebsite);
      if (summary) updateApproveForm("companyInfo", summary);
      setDetectedCompanyLogoUrl(logoUrl);
      toast.success("Información de la empresa completada desde la web.");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo traer datos de la empresa.");
    } finally {
      setEnrichingCompanyInfo(false);
    }
  };

  const createLead = async () => {
    setCreating(true);
    try {
      const response = await fetch("/api/crm/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Error creando prospecto");
      }
      setLeads((prev) => [payload.data, ...prev]);
      setForm(DEFAULT_FORM);
      setOpen(false);
      toast.success("Lead creado exitosamente");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo crear el lead.");
    } finally {
      setCreating(false);
    }
  };

  const openApproveModal = (lead: CrmLead) => {
    setApproveLeadId(lead.id);
    setDuplicates([]);
    setExistingContact(null);
    setInstallationConflicts([]);
    setDuplicateChecked(false);
    setUseExistingAccountId(null);
    setContactResolution("create");
    setInstallationUseExisting({});
    const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(" ");
    const meta = lead.metadata as Record<string, unknown> | undefined;
    const leadDotacion = (meta?.dotacion as DotacionItem[] | undefined) || [];

    setApproveForm({
      accountName: lead.companyName || "",
      contactFirstName: lead.firstName || "",
      contactLastName: lead.lastName || "",
      email: lead.email || "",
      phone: lead.phone || "",
      dealTitle: `Oportunidad ${lead.companyName || fullName || ""}`.trim(),
      rut: "",
      industry: lead.industry || "",
      segment: "",
      roleTitle: "",
      website: (lead as any).website || extractWebsiteFromEmail(lead.email || ""),
      companyInfo: "",
      notes: lead.notes || "",
    });
    setDetectedCompanyLogoUrl(null);

    // Pre-crear una instalación con la dirección, coordenadas y dotación del lead
    const leadLat = meta?.lat as number | undefined;
    const leadLng = meta?.lng as number | undefined;
    const firstInst = createEmptyInstallation(
      lead.companyName || "",
      (lead as any).address || "",
      (lead as any).city || "",
      (lead as any).commune || "",
    );
    if (leadLat != null) firstInst.lat = leadLat;
    if (leadLng != null) firstInst.lng = leadLng;
    firstInst.dotacion = leadDotacion.map((d) => ({
      puestoTrabajoId: typeof d.puestoTrabajoId === "string" ? d.puestoTrabajoId : "",
      puesto: d.puesto || "",
      customName: typeof d.customName === "string" ? d.customName : "",
      cargoId: typeof d.cargoId === "string" ? d.cargoId : defaultCargoId,
      rolId: typeof d.rolId === "string" ? d.rolId : defaultRolId,
      baseSalary: typeof d.baseSalary === "number" ? d.baseSalary : 550000,
      shiftType: inferShiftType(d.horaInicio || "08:00", d.horaFin || "20:00"),
      cantidad: d.cantidad || 1,
      horaInicio: normalizeTimeToHHmm(d.horaInicio, "08:00"),
      horaFin: normalizeTimeToHHmm(d.horaFin, "20:00"),
      dias: normalizeLeadDias(d.dias),
    }));
    setInstallations([firstInst]);
    setApproveOpen(true);
  };

  // Helpers para editar instalaciones
  const updateInstallation = (key: string, field: keyof InstallationDraft, value: unknown) => {
    setInstallations((prev) => prev.map((inst) => inst._key === key ? { ...inst, [field]: value } : inst));
  };
  const removeInstallation = (key: string) => {
    setInstallations((prev) => prev.filter((inst) => inst._key !== key));
  };
  const addInstallation = () => {
    setInstallations((prev) => [...prev, createEmptyInstallation()]);
  };
  const handleAddressChange = (key: string, result: AddressResult) => {
    setInstallations((prev) => prev.map((inst) => inst._key === key ? { ...inst, address: result.address, city: result.city, commune: result.commune, lat: result.lat, lng: result.lng } : inst));
  };

  // Dotación helpers
  const addDotacionToInst = (instKey: string) => {
    setInstallations((prev) =>
      prev.map((inst) =>
        inst._key === instKey
          ? { ...inst, dotacion: [...inst.dotacion, createEmptyDotacion(defaultCargoId, defaultRolId)] }
          : inst
      )
    );
  };
  const updateDotacionField = (instKey: string, dotIdx: number, field: keyof DotacionItem, value: unknown) => {
    setInstallations((prev) => prev.map((inst) => {
      if (inst._key !== instKey) return inst;
      const newDot = [...inst.dotacion];
      newDot[dotIdx] = { ...newDot[dotIdx], [field]: value };
      return { ...inst, dotacion: newDot };
    }));
  };
  const removeDotacionFromInst = (instKey: string, dotIdx: number) => {
    setInstallations((prev) => prev.map((inst) => {
      if (inst._key !== instKey) return inst;
      return { ...inst, dotacion: inst.dotacion.filter((_, i) => i !== dotIdx) };
    }));
  };
  const cloneDotacionInInst = (instKey: string, dotIdx: number) => {
    setInstallations((prev) =>
      prev.map((inst) => {
        if (inst._key !== instKey) return inst;
        const original = inst.dotacion[dotIdx];
        if (!original) return inst;
        const clone: DotacionItem = { ...original, dias: [...original.dias], cantidad: original.cantidad || 1 };
        const nextDotacion = [...inst.dotacion];
        nextDotacion.splice(dotIdx + 1, 0, clone);
        return { ...inst, dotacion: nextDotacion };
      })
    );
  };
  const setDotacionShift = (instKey: string, dotIdx: number, shiftType: "day" | "night") => {
    setInstallations((prev) =>
      prev.map((inst) => {
        if (inst._key !== instKey) return inst;
        const nextDot = [...inst.dotacion];
        const current = nextDot[dotIdx];
        if (!current) return inst;
        nextDot[dotIdx] =
          shiftType === "night"
            ? { ...current, shiftType, horaInicio: "20:00", horaFin: "08:00" }
            : {
                ...current,
                shiftType,
                horaInicio: DAY_START_OPTIONS.includes(current.horaInicio as (typeof DAY_START_OPTIONS)[number])
                  ? current.horaInicio
                  : "08:00",
                horaFin: "20:00",
              };
        return { ...inst, dotacion: nextDot };
      })
    );
  };
  const setDotacionDayStart = (instKey: string, dotIdx: number, startTime: string) => {
    setInstallations((prev) =>
      prev.map((inst) => {
        if (inst._key !== instKey) return inst;
        const nextDot = [...inst.dotacion];
        const current = nextDot[dotIdx];
        if (!current) return inst;
        const normalizedStart = normalizeTimeToHHmm(startTime, "08:00");
        nextDot[dotIdx] = {
          ...current,
          shiftType: "day",
          horaInicio: normalizedStart,
          horaFin: minutesToTime((toMinutes(normalizedStart) ?? 480) + 12 * 60),
        };
        return { ...inst, dotacion: nextDot };
      })
    );
  };
  const toggleDotacionDay = (instKey: string, dotIdx: number, day: string) => {
    setInstallations((prev) => prev.map((inst) => {
      if (inst._key !== instKey) return inst;
      const newDot = [...inst.dotacion];
      const d = newDot[dotIdx];
      newDot[dotIdx] = { ...d, dias: d.dias.includes(day) ? d.dias.filter((x) => x !== day) : [...d.dias, day] };
      return { ...inst, dotacion: newDot };
    }));
  };

  const installationNamesKey = useMemo(
    () => installations.map((i) => i.name).join("|"),
    [installations]
  );

  // Al elegir "usar cuenta existente", cargar conflictos de instalaciones para esa cuenta
  useEffect(() => {
    if (!approveOpen || !approveLeadId || !useExistingAccountId) {
      setInstallationConflicts([]);
      return;
    }
    const instPayload = installations
      .filter((i) => i.name.trim())
      .map(({ _key, ...r }) => r);
    if (instPayload.length === 0) return;
    fetch(`/api/crm/leads/${approveLeadId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...approveForm,
        checkDuplicates: true,
        useExistingAccountId,
        installations: instPayload,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.installationConflicts && data.installationConflicts.length > 0) {
          setInstallationConflicts(data.installationConflicts);
        } else {
          setInstallationConflicts([]);
        }
      })
      .catch(() => setInstallationConflicts([]));
  }, [approveOpen, approveLeadId, useExistingAccountId, approveForm.accountName, installationNamesKey]);

  const approveLead = async () => {
    if (!approveLeadId) return;
    const accountNameToUse = useExistingAccountId ? "" : approveForm.accountName.trim();
    if (!useExistingAccountId && !accountNameToUse) {
      toast.error("El nombre de la empresa es obligatorio o elige una cuenta existente.");
      return;
    }

    setApproving(true);
    try {
      const instPayload = installations
        .filter((inst) => inst.name.trim())
        .map((inst) => {
          const { _key, ...rest } = inst;
          const useExistingInstallationId = installationUseExisting[_key] || undefined;
          return { ...rest, ...(useExistingInstallationId ? { useExistingInstallationId } : {}) };
        });

      const payload = {
        ...approveForm,
        accountNotes: approveForm.companyInfo || undefined,
        accountLogoUrl: detectedCompanyLogoUrl || undefined,
        useExistingAccountId: useExistingAccountId || undefined,
        contactResolution: existingContact ? contactResolution : undefined,
        contactId: (existingContact && (contactResolution === "overwrite" || contactResolution === "use_existing")) ? existingContact.id : undefined,
        installations: instPayload,
      };

      if (!duplicateChecked) {
        const checkRes = await fetch(`/api/crm/leads/${approveLeadId}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, checkDuplicates: true }),
        });
        const checkData = await checkRes.json();
        if (!checkData.success) {
          setApproving(false);
          return;
        }
        setDuplicates(checkData.duplicates || []);
        const exContact = checkData.existingContact ?? null;
        setExistingContact(exContact);
        if (exContact) setContactResolution("overwrite");
        const conflicts: InstallationConflict[] = checkData.installationConflicts || [];
        setInstallationConflicts(conflicts);
        setInstallationUseExisting((prev) => {
          const next = { ...prev };
          for (const conf of conflicts) {
            for (const inst of installations) {
              if (inst.name.trim().toLowerCase() === conf.name.toLowerCase()) {
                next[inst._key] = conf.id;
              }
            }
          }
          return next;
        });
        setDuplicateChecked(true);
        const hasAccountOrContactConflict = (checkData.duplicates?.length > 0) || checkData.existingContact;
        const hasInstallationConflictOnly = conflicts.length > 0 && !hasAccountOrContactConflict;
        if (hasAccountOrContactConflict) {
          setApproving(false);
          return;
        }
        if (hasInstallationConflictOnly) {
          const resolvedInstPayload = installations
            .filter((inst) => inst.name.trim())
            .map((inst) => {
              const conf = conflicts.find((c) => c.name.toLowerCase() === inst.name.trim().toLowerCase());
              const useExistingInstallationId = conf ? conf.id : (installationUseExisting[inst._key] || undefined);
              const { _key, ...rest } = inst;
              return { ...rest, ...(useExistingInstallationId ? { useExistingInstallationId } : {}) };
            });
          const resolvedPayload = { ...payload, installations: resolvedInstPayload };
          const response = await fetch(`/api/crm/leads/${approveLeadId}/approve`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(resolvedPayload),
          });
          const result = await response.json();
          if (response.status === 409 && result.conflict === "installation") {
            toast.error(`Instalación "${result.installationName || ""}" ya existe. Elige "Usar existente" o otro nombre.`);
            setApproving(false);
            return;
          }
          if (!response.ok) {
            setApproving(false);
            throw new Error(result?.error || "Error aprobando lead");
          }
          setLeads((prev) =>
            prev.map((lead) =>
              lead.id === approveLeadId ? { ...lead, status: "approved" } : lead
            )
          );
          setApproveOpen(false);
          setApproveLeadId(null);
          setDuplicates([]);
          setExistingContact(null);
          setInstallationConflicts([]);
          setDuplicateChecked(false);
          setUseExistingAccountId(null);
          setContactResolution("create");
          setInstallationUseExisting({});
          toast.success("Lead aprobado — Cuenta, contacto y negocio creados");
          setApproving(false);
          return;
        }
      }

      const response = await fetch(`/api/crm/leads/${approveLeadId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (response.status === 409 && result.conflict === "installation") {
        toast.error(`Instalación "${result.installationName || ""}" ya existe. Elige "Usar existente" o otro nombre.`);
        setApproving(false);
        return;
      }
      if (!response.ok) {
        throw new Error(result?.error || "Error aprobando lead");
      }
      setLeads((prev) =>
        prev.map((lead) =>
          lead.id === approveLeadId ? { ...lead, status: "approved" } : lead
        )
      );
      setApproveOpen(false);
      setApproveLeadId(null);
      setDuplicates([]);
      setExistingContact(null);
      setInstallationConflicts([]);
      setDuplicateChecked(false);
      setUseExistingAccountId(null);
      setContactResolution("create");
      setInstallationUseExisting({});
      toast.success("Lead aprobado — Cuenta, contacto y negocio creados");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo aprobar el lead.");
    } finally {
      setApproving(false);
    }
  };

  const leadDisplayName = (lead: CrmLead) => {
    const parts = [lead.firstName, lead.lastName].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : "Sin contacto";
  };

  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: "" });

  const deleteLead = async (id: string) => {
    try {
      const res = await fetch(`/api/crm/leads/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setLeads((prev) => prev.filter((l) => l.id !== id));
      setDeleteConfirm({ open: false, id: "" });
      toast.success("Prospecto eliminado");
    } catch {
      toast.error("No se pudo eliminar");
    }
  };

  const openRejectModal = (lead: CrmLead) => {
    setRejectLeadId(lead.id);
    setRejectLeadData(lead);
    setRejectReason("other");
    setRejectNote("");
    setRejectSendEmail(false);
    setRejectTemplateId("");
    setRejectEmailSubject("");
    setRejectEmailBody("");
    setRejectOpen(true);
  };

  const applyRejectTemplate = (templateId: string) => {
    setRejectTemplateId(templateId);
    if (!templateId) return;
    const template = docTemplatesReject.find((t) => t.id === templateId);
    const lead = rejectLeadData;
    if (!template?.content || !lead) return;
    const entities = {
      contact: {
        firstName: lead.firstName || "",
        lastName: lead.lastName || "",
        email: lead.email || "",
        phone: lead.phone || "",
      },
      account: { name: lead.companyName || "" },
    };
    const { resolvedContent } = resolveDocument(template.content, entities);
    setRejectEmailSubject(template.name);
    setRejectEmailBody(tiptapToPlainText(resolvedContent));
  };

  const rejectLead = async () => {
    if (!rejectLeadId) return;
    if (rejectSendEmail && (!rejectEmailSubject.trim() || !rejectEmailBody.trim())) {
      toast.error("Asunto y mensaje son obligatorios para enviar el correo.");
      return;
    }
    setRejecting(true);
    try {
      const response = await fetch(`/api/crm/leads/${rejectLeadId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: rejectReason,
          note: rejectNote || undefined,
          sendEmail: rejectSendEmail,
          emailSubject: rejectEmailSubject || undefined,
          emailBody: rejectEmailBody || undefined,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "No se pudo rechazar el lead");
      }

      setLeads((prev) =>
        prev.map((lead) =>
          lead.id === rejectLeadId ? { ...lead, status: "rejected", metadata: payload?.data?.metadata ?? lead.metadata } : lead
        )
      );
      setRejectOpen(false);
      setRejectLeadId(null);
      setRejectLeadData(null);
      toast.success(rejectSendEmail ? "Lead rechazado y correo enviado" : "Lead rechazado");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "No se pudo rechazar el lead.");
    } finally {
      setRejecting(false);
    }
  };

  const statusFilters = [
    { key: "all", label: "Todos", count: counts.total },
    { key: "pending", label: "Pendientes", count: counts.pending },
    { key: "approved", label: "Aprobados", count: counts.approved },
    { key: "rejected", label: "Rechazados", count: counts.rejected },
  ];

  const initialFilterLabel = getLeadFilterLabel(initialStatusFilter);
  const canConfirmReject = !rejectSendEmail || (rejectEmailSubject.trim().length > 0 && rejectEmailBody.trim().length > 0);

  return (
    <div className="space-y-4">
      {initialFilterLabel && (
        <p className="text-xs text-muted-foreground">{initialFilterLabel}</p>
      )}

      {/* ── Toolbar ── */}
      <CrmToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por empresa, contacto o email..."
        filters={statusFilters}
        activeFilter={statusFilter}
        onFilterChange={(value) => setStatusFilter((value as LeadStatusFilter) || "all")}
        activeSort={sort}
        onSortChange={setSort}
        viewModes={["list", "cards"]}
        activeView={view}
        onViewChange={(v) => setView(v as ViewMode)}
        actionSlot={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="icon" variant="secondary" className="h-9 w-9 shrink-0">
                <Plus className="h-4 w-4" />
                <span className="sr-only">Nuevo lead</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Nuevo lead</DialogTitle>
                <DialogDescription>
                  Ingresa los datos básicos del contacto.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label>Empresa</Label>
                  <Input
                    value={form.companyName}
                    onChange={(event) => updateForm("companyName", event.target.value)}
                    placeholder="Nombre de la empresa"
                    className={inputClassName}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input
                    value={form.firstName}
                    onChange={(event) => updateForm("firstName", event.target.value)}
                    placeholder="Nombre"
                    className={inputClassName}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Apellido</Label>
                  <Input
                    value={form.lastName}
                    onChange={(event) => updateForm("lastName", event.target.value)}
                    placeholder="Apellido"
                    className={inputClassName}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    value={form.email}
                    onChange={(event) => updateForm("email", event.target.value)}
                    placeholder="correo@empresa.com"
                    className={inputClassName}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Teléfono</Label>
                  <Input
                    value={form.phone}
                    onChange={(event) => updateForm("phone", event.target.value)}
                    placeholder="+56 9 1234 5678"
                    className={inputClassName}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Fuente</Label>
                  <Input
                    value={form.source}
                    onChange={(event) => updateForm("source", event.target.value)}
                    placeholder="Formulario web, referido, inbound, etc."
                    className={inputClassName}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={createLead} disabled={creating}>
                  {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Guardar lead
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {statusFilter === "rejected" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Motivo:</span>
          <Button
            size="sm"
            variant={rejectReasonFilter === "all" ? "default" : "outline"}
            className="h-7 text-xs"
            onClick={() => setRejectReasonFilter("all")}
          >
            {getLeadRejectReasonLabel("all")}
          </Button>
          {REJECTION_REASON_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              size="sm"
              variant={rejectReasonFilter === opt.value ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => setRejectReasonFilter(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      )}

      {/* ── Approve Modal ── */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent className="w-[95vw] sm:max-w-xl md:max-w-2xl lg:max-w-4xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Aprobar lead</DialogTitle>
            <DialogDescription>
              Revisa y edita los datos antes de crear la cuenta, contacto y negocio.
            </DialogDescription>
          </DialogHeader>

          {duplicates.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
              <div className="flex items-center gap-2 text-amber-400 text-sm font-medium">
                <AlertTriangle className="h-4 w-4" />
                Cuenta con el mismo nombre ya existe
              </div>
              <div className="flex flex-col gap-2 pl-6">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="accountResolution"
                    checked={!useExistingAccountId}
                    onChange={() => { setUseExistingAccountId(null); setInstallationConflicts([]); setInstallationUseExisting({}); }}
                    className="rounded border-input"
                  />
                  Crear nueva cuenta
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="accountResolution"
                    checked={!!useExistingAccountId}
                    onChange={() => setUseExistingAccountId(duplicates[0]?.id ?? null)}
                    className="rounded border-input"
                  />
                  Usar cuenta existente:
                </label>
                <select
                  className="ml-6 mt-1 max-w-xs rounded border border-input bg-background px-2 py-1.5 text-xs text-foreground"
                  value={useExistingAccountId ?? ""}
                  onChange={(e) => { setUseExistingAccountId(e.target.value || null); setInstallationUseExisting({}); }}
                >
                  <option value="">Seleccionar cuenta...</option>
                  {duplicates.map((dup) => (
                    <option key={dup.id} value={dup.id}>
                      {dup.name} {dup.rut ? `(${dup.rut})` : ""} — {dup.type === "client" ? "Cliente" : "Prospecto"}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {existingContact && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
              <div className="flex items-center gap-2 text-amber-400 text-sm font-medium">
                <AlertTriangle className="h-4 w-4" />
                Ya existe un contacto con este email
              </div>
              <p className="text-xs text-muted-foreground pl-6">
                {existingContact.firstName} {existingContact.lastName} — {existingContact.email}
              </p>
              <div className="flex flex-col gap-1.5 pl-6">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="contactResolution"
                    checked={contactResolution === "overwrite"}
                    onChange={() => setContactResolution("overwrite")}
                    className="rounded border-input"
                  />
                  Sobrescribir con los datos de este lead
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="contactResolution"
                    checked={contactResolution === "use_existing"}
                    onChange={() => setContactResolution("use_existing")}
                    className="rounded border-input"
                  />
                  Mantener el contacto existente
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="contactResolution"
                    checked={contactResolution === "create"}
                    onChange={() => setContactResolution("create")}
                    className="rounded border-input"
                  />
                  Crear nuevo contacto (otro email)
                </label>
              </div>
            </div>
          )}

          {installationConflicts.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
              <div className="flex items-center gap-2 text-amber-400 text-sm font-medium">
                <AlertTriangle className="h-4 w-4" />
                Instalación con el mismo nombre ya existe en esta cuenta
              </div>
              <p className="text-xs text-muted-foreground pl-6">
                Se usará la instalación existente (ya marcado). Puedes cambiar el nombre abajo si quieres crear otra.
              </p>
              {installationConflicts.map((conf) => (
                <div key={conf.id} className="pl-6 flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">&quot;{conf.name}&quot;</span>
                  {installations.filter((i) => i.name.trim().toLowerCase() === conf.name.toLowerCase()).map((inst) => (
                    <Button
                      key={inst._key}
                      type="button"
                      variant={installationUseExisting[inst._key] === conf.id ? "default" : "outline"}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setInstallationUseExisting((prev) => {
                        if (prev[inst._key] === conf.id) {
                          const next = { ...prev };
                          delete next[inst._key];
                          return next;
                        }
                        return { ...prev, [inst._key]: conf.id };
                      })}
                    >
                      {installationUseExisting[inst._key] === conf.id ? "Usar existente ✓" : "Usar esta existente"}
                    </Button>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className="space-y-5">
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Cuenta (Prospecto)
              </h4>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5 md:col-span-2 lg:col-span-3">
                  <Label className="text-xs">Nombre de empresa *</Label>
                  <Input
                    value={approveForm.accountName}
                    onChange={(e) => updateApproveForm("accountName", e.target.value)}
                    placeholder="Nombre de la empresa"
                    className={inputClassName}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">RUT</Label>
                  <Input
                    value={approveForm.rut}
                    onChange={(e) => updateApproveForm("rut", e.target.value)}
                    placeholder="76.123.456-7"
                    className={inputClassName}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Industria</Label>
                  <select
                    className={selectClassName}
                    value={approveForm.industry}
                    onChange={(e) => updateApproveForm("industry", e.target.value)}
                  >
                    <option value="">Seleccionar industria</option>
                    {industries.map((i) => (
                      <option key={i.id} value={i.name}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Segmento</Label>
                  <Input
                    value={approveForm.segment}
                    onChange={(e) => updateApproveForm("segment", e.target.value)}
                    placeholder="Corporativo, PYME..."
                    className={inputClassName}
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2 lg:col-span-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs">Página web</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={enrichCompanyInfoFromWebsite}
                      disabled={enrichingCompanyInfo || !approveForm.website.trim()}
                    >
                      {enrichingCompanyInfo && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                      Traer datos de la empresa
                    </Button>
                  </div>
                  <Input
                    value={approveForm.website}
                    onChange={(e) => updateApproveForm("website", e.target.value)}
                    placeholder="https://www.empresa.cl"
                    className={inputClassName}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Se detecta automáticamente desde el dominio del email. Se asocia a la cuenta.
                  </p>
                </div>
                <div className="space-y-1.5 md:col-span-2 lg:col-span-3">
                  <Label className="text-xs">Información de la empresa</Label>
                  <textarea
                    value={approveForm.companyInfo}
                    onChange={(e) => updateApproveForm("companyInfo", e.target.value)}
                    placeholder="Resumen comercial de qué hace la empresa, a qué se dedica y contexto útil para cotización..."
                    className={`w-full min-h-[96px] resize-y rounded-md border px-3 py-2 text-sm ${inputClassName}`}
                    rows={4}
                  />
                  {detectedCompanyLogoUrl && (
                    <div className="space-y-2 rounded-md border border-border bg-muted/20 p-2">
                      <div className="text-[10px] text-muted-foreground">Logo detectado</div>
                      <div className="flex items-center gap-3">
                        <img
                          src={detectedCompanyLogoUrl}
                          alt="Logo empresa detectado"
                          className="h-12 w-12 rounded border border-border bg-background object-contain"
                        />
                        <span className="truncate text-[10px] text-muted-foreground">
                          {detectedCompanyLogoUrl}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(detectedCompanyLogoUrl);
                            toast.success("URL del logo copiada.");
                          } catch {
                            toast.error("No se pudo copiar la URL del logo.");
                          }
                        }}
                      >
                        Copiar URL
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t border-border" />

            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Contacto principal
              </h4>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nombre *</Label>
                  <Input
                    value={approveForm.contactFirstName}
                    onChange={(e) => updateApproveForm("contactFirstName", e.target.value)}
                    placeholder="Nombre"
                    className={inputClassName}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Apellido</Label>
                  <Input
                    value={approveForm.contactLastName}
                    onChange={(e) => updateApproveForm("contactLastName", e.target.value)}
                    placeholder="Apellido"
                    className={inputClassName}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Cargo</Label>
                  <Input
                    value={approveForm.roleTitle}
                    onChange={(e) => updateApproveForm("roleTitle", e.target.value)}
                    placeholder="Gerente, jefe..."
                    className={inputClassName}
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2 lg:col-span-1">
                  <Label className="text-xs">Email</Label>
                  <Input
                    value={approveForm.email}
                    onChange={(e) => updateApproveForm("email", e.target.value)}
                    placeholder="correo@empresa.com"
                    className={inputClassName}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Teléfono</Label>
                  <Input
                    value={approveForm.phone}
                    onChange={(e) => updateApproveForm("phone", e.target.value)}
                    placeholder="+56 9 1234 5678"
                    className={inputClassName}
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-border" />

            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Negocio
              </h4>
              <div className="space-y-1.5">
                <Label className="text-xs">Título del negocio</Label>
                <Input
                  value={approveForm.dealTitle}
                  onChange={(e) => updateApproveForm("dealTitle", e.target.value)}
                  placeholder="Oportunidad para..."
                  className={inputClassName}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Notas iniciales</Label>
                <textarea
                  value={approveForm.notes}
                  onChange={(e) => updateApproveForm("notes", e.target.value)}
                  placeholder="Notas sobre este negocio (se copiarán al negocio y cotización)..."
                  className={`w-full min-h-[64px] resize-none rounded-md border px-3 py-2 text-sm ${inputClassName}`}
                  rows={2}
                />
                <p className="text-[10px] text-muted-foreground">
                  Estas notas se agregarán al negocio y a las cotizaciones creadas.
                </p>
              </div>
            </div>

            <div className="border-t border-border" />

            {/* ── Instalaciones y Dotación ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Instalaciones y Dotación
                </h4>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addInstallation}>
                  <Plus className="h-3 w-3" /> Nueva instalación
                </Button>
              </div>

              {installations.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Sin instalaciones. Agrega una para asignar dotación.
                </p>
              )}

              <div className="space-y-4">
                {installations.map((inst, instIdx) => (
                  <div
                    key={inst._key}
                    className="rounded-lg border border-border bg-muted/10 overflow-hidden"
                  >
                    {/* Installation header */}
                    <div className="px-3 py-2 bg-muted/30 border-b border-border/60 flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs font-semibold flex-1">
                        Instalación {instIdx + 1}
                      </span>
                      {installations.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:text-destructive"
                          onClick={() => removeInstallation(inst._key)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>

                    <div className="p-3 space-y-3">
                      {/* Name */}
                      <div className="space-y-1">
                        <Label className="text-[11px]">Nombre *</Label>
                        <Input
                          value={inst.name}
                          onChange={(e) => updateInstallation(inst._key, "name", e.target.value)}
                          placeholder="Bodega central, Sucursal norte..."
                          className={`h-9 text-sm ${inputClassName}`}
                        />
                      </div>

                      {/* Address via Google Maps */}
                      <div className="space-y-1">
                        <Label className="text-[11px]">Dirección (Google Maps)</Label>
                        <AddressAutocomplete
                          value={inst.address}
                          onChange={(result) => handleAddressChange(inst._key, result)}
                          placeholder="Buscar dirección..."
                          className={`h-9 text-sm ${inputClassName}`}
                          showMap={false}
                        />
                      </div>

                      {/* Comuna & Ciudad (auto-filled, editable) */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[11px]">Comuna</Label>
                          <Input
                            value={inst.commune}
                            onChange={(e) => updateInstallation(inst._key, "commune", e.target.value)}
                            placeholder="Las Condes"
                            className={`h-9 text-sm ${inputClassName}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px]">Ciudad</Label>
                          <Input
                            value={inst.city}
                            onChange={(e) => updateInstallation(inst._key, "city", e.target.value)}
                            placeholder="Santiago"
                            className={`h-9 text-sm ${inputClassName}`}
                          />
                        </div>
                      </div>

                      {/* ── Dotación de esta instalación ── */}
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                            <Users className="h-3 w-3" /> Dotación
                            {inst.dotacion.length > 0 && (
                              <span className="ml-1 text-[10px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                                {inst.dotacion.reduce((s, d) => s + d.cantidad, 0)} guardia{inst.dotacion.reduce((s, d) => s + d.cantidad, 0) !== 1 ? "s" : ""}
                              </span>
                            )}
                          </span>
                          <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] gap-1 px-2" onClick={() => addDotacionToInst(inst._key)}>
                            <Plus className="h-2.5 w-2.5" /> Posición
                          </Button>
                        </div>

                        {inst.dotacion.length === 0 && (
                          <button
                            type="button"
                            onClick={() => addDotacionToInst(inst._key)}
                            className="w-full py-3 rounded-md border border-dashed border-border text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
                          >
                            + Agregar posición de guardia
                          </button>
                        )}

                        {inst.dotacion.map((dot, dotIdx) => (
                          <div
                            key={dotIdx}
                            className="rounded-md border border-border/60 bg-background p-2.5 space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-semibold text-muted-foreground">
                                Posición {dotIdx + 1}
                              </span>
                              <div className="flex items-center gap-1">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-[10px] px-2 gap-1"
                                  onClick={() => cloneDotacionInInst(inst._key, dotIdx)}
                                >
                                  <Copy className="h-3 w-3" />
                                  Clonar
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                                  onClick={() => removeDotacionFromInst(inst._key, dotIdx)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>

                            <div className="grid gap-2 sm:grid-cols-2">
                              <div className="space-y-1">
                                <Label className="text-[10px]">Tipo de puesto *</Label>
                                <select
                                  className={selectCompactClassName}
                                  value={dot.puestoTrabajoId || ""}
                                  onChange={(e) => {
                                    const puestoTrabajoId = e.target.value;
                                    const selected = cpqPuestos.find((p) => p.id === puestoTrabajoId);
                                    updateDotacionField(inst._key, dotIdx, "puestoTrabajoId", puestoTrabajoId);
                                    updateDotacionField(inst._key, dotIdx, "puesto", selected?.name || dot.puesto || "");
                                  }}
                                >
                                  <option value="">Seleccionar puesto...</option>
                                  {cpqPuestos.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[10px]">Nombre personalizado</Label>
                                <Input
                                  value={dot.customName || ""}
                                  onChange={(e) => updateDotacionField(inst._key, dotIdx, "customName", e.target.value)}
                                  placeholder={dot.puesto || "Ej: CCTV acceso principal"}
                                  className={`h-8 text-sm ${inputClassName}`}
                                />
                              </div>
                            </div>

                            <div className="grid gap-2 sm:grid-cols-4">
                              <div className="space-y-1">
                                <Label className="text-[10px]">Cargo *</Label>
                                <select
                                  className={selectCompactClassName}
                                  value={dot.cargoId || ""}
                                  onChange={(e) => updateDotacionField(inst._key, dotIdx, "cargoId", e.target.value)}
                                >
                                  <option value="">Seleccionar cargo...</option>
                                  {cpqCargos.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[10px]">Rol *</Label>
                                <select
                                  className={selectCompactClassName}
                                  value={dot.rolId || ""}
                                  onChange={(e) => updateDotacionField(inst._key, dotIdx, "rolId", e.target.value)}
                                >
                                  <option value="">Seleccionar rol...</option>
                                  {cpqRoles.map((r) => (
                                    <option key={r.id} value={r.id}>
                                      {r.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[10px]">Guardias</Label>
                                <Input
                                  type="number"
                                  min={1}
                                  max={100}
                                  value={dot.cantidad}
                                  onChange={(e) => updateDotacionField(inst._key, dotIdx, "cantidad", Math.max(1, Number(e.target.value) || 1))}
                                  className={`h-8 text-sm text-center ${inputClassName}`}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[10px]">Sueldo base</Label>
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  value={formatNumber(dot.baseSalary || 550000, { minDecimals: 0, maxDecimals: 0 })}
                                  onChange={(e) => updateDotacionField(inst._key, dotIdx, "baseSalary", Math.max(0, parseLocalizedNumber(e.target.value) || 0))}
                                  className={`h-8 text-sm ${inputClassName}`}
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <Label className="text-[10px]">Horario</Label>
                                <div className="flex gap-1">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={(dot.shiftType || "day") === "day" ? "default" : "outline"}
                                    className="h-6 px-2 text-[10px]"
                                    onClick={() => setDotacionShift(inst._key, dotIdx, "day")}
                                  >
                                    Día
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={(dot.shiftType || "day") === "night" ? "default" : "outline"}
                                    className="h-6 px-2 text-[10px]"
                                    onClick={() => setDotacionShift(inst._key, dotIdx, "night")}
                                  >
                                    Noche
                                  </Button>
                                </div>
                              </div>
                              {(dot.shiftType || "day") === "day" ? (
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <Label className="text-[10px]">Inicio</Label>
                                    <select
                                      className={selectCompactClassName}
                                      value={dot.horaInicio}
                                      onChange={(e) => setDotacionDayStart(inst._key, dotIdx, e.target.value)}
                                    >
                                      {DAY_START_OPTIONS.map((time) => (
                                        <option key={time} value={time}>
                                          {time}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[10px]">Término</Label>
                                    <Input value={dot.horaFin} className={`h-8 text-sm ${inputClassName}`} readOnly />
                                  </div>
                                </div>
                              ) : (
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <Label className="text-[10px]">Inicio</Label>
                                    <Input value="20:00" className={`h-8 text-sm ${inputClassName}`} readOnly />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[10px]">Término</Label>
                                    <Input value="08:00" className={`h-8 text-sm ${inputClassName}`} readOnly />
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="space-y-1">
                              <Label className="text-[10px]">Días</Label>
                              <div className="flex flex-wrap gap-1">
                                {WEEKDAYS.map((day) => {
                                  const active = dot.dias.includes(day);
                                  return (
                                    <button
                                      key={day}
                                      type="button"
                                      onClick={() => toggleDotacionDay(inst._key, dotIdx, day)}
                                      className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                                        active
                                          ? "bg-primary/15 text-primary border border-primary/30"
                                          : "bg-muted text-muted-foreground border border-transparent hover:border-border"
                                      }`}
                                    >
                                      {WEEKDAYS_SHORT[day]}
                                    </button>
                                  );
                                })}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const allSelected = dot.dias.length === 7;
                                    updateDotacionField(inst._key, dotIdx, "dias", allSelected ? [] : [...WEEKDAYS]);
                                  }}
                                  className="px-2 py-1 rounded text-[10px] font-medium text-muted-foreground hover:text-foreground border border-dashed border-border"
                                >
                                  {dot.dias.length === 7 ? "Ninguno" : "Todos"}
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-[10px] text-muted-foreground">
                Solo se crearán instalaciones con nombre. La dotación se guarda como referencia para el negocio.
              </p>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setApproveOpen(false)} disabled={approving}>
              Cancelar
            </Button>
            <Button onClick={approveLead} disabled={approving}>
              {approving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {duplicates.length > 0 ? "Crear de todos modos" : "Confirmar aprobación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reject Modal ── */}
      <Dialog
        open={rejectOpen}
        onOpenChange={(open) => {
          setRejectOpen(open);
          if (!open) setRejectLeadData(null);
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Rechazar lead</DialogTitle>
            <DialogDescription>
              El lead se mantiene en CRM Leads con estado rechazado. Puedes enviar una respuesta por correo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Motivo *</Label>
              <select
                className={selectClassName}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value as LeadRejectReason)}
              >
                {REJECTION_REASON_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Nota interna</Label>
              <textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="Contexto interno del rechazo..."
                className={`w-full min-h-[80px] resize-none rounded-md border px-3 py-2 text-sm ${inputClassName}`}
                rows={3}
              />
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={rejectSendEmail}
                onChange={(e) => setRejectSendEmail(e.target.checked)}
              />
              Enviar correo de respuesta
            </label>

            {rejectSendEmail && (
              <div className="space-y-3 rounded-md border border-border p-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Template (opcional)</Label>
                  <select
                    className={selectClassName}
                    value={rejectTemplateId}
                    onChange={(e) => applyRejectTemplate(e.target.value)}
                  >
                    <option value="">Sin template</option>
                    {docTemplatesReject.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Asunto *</Label>
                  <Input
                    value={rejectEmailSubject}
                    onChange={(e) => setRejectEmailSubject(e.target.value)}
                    placeholder="Asunto del correo"
                    className={inputClassName}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Mensaje *</Label>
                  <textarea
                    value={rejectEmailBody}
                    onChange={(e) => setRejectEmailBody(e.target.value)}
                    placeholder="Contenido del correo..."
                    className={`w-full min-h-[140px] rounded-md border px-3 py-2 text-sm ${inputClassName}`}
                    rows={6}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    La firma configurada en el sistema se agrega automáticamente al momento del envío.
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={rejecting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={rejectLead} disabled={rejecting || !canConfirmReject}>
              {rejecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar rechazo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Lead list ── */}
      <Card>
        <CardContent className="pt-5">
          {filteredLeads.length === 0 ? (
            <EmptyState
              icon={<UserPlus className="h-8 w-8" />}
              title="Sin prospectos"
              description={
                search || statusFilter !== "all"
                  ? "No hay prospectos para los filtros seleccionados."
                  : "No hay prospectos registrados todavía."
              }
              compact
            />
          ) : view === "cards" ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredLeads.map((lead) => {
                const meta = lead.metadata as Record<string, unknown> | undefined;
                const totalGuards = (meta?.totalGuards as number) || 0;
                const rejectionInfo = getLeadRejectionInfo(lead.metadata);
                return (
                  <div
                    key={lead.id}
                    className="rounded-lg border p-4 transition-colors hover:border-primary/30 hover:bg-accent/30 group space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-sm truncate">{lead.companyName || "Empresa sin nombre"}</p>
                      <StatusBadge status={lead.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">{leadDisplayName(lead)}</p>
                    {lead.email && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                        <Mail className="h-3 w-3 shrink-0" />{lead.email}
                      </p>
                    )}
                    {lead.phone && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3 shrink-0" />{lead.phone}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {totalGuards > 0 && (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                          {totalGuards} guardia{totalGuards > 1 ? "s" : ""}
                        </span>
                      )}
                      {lead.source && (
                        <span className="text-[10px] text-muted-foreground/80">
                          {lead.source === "web_cotizador" ? "Cotizador Web" : lead.source === "web_cotizador_inteligente" ? "Cotizador IA" : lead.source}
                        </span>
                      )}
                      {lead.status === "rejected" && rejectionInfo && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            rejectionInfo.emailSent
                              ? "bg-blue-500/15 text-blue-400"
                              : "bg-amber-500/15 text-amber-400"
                          }`}
                        >
                          {rejectionInfo.emailSent ? "Correo enviado" : "Sin correo enviado"}
                        </span>
                      )}
                    </div>
                    {lead.status === "rejected" && rejectionInfo?.note && (
                      <p className="rounded-md border border-border/70 bg-muted/20 px-2 py-1 text-[11px] text-muted-foreground line-clamp-3">
                        Observación: {rejectionInfo.note}
                      </p>
                    )}
                    <div className="flex items-center justify-between pt-1">
                      <CrmDates createdAt={lead.createdAt} />
                      <div className="flex items-center gap-1">
                        {lead.status === "pending" && (
                          <>
                            <Button onClick={() => openApproveModal(lead)} size="sm" className="h-7 text-xs">
                              Aprobar
                            </Button>
                            <Button
                              onClick={() => openRejectModal(lead)}
                              size="sm"
                              variant="destructive"
                              className="h-7 text-xs"
                            >
                              Rechazar
                            </Button>
                          </>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteConfirm({ open: true, id: lead.id })}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredLeads.map((lead) => {
                const meta = lead.metadata as Record<string, unknown> | undefined;
                const dotacion = (meta?.dotacion as { puesto: string; cantidad: number; dias?: string[]; horaInicio?: string; horaFin?: string }[] | undefined);
                const totalGuards = (meta?.totalGuards as number) || 0;
                const rejectionInfo = getLeadRejectionInfo(lead.metadata);

                return (
                  <div
                    key={lead.id}
                    className="rounded-lg border p-3 sm:p-4 transition-colors hover:bg-accent/30 group"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm">
                            {lead.companyName || "Empresa sin nombre"}
                          </p>
                          <StatusBadge status={lead.status} />
                          {lead.source === "web_cotizador" && (
                            <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-medium text-blue-400">
                              Web
                            </span>
                          )}
                          {lead.source === "web_cotizador_inteligente" && (
                            <span className="rounded-full bg-teal-500/15 px-2 py-0.5 text-[10px] font-medium text-teal-400">
                              Cotizador Inteligente
                            </span>
                          )}
                          {totalGuards > 0 && (
                            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                              {totalGuards} guardia{totalGuards > 1 ? "s" : ""}
                            </span>
                          )}
                          {lead.status === "rejected" && rejectionInfo && (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                rejectionInfo.emailSent
                                  ? "bg-blue-500/15 text-blue-400"
                                  : "bg-amber-500/15 text-amber-400"
                              }`}
                            >
                              {rejectionInfo.emailSent ? "Correo enviado" : "Sin correo enviado"}
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-xs text-muted-foreground">{leadDisplayName(lead)}</span>
                          {lead.email ? (
                            <a
                              href={`mailto:${lead.email}`}
                              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Mail className="h-3 w-3" />
                              {lead.email}
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">Sin email</span>
                          )}
                          {lead.phone && (
                            <a
                              href={telHref(lead.phone)}
                              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Phone className="h-3 w-3" />
                              {lead.phone}
                            </a>
                          )}
                          {lead.status === "rejected" && rejectionInfo?.note && (
                            <span className="inline-flex items-center rounded border border-border/70 bg-muted/20 px-2 py-0.5 text-[11px] text-muted-foreground max-w-full truncate">
                              Observación: {rejectionInfo.note}
                            </span>
                          )}
                          <div className="flex items-center gap-1 ml-1">
                            {lead.phone && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                asChild
                              >
                                <a href={telHref(lead.phone)} onClick={(e) => e.stopPropagation()} aria-label="Llamar">
                                  <Phone className="h-3.5 w-3.5" />
                                </a>
                              </Button>
                            )}
                            {lead.email && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                asChild
                              >
                                <a href={`mailto:${lead.email}`} onClick={(e) => e.stopPropagation()} aria-label="Enviar email">
                                  <Mail className="h-3.5 w-3.5" />
                                </a>
                              </Button>
                            )}
                            {lead.phone && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground hover:text-emerald-600"
                                asChild
                              >
                                <a href={whatsappHref(lead.phone)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} aria-label="WhatsApp">
                                  <MessageSquare className="h-3.5 w-3.5" />
                                </a>
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 items-center">
                          <CrmDates createdAt={lead.createdAt} updatedAt={(lead as { updatedAt?: string }).updatedAt} showTime />
                          {lead.source && lead.source !== "web_cotizador" && lead.source !== "web_cotizador_inteligente" && (
                            <span className="text-[11px] text-muted-foreground/80">
                              Fuente: {lead.source}
                            </span>
                          )}
                          {lead.industry && (
                            <span className="text-[11px] text-muted-foreground/80">
                              Industria: {lead.industry}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {lead.status === "pending" && (
                          <>
                            <Button
                              onClick={() => openApproveModal(lead)}
                              size="sm"
                            >
                              Revisar y aprobar
                            </Button>
                            <Button
                              onClick={() => openRejectModal(lead)}
                              size="sm"
                              variant="destructive"
                            >
                              Rechazar
                            </Button>
                          </>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ open: true, id: lead.id }); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Dotación solicitada — UI mejorada */}
                    {dotacion && dotacion.length > 0 && (
                      <div className="mt-3 rounded-lg border border-border/80 bg-muted/20 overflow-hidden">
                        <div className="px-3 py-2 border-b border-border/60 bg-muted/30 flex items-center gap-2">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Dotación solicitada
                          </span>
                          {totalGuards > 0 && (
                            <span className="text-[10px] font-medium text-foreground bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                              {totalGuards} guardia{totalGuards > 1 ? "s" : ""} total
                            </span>
                          )}
                        </div>
                        <div className="divide-y divide-border/60">
                          {dotacion.map((d, i) => (
                            <div key={i} className="px-3 py-2.5 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Briefcase className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="text-sm font-medium text-foreground truncate">{d.puesto}</span>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground pl-5 sm:pl-0">
                                <span className="inline-flex items-center gap-1">
                                  <Users className="h-3 w-3 shrink-0" />
                                  {d.cantidad} guardia{d.cantidad > 1 ? "s" : ""}
                                </span>
                                {d.horaInicio && d.horaFin && (
                                  <span className="inline-flex items-center gap-1">
                                    <Clock className="h-3 w-3 shrink-0" />
                                    {d.horaInicio} – {d.horaFin}
                                  </span>
                                )}
                                {d.dias && d.dias.length > 0 && (
                                  <span className="inline-flex items-center gap-1">
                                    <Calendar className="h-3 w-3 shrink-0" />
                                    {d.dias.length === 7 ? "Todos los días" : d.dias.join(", ")}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Notes preview */}
                    {lead.notes && !dotacion && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                        {lead.notes}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(v) => setDeleteConfirm({ ...deleteConfirm, open: v })}
        title="Eliminar prospecto"
        description="El prospecto será eliminado permanentemente. Esta acción no se puede deshacer."
        onConfirm={() => deleteLead(deleteConfirm.id)}
      />
    </div>
  );
}
