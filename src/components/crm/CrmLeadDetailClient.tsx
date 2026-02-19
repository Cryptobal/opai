/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
} from "@/components/ui/dialog";
import { CrmLead } from "@/types";
import {
  Plus,
  Loader2,
  AlertTriangle,
  Trash2,
  Users,
  Briefcase,
  MapPin,
  X,
  Copy,
  ExternalLink,
  Mailbox,
  Sparkles,
  Phone,
  Mail,
  MessageSquare,
  Clock,
  Calendar,
  Save,
  CheckCircle2,
  XCircle,
  Building2,
  FileText,
  ArrowRight,
  Globe,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/opai/StatusBadge";
import { CrmDates } from "@/components/crm/CrmDates";
import { CrmDetailLayout, type DetailSection } from "./CrmDetailLayout";
import { DetailField, DetailFieldGrid } from "./DetailField";
import { AddressAutocomplete, type AddressResult } from "@/components/ui/AddressAutocomplete";
import { toast } from "sonner";
import { formatNumber, parseLocalizedNumber } from "@/lib/utils";
import { resolveDocument, tiptapToPlainText } from "@/lib/docs/token-resolver";
import { FileAttachments } from "./FileAttachments";

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
  numPuestos?: number;
  horaInicio: string;
  horaFin: string;
  dias: string[];
};

type InstallationDraft = {
  _key: string;
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

const COST_GROUPS_DIRECTOS = [
  { id: "uniform", label: "Uniformes" },
  { id: "exam", label: "Exámenes" },
  { id: "meal", label: "Alimentación" },
] as const;
const COST_GROUPS_INDIRECTOS = [
  { id: "equipment", label: "Equipos operativos" },
  { id: "transport", label: "Costos de transporte" },
  { id: "vehicle", label: "Vehículos" },
  { id: "infrastructure", label: "Infraestructura" },
  { id: "system", label: "Sistemas" },
] as const;

/** Cost groups preseleccionados por defecto al aprobar una lead */
const DEFAULT_SELECTED_COST_GROUPS = ["uniform", "system", "equipment"];
const DAY_START_OPTIONS = ["07:00", "07:30", "08:00", "08:30", "09:00", "09:30"] as const;

type CpqCatalogOption = { id: string; name: string };

/* ─── Helpers ─── */

function normalizeCatalogLabel(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

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

function createEmptyDotacion(
  defaultCargoId = "",
  defaultRolId = "",
  defaultPuestoTrabajoId = "",
  defaultPuestoName = "Control de Acceso"
): DotacionItem {
  return {
    puestoTrabajoId: defaultPuestoTrabajoId,
    puesto: defaultPuestoName,
    customName: "",
    cargoId: defaultCargoId,
    rolId: defaultRolId,
    baseSalary: 550000,
    shiftType: "day",
    cantidad: 1,
    numPuestos: 1,
    horaInicio: "08:00",
    horaFin: "20:00",
    dias: [...WEEKDAYS],
  };
}

const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "outlook.com", "outlook.es",
  "yahoo.com", "yahoo.es", "live.com", "live.cl", "msn.com",
  "icloud.com", "me.com", "mac.com", "protonmail.com", "proton.me",
  "mail.com", "aol.com", "zoho.com", "yandex.com", "tutanota.com",
]);

function extractWebsiteFromEmail(email: string): string {
  if (!email) return "";
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain || GENERIC_EMAIL_DOMAINS.has(domain)) return "";
  return `https://${domain}`;
}

function telHref(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 0) return "";
  return `tel:${digits.length <= 9 ? "+56" + digits : "+" + digits}`;
}

function whatsappHref(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 0) return "";
  const withCountry = digits.length === 9 && digits.startsWith("9") ? "56" + digits : digits.length >= 10 ? digits : "56" + digits;
  return `https://wa.me/${withCountry}`;
}

/* ─── Form types ─── */

type ApproveFormState = {
  accountName: string;
  legalName: string;
  legalRepresentativeName: string;
  legalRepresentativeRut: string;
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

type DuplicateAccount = { id: string; name: string; rut?: string | null; type?: string };
type ExistingContact = { id: string; firstName: string | null; lastName: string | null; email: string | null };
type InstallationConflict = { name: string; id: string };
type DocTemplateForReject = { id: string; name: string; content: unknown; module: string };

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

function getLeadRejectionInfo(metadata: unknown): {
  emailSent: boolean;
  emailProviderMessageId: string | null;
  note: string | null;
  reason: string | null;
} | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const rejection = (metadata as Record<string, unknown>).rejection;
  if (!rejection || typeof rejection !== "object" || Array.isArray(rejection)) return null;
  const emailSent = Boolean((rejection as Record<string, unknown>).emailSent);
  const messageId = (rejection as Record<string, unknown>).emailProviderMessageId;
  const note = (rejection as Record<string, unknown>).note;
  const reason = (rejection as Record<string, unknown>).reason;
  return {
    emailSent,
    emailProviderMessageId: typeof messageId === "string" && messageId.trim() ? messageId : null,
    note: typeof note === "string" && note.trim() ? note.trim() : null,
    reason: typeof reason === "string" ? reason : null,
  };
}

function getRejectReasonLabel(reason: string | null): string {
  if (!reason) return "—";
  return REJECTION_REASON_OPTIONS.find((opt) => opt.value === reason)?.label ?? reason;
}

/* ─── Status helpers ─── */

function getStatusBadge(status: string): { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" | "outline" } {
  switch (status) {
    case "pending": return { label: "Pendiente", variant: "warning" };
    case "in_review": return { label: "En revisión", variant: "secondary" };
    case "approved": return { label: "Aprobado", variant: "success" };
    case "rejected": return { label: "Rechazado", variant: "destructive" };
    default: return { label: status, variant: "outline" };
  }
}

function getSourceLabel(source: string | null | undefined): string {
  if (!source) return "—";
  switch (source) {
    case "web_cotizador": return "Cotizador Web";
    case "web_cotizador_inteligente": return "Cotizador Inteligente (IA)";
    case "email_forward": return "Correo reenviado";
    default: return source;
  }
}

/* ─── Component ─── */

export function CrmLeadDetailClient({ lead: initialLead }: { lead: CrmLead }) {
  const router = useRouter();
  const [lead, setLead] = useState<CrmLead>(initialLead);
  const isEditable = lead.status === "pending" || lead.status === "in_review";

  // ─── Approve form state ───
  const [approving, setApproving] = useState(false);
  const [savingLead, setSavingLead] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateAccount[]>([]);
  const [existingContact, setExistingContact] = useState<ExistingContact | null>(null);
  const [installationConflicts, setInstallationConflicts] = useState<InstallationConflict[]>([]);
  const [duplicateChecked, setDuplicateChecked] = useState(false);
  const [useExistingAccountId, setUseExistingAccountId] = useState<string | null>(null);
  const [contactResolution, setContactResolution] = useState<"create" | "overwrite" | "use_existing">("create");
  const [installationUseExisting, setInstallationUseExisting] = useState<Record<string, string>>({});
  const [approveForm, setApproveForm] = useState<ApproveFormState>({
    accountName: "", legalName: "", legalRepresentativeName: "", legalRepresentativeRut: "",
    contactFirstName: "", contactLastName: "", email: "", phone: "",
    dealTitle: "", rut: "", industry: "", segment: "", roleTitle: "",
    website: "", companyInfo: "", notes: "",
  });
  const [selectedCostGroups, setSelectedCostGroups] = useState<string[]>(DEFAULT_SELECTED_COST_GROUPS);
  const [inferringCosts, setInferringCosts] = useState(false);
  const [installations, setInstallations] = useState<InstallationDraft[]>([]);
  const [enrichingCompanyInfo, setEnrichingCompanyInfo] = useState(false);
  const [detectedCompanyLogoUrl, setDetectedCompanyLogoUrl] = useState<string | null>(null);

  // ─── Approval success modal state ───
  const [approvalResult, setApprovalResult] = useState<{
    account: { id: string; name: string };
    contact: { id: string; firstName: string; lastName: string };
    deal: { id: string; title: string };
    quotes: { id: string; code: string; installationName: string | null }[];
  } | null>(null);

  // ─── Reject modal state ───
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState<LeadRejectReason>("other");
  const [rejectNote, setRejectNote] = useState("");
  const [rejectSendEmail, setRejectSendEmail] = useState(false);
  const [rejectTemplateId, setRejectTemplateId] = useState<string>("");
  const [rejectEmailSubject, setRejectEmailSubject] = useState("");
  const [rejectEmailBody, setRejectEmailBody] = useState("");

  // ─── Delete confirm state ───
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // ─── Catalogs ───
  const [industries, setIndustries] = useState<{ id: string; name: string }[]>([]);
  const [docTemplatesReject, setDocTemplatesReject] = useState<DocTemplateForReject[]>([]);
  const [cpqPuestos, setCpqPuestos] = useState<CpqCatalogOption[]>([]);
  const [cpqCargos, setCpqCargos] = useState<CpqCatalogOption[]>([]);
  const [cpqRoles, setCpqRoles] = useState<CpqCatalogOption[]>([]);

  // ─── Load catalogs ───
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
          setDocTemplatesReject(all.filter((t) => t.module === "crm" || t.module === "mail"));
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

  const defaultPuesto = useMemo(() => {
    const byControlAcceso = cpqPuestos.find((p) => {
      const normalized = normalizeCatalogLabel(p.name);
      return normalized.includes("control") && normalized.includes("acceso");
    });
    const byAcceso = cpqPuestos.find((p) => normalizeCatalogLabel(p.name).includes("acceso"));
    const selected = byControlAcceso || byAcceso || cpqPuestos[0];
    return selected ? { id: selected.id, name: selected.name } : { id: "", name: "Control de Acceso" };
  }, [cpqPuestos]);

  const defaultCargoId = useMemo(() => {
    const byGuardiaExact = cpqCargos.find((c) => normalizeCatalogLabel(c.name) === "guardia");
    const byGuardiaContains = cpqCargos.find((c) => normalizeCatalogLabel(c.name).includes("guardia"));
    return byGuardiaExact?.id || byGuardiaContains?.id || cpqCargos[0]?.id || "";
  }, [cpqCargos]);

  const defaultRolId = useMemo(() => {
    const by4x4 = cpqRoles.find((r) => normalizeCatalogLabel(r.name).replace(/\s+/g, "") === "4x4");
    return by4x4?.id || cpqRoles[0]?.id || "";
  }, [cpqRoles]);

  // ─── Initialize form from lead ───
  useEffect(() => {
    if (!isEditable) return;
    const meta = lead.metadata as Record<string, unknown> | undefined;
    const companyEnrichment =
      meta?.companyEnrichment && typeof meta.companyEnrichment === "object" && !Array.isArray(meta.companyEnrichment)
        ? (meta.companyEnrichment as Record<string, unknown>)
        : null;
    const emailExtracted =
      meta?.extracted && typeof meta.extracted === "object" && !Array.isArray(meta.extracted)
        ? (meta.extracted as Record<string, unknown>)
        : null;
    const leadDotacion = (meta?.dotacion as DotacionItem[] | undefined) || [];

    const str = (source: Record<string, unknown> | null, key: string): string =>
      source && typeof source[key] === "string" ? (source[key] as string) : "";

    const draft =
      meta?.approveFormDraft && typeof meta.approveFormDraft === "object" && !Array.isArray(meta.approveFormDraft)
        ? (meta.approveFormDraft as Record<string, unknown>)
        : null;

    const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(" ");

    setApproveForm({
      accountName: lead.companyName || "",
      legalName: str(draft, "legalName") || str(companyEnrichment, "legalName") || str(emailExtracted, "legalName") || "",
      legalRepresentativeName: str(draft, "legalRepresentativeName") || str(companyEnrichment, "legalRepresentativeName") || str(emailExtracted, "legalRepresentativeName") || "",
      legalRepresentativeRut: str(draft, "legalRepresentativeRut") || str(companyEnrichment, "legalRepresentativeRut") || "",
      contactFirstName: lead.firstName || "",
      contactLastName: lead.lastName || "",
      email: lead.email || "",
      phone: lead.phone || "",
      dealTitle: str(draft, "dealTitle") || `Oportunidad ${lead.companyName || fullName || ""}`.trim(),
      rut: str(draft, "rut") || str(companyEnrichment, "accountRut") || str(emailExtracted, "rut") || "",
      industry: str(draft, "industry") || str(companyEnrichment, "industry") || lead.industry || "",
      segment: str(draft, "segment") || str(companyEnrichment, "segment") || "",
      roleTitle: str(draft, "roleTitle") || str(emailExtracted, "contactRole") || "",
      website: (lead as any).website || extractWebsiteFromEmail(lead.email || ""),
      companyInfo: str(draft, "companyInfo") || "",
      notes: lead.notes || "",
    });

    const draftCostGroups = draft?.selectedCostGroups;
    setSelectedCostGroups(
      Array.isArray(draftCostGroups) && draftCostGroups.every((x) => typeof x === "string")
        ? (draftCostGroups as string[])
        : DEFAULT_SELECTED_COST_GROUPS
    );

    // Build installations from lead data
    const leadLat = meta?.lat as number | undefined;
    const leadLng = meta?.lng as number | undefined;
    const leadAddress = ((lead as any).address || "").trim();
    const leadCommune = ((lead as any).commune || "").trim();
    const leadCity = ((lead as any).city || "").trim();
    const instAddress = leadAddress || [leadCommune, leadCity].filter(Boolean).join(", ");
    const firstInst = createEmptyInstallation(
      lead.companyName || "",
      instAddress,
      leadCity,
      leadCommune,
    );
    if (leadLat != null) firstInst.lat = leadLat;
    if (leadLng != null) firstInst.lng = leadLng;
    const hasUsefulSchedule = (d: DotacionItem): boolean => {
      const start = normalizeTimeToHHmm(d.horaInicio, "");
      const end = normalizeTimeToHHmm(d.horaFin, "");
      if (!start || !end) return false;
      if (start === "00:00" && end === "00:00") return false;
      return true;
    };
    firstInst.dotacion = leadDotacion.map((d) => {
      const useLeadSchedule = hasUsefulSchedule(d);
      const shiftType = useLeadSchedule ? inferShiftType(d.horaInicio || "08:00", d.horaFin || "20:00") : "day";
      return {
        puestoTrabajoId: defaultPuesto.id,
        puesto: defaultPuesto.name,
        customName: typeof d.customName === "string" && d.customName.trim().length > 0 ? d.customName : defaultPuesto.name,
        cargoId: defaultCargoId,
        rolId: defaultRolId,
        baseSalary: typeof d.baseSalary === "number" && d.baseSalary > 0 ? d.baseSalary : 550000,
        shiftType,
        cantidad: d.cantidad || 1,
        numPuestos:
          typeof d.numPuestos === "number" && Number.isFinite(d.numPuestos) && d.numPuestos > 0
            ? Math.floor(d.numPuestos)
            : 1,
        horaInicio: useLeadSchedule ? normalizeTimeToHHmm(d.horaInicio, "08:00") : "08:00",
        horaFin: useLeadSchedule ? normalizeTimeToHHmm(d.horaFin, "20:00") : "20:00",
        dias: useLeadSchedule ? normalizeLeadDias(d.dias) : [...WEEKDAYS],
      };
    });
    setInstallations([firstInst]);
    setDetectedCompanyLogoUrl(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id, isEditable]);

  // Apply catalog defaults to installations when catalogs load
  useEffect(() => {
    if (!isEditable) return;
    if (!defaultPuesto.id && !defaultCargoId && !defaultRolId) return;
    setInstallations((prev) =>
      prev.map((inst) => ({
        ...inst,
        dotacion: inst.dotacion.map((dot) => ({
          ...dot,
          puestoTrabajoId: dot.puestoTrabajoId || defaultPuesto.id,
          puesto: dot.puesto || defaultPuesto.name,
          cargoId: dot.cargoId || defaultCargoId,
          rolId: dot.rolId || defaultRolId,
          baseSalary: dot.baseSalary ?? 550000,
          shiftType: dot.shiftType || inferShiftType(dot.horaInicio, dot.horaFin),
          numPuestos:
            typeof dot.numPuestos === "number" && Number.isFinite(dot.numPuestos) && dot.numPuestos > 0
              ? Math.floor(dot.numPuestos)
              : 1,
        })),
      }))
    );
  }, [isEditable, defaultPuesto.id, defaultPuesto.name, defaultCargoId, defaultRolId]);

  // ─── Style helpers ───
  const inputClassName = "bg-background text-foreground placeholder:text-muted-foreground border-input focus-visible:ring-ring";
  const selectClassName = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
  const selectCompactClassName = "flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  // ─── Form helpers ───
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

  const shouldReplaceEnriched = (currentValue: string): boolean => {
    const normalized = currentValue.trim().toLowerCase();
    return !normalized || normalized === "not available" || normalized === "n/a" || normalized === "no disponible";
  };

  // ─── Enrich company info ───
  const enrichCompanyInfoFromWebsite = async () => {
    const website = approveForm.website.trim();
    if (!website) { toast.error("Primero ingresa la página web de la empresa."); return; }
    setEnrichingCompanyInfo(true);
    try {
      const response = await fetch("/api/crm/company-enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ website, companyName: approveForm.accountName }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "No se pudo obtener información del sitio.");
      const summary = payload?.data?.summary || "";
      const normalizedWebsite = payload?.data?.websiteNormalized || "";
      const companyNameDetected = payload?.data?.companyNameDetected || "";
      const logoUrl = payload?.data?.localLogoUrl || payload?.data?.logoUrl || null;
      const industry = payload?.data?.industry || "";
      const segment = payload?.data?.segment || "";
      const legalName = payload?.data?.legalName || "";
      const companyRut = payload?.data?.companyRut || "";
      const legalRepresentativeName = payload?.data?.legalRepresentativeName || "";
      const legalRepresentativeRut = payload?.data?.legalRepresentativeRut || "";
      if (normalizedWebsite) updateApproveForm("website", normalizedWebsite);
      if (summary) updateApproveForm("companyInfo", summary);
      setApproveForm((prev) => ({
        ...prev,
        accountName:
          companyNameDetected && !["not available", "n/a", "no disponible"].includes(companyNameDetected.trim().toLowerCase())
            ? companyNameDetected : prev.accountName,
        dealTitle:
          companyNameDetected && (prev.dealTitle.trim() === "" || prev.dealTitle.trim().startsWith("Oportunidad "))
            ? `Oportunidad ${companyNameDetected}`.trim() : prev.dealTitle,
        industry: shouldReplaceEnriched(prev.industry) && industry ? industry : prev.industry,
        segment: shouldReplaceEnriched(prev.segment) && segment ? segment : prev.segment,
        legalName: shouldReplaceEnriched(prev.legalName) && legalName ? legalName : prev.legalName,
        rut: shouldReplaceEnriched(prev.rut) && companyRut ? companyRut : prev.rut,
        legalRepresentativeName: shouldReplaceEnriched(prev.legalRepresentativeName) && legalRepresentativeName ? legalRepresentativeName : prev.legalRepresentativeName,
        legalRepresentativeRut: shouldReplaceEnriched(prev.legalRepresentativeRut) && legalRepresentativeRut ? legalRepresentativeRut : prev.legalRepresentativeRut,
      }));
      setDetectedCompanyLogoUrl(logoUrl);
      toast.success("Información de la empresa completada desde la web.");
    } catch (error) {
      console.error(error);
      const detail = error instanceof Error ? error.message : "";
      toast.error(detail || "No se pudo traer datos de la empresa. Verifica que la URL sea correcta e intenta de nuevo.");
    } finally {
      setEnrichingCompanyInfo(false);
    }
  };

  // ─── Installation helpers ───
  const updateInstallation = (key: string, field: keyof InstallationDraft, value: unknown) => {
    setInstallations((prev) => prev.map((inst) => inst._key === key ? { ...inst, [field]: value } : inst));
  };
  const removeInstallation = (key: string) => { setInstallations((prev) => prev.filter((inst) => inst._key !== key)); };
  const addInstallation = () => { setInstallations((prev) => [...prev, createEmptyInstallation()]); };
  const handleAddressChange = (key: string, result: AddressResult) => {
    setInstallations((prev) => prev.map((inst) => inst._key === key ? { ...inst, address: result.address, city: result.city, commune: result.commune, lat: result.lat, lng: result.lng } : inst));
  };
  const addDotacionToInst = (instKey: string) => {
    setInstallations((prev) =>
      prev.map((inst) =>
        inst._key === instKey
          ? { ...inst, dotacion: [...inst.dotacion, createEmptyDotacion(defaultCargoId, defaultRolId, defaultPuesto.id, defaultPuesto.name)] }
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
        const clone: DotacionItem = {
          ...original,
          dias: [...original.dias],
          cantidad: original.cantidad || 1,
          numPuestos: original.numPuestos || 1,
        };
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
            : { ...current, shiftType, horaInicio: DAY_START_OPTIONS.includes(current.horaInicio as (typeof DAY_START_OPTIONS)[number]) ? current.horaInicio : "08:00", horaFin: "20:00" };
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
        nextDot[dotIdx] = { ...current, shiftType: "day", horaInicio: normalizedStart, horaFin: minutesToTime((toMinutes(normalizedStart) ?? 480) + 12 * 60) };
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

  // ─── Installation conflicts ───
  const installationNamesKey = useMemo(() => installations.map((i) => i.name).join("|"), [installations]);

  useEffect(() => {
    if (!isEditable || !useExistingAccountId) { setInstallationConflicts([]); return; }
    const instPayload = installations.filter((i) => i.name.trim()).map(({ _key, ...r }) => r);
    if (instPayload.length === 0) return;
    fetch(`/api/crm/leads/${lead.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...approveForm, checkDuplicates: true, useExistingAccountId, installations: instPayload }),
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
  }, [isEditable, lead.id, useExistingAccountId, approveForm.accountName, installationNamesKey]);

  // ─── Save draft (in_review) ───
  const saveLeadDraft = async () => {
    setSavingLead(true);
    try {
      const payload: Record<string, unknown> = {
        companyName: approveForm.accountName.trim() || null,
        firstName: approveForm.contactFirstName.trim() || null,
        lastName: approveForm.contactLastName.trim() || null,
        email: approveForm.email.trim() || null,
        phone: approveForm.phone.trim() || null,
        notes: approveForm.notes.trim() || null,
        industry: approveForm.industry.trim() || null,
        website: approveForm.website.trim() || null,
        status: "in_review",
        metadata: {
          ...(lead.metadata && typeof lead.metadata === "object" ? lead.metadata : {}),
          approveFormDraft: {
            rut: approveForm.rut, legalName: approveForm.legalName,
            legalRepresentativeName: approveForm.legalRepresentativeName,
            legalRepresentativeRut: approveForm.legalRepresentativeRut,
            segment: approveForm.segment, roleTitle: approveForm.roleTitle,
            dealTitle: approveForm.dealTitle, companyInfo: approveForm.companyInfo,
            selectedCostGroups,
          },
        },
      };
      const res = await fetch(`/api/crm/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Error al guardar");
      setLead((prev) => ({ ...prev, ...data.data }));
      toast.success("Lead guardado en revisión");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el lead");
    } finally {
      setSavingLead(false);
    }
  };

  // ─── Approve lead ───
  const approveLead = async () => {
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
        legalName: approveForm.legalName || undefined,
        legalRepresentativeName: approveForm.legalRepresentativeName || undefined,
        legalRepresentativeRut: approveForm.legalRepresentativeRut || undefined,
        useExistingAccountId: useExistingAccountId || undefined,
        contactResolution: existingContact ? contactResolution : undefined,
        contactId: (existingContact && (contactResolution === "overwrite" || contactResolution === "use_existing")) ? existingContact.id : undefined,
        installations: instPayload,
        selectedCostGroups,
      };

      if (!duplicateChecked) {
        const checkRes = await fetch(`/api/crm/leads/${lead.id}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, checkDuplicates: true }),
        });
        const checkData = await checkRes.json();
        if (!checkData.success) { setApproving(false); return; }
        setDuplicates(checkData.duplicates || []);
        const exContact = checkData.existingContact ?? null;
        setExistingContact(exContact);
        if (exContact) setContactResolution("use_existing");
        const dups = checkData.duplicates || [];
        if (dups.length > 0) setUseExistingAccountId(dups[0]?.id ?? null);
        const conflicts: InstallationConflict[] = checkData.installationConflicts || [];
        setInstallationConflicts(conflicts);
        setInstallationUseExisting((prev) => {
          const next = { ...prev };
          for (const conf of conflicts) {
            for (const inst of installations) {
              if (inst.name.trim().toLowerCase() === conf.name.toLowerCase()) next[inst._key] = conf.id;
            }
          }
          return next;
        });
        setDuplicateChecked(true);

        const hasAnyConflict = (checkData.duplicates?.length > 0) || checkData.existingContact || conflicts.length > 0;
        if (hasAnyConflict) {
          const hasInstallationConflictOnly = conflicts.length > 0 && !(checkData.duplicates?.length > 0) && !checkData.existingContact;
          if (hasInstallationConflictOnly) {
            for (const conf of conflicts) {
              for (const inst of installations) {
                if (inst.name.trim().toLowerCase() === conf.name.toLowerCase()) {
                  setInstallationUseExisting((prev) => ({ ...prev, [inst._key]: conf.id }));
                }
              }
            }
          }
          toast.info("Revisa los datos y haz clic en \"Confirmar aprobación\" para crear la cuenta, contacto y negocio.");
        } else {
          toast.info("Sin conflictos detectados. Haz clic en \"Confirmar aprobación\" para crear la cuenta, contacto y negocio.");
        }
        setApproving(false);
        return;
      }

      const response = await fetch(`/api/crm/leads/${lead.id}/approve`, {
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
      if (!response.ok) throw new Error(result?.error || "Error aprobando lead");
      setApprovalResult({
        account: { id: result.data.account.id, name: result.data.account.name },
        contact: { id: result.data.contact.id, firstName: result.data.contact.firstName, lastName: result.data.contact.lastName },
        deal: { id: result.data.deal.id, title: result.data.deal.title },
        quotes: result.data.quotes || [],
      });
    } catch (error) {
      console.error(error);
      toast.error("No se pudo aprobar el lead.");
    } finally {
      setApproving(false);
    }
  };

  // ─── Reject lead ───
  const openRejectModal = () => {
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
    if (!template?.content) return;
    const entities = {
      contact: { firstName: lead.firstName || "", lastName: lead.lastName || "", email: lead.email || "", phone: lead.phone || "" },
      account: { name: lead.companyName || "" },
    };
    const { resolvedContent } = resolveDocument(template.content, entities);
    setRejectEmailSubject(template.name);
    setRejectEmailBody(tiptapToPlainText(resolvedContent));
  };

  const rejectLead = async () => {
    if (rejectSendEmail && (!rejectEmailSubject.trim() || !rejectEmailBody.trim())) {
      toast.error("Asunto y mensaje son obligatorios para enviar el correo.");
      return;
    }
    setRejecting(true);
    try {
      const response = await fetch(`/api/crm/leads/${lead.id}/reject`, {
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
      if (!response.ok) throw new Error(payload?.error || "No se pudo rechazar el lead");
      toast.success(rejectSendEmail ? "Lead rechazado y correo enviado" : "Lead rechazado");
      router.push("/crm/leads");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "No se pudo rechazar el lead.");
    } finally {
      setRejecting(false);
    }
  };

  // ─── Delete lead ───
  const deleteLead = async () => {
    try {
      const res = await fetch(`/api/crm/leads/${lead.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Prospecto eliminado");
      router.push("/crm/leads");
    } catch {
      toast.error("No se pudo eliminar");
    }
  };

  const canConfirmReject = !rejectSendEmail || (rejectEmailSubject.trim().length > 0 && rejectEmailBody.trim().length > 0);

  // ─── Metadata helpers ───
  const meta = lead.metadata as Record<string, unknown> | undefined;
  const dotacion = (meta?.dotacion as { puesto: string; cantidad: number; numPuestos?: number; dias?: string[]; horaInicio?: string; horaFin?: string }[] | undefined);
  const totalGuards = (meta?.totalGuards as number) || 0;
  const rejectionInfo = getLeadRejectionInfo(lead.metadata);
  const statusBadge = getStatusBadge(lead.status);
  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Sin contacto";

  // ─── Build header actions (dropdown menu) ───
  const headerActions = useMemo(() => [
    {
      label: "Eliminar",
      icon: Trash2,
      variant: "destructive" as const,
      onClick: () => setDeleteConfirm(true),
    },
  ], []);

  // ─── Build sections ───
  const sections: DetailSection[] = [];

  // === SECTION: General ===
  sections.push({
    key: "general",
    label: "Información del lead",
    children: (
      <div className="space-y-4">
        <DetailFieldGrid columns={3}>
          <DetailField label="Empresa" value={lead.companyName} />
          <DetailField label="Contacto" value={fullName} />
          <DetailField label="Email" value={lead.email} copyable />
          <DetailField label="Teléfono" value={lead.phone} mono copyable />
          <DetailField label="Fuente" value={getSourceLabel(lead.source)} />
          <DetailField label="Industria" value={lead.industry} />
          {((lead as any).address || (lead as any).commune || (lead as any).city) && (() => {
            const addressText = [(lead as any).address, (lead as any).commune, (lead as any).city].filter(Boolean).join(", ");
            const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText + ", Chile")}`;
            return (
              <DetailField
                label="Dirección"
                value={
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors">
                      {addressText}
                    </a>
                  </span>
                }
              />
            );
          })()}
          {(lead as any).website && (
            <DetailField
              label="Sitio web"
              value={
                <a href={(lead as any).website.startsWith("http") ? (lead as any).website : `https://${(lead as any).website}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-primary underline underline-offset-2 hover:text-primary/80 transition-colors">
                  <Globe className="h-3.5 w-3.5 shrink-0" />
                  {(lead as any).website.replace(/^https?:\/\//, "")}
                </a>
              }
            />
          )}
        </DetailFieldGrid>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <CrmDates createdAt={lead.createdAt} updatedAt={lead.updatedAt} showTime />
          {lead.phone && (
            <div className="flex items-center gap-1 ml-2">
              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" asChild>
                <a href={telHref(lead.phone)} aria-label="Llamar"><Phone className="h-3.5 w-3.5" /></a>
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-emerald-600" asChild>
                <a href={whatsappHref(lead.phone)} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp"><MessageSquare className="h-3.5 w-3.5" /></a>
              </Button>
            </div>
          )}
          {lead.email && (
            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" asChild>
              <a href={`mailto:${lead.email}`} aria-label="Enviar email"><Mail className="h-3.5 w-3.5" /></a>
            </Button>
          )}
        </div>

        {/* Dotación solicitada (read-only summary) */}
        {dotacion && dotacion.length > 0 && (
          <div className="rounded-lg border border-border/80 bg-muted/20 overflow-hidden">
            <div className="px-3 py-2 border-b border-border/60 bg-muted/30 flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dotación solicitada</span>
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
                      {d.cantidad} guardia{d.cantidad > 1 ? "s" : ""} x {d.numPuestos || 1} puesto{(d.numPuestos || 1) > 1 ? "s" : ""}
                    </span>
                    {d.horaInicio && d.horaFin && (
                      <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3 shrink-0" />{d.horaInicio} – {d.horaFin}</span>
                    )}
                    {d.dias && d.dias.length > 0 && (
                      <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3 shrink-0 text-white" />{d.dias.length === 7 ? "Todos los días" : d.dias.join(", ")}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Correo original (email_forward) */}
        {lead.source === "email_forward" && meta && (
          <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3 min-w-0 overflow-hidden">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Mailbox className="h-3.5 w-3.5" />
              Correo original
            </h4>
            {(() => {
              const emailMeta = meta as { inboundEmail?: { subject?: string; from?: string; text?: string; html?: string; receivedAt?: string } };
              const email = emailMeta?.inboundEmail;
              if (!email) return null;
              return (
                <div className="space-y-2 text-sm min-w-0 overflow-hidden">
                  {email.subject && <p className="break-words"><span className="text-muted-foreground">Asunto:</span> {email.subject}</p>}
                  {email.from && <p className="break-words"><span className="text-muted-foreground">De:</span> {email.from}</p>}
                  {email.receivedAt && <p className="text-muted-foreground text-xs">{new Date(email.receivedAt).toLocaleString()}</p>}
                  <div className="rounded border border-border bg-background/80 p-3 max-h-48 overflow-y-auto overflow-x-hidden text-xs whitespace-pre-wrap break-all [overflow-wrap:anywhere]">
                    {email.text ? email.text : email.html ? email.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 2000) : "Sin contenido"}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Rejection info */}
        {lead.status === "rejected" && rejectionInfo && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-2">
            <h4 className="text-sm font-medium text-destructive flex items-center gap-2">
              <XCircle className="h-4 w-4" />
              Información del rechazo
            </h4>
            <DetailFieldGrid>
              <DetailField label="Motivo" value={getRejectReasonLabel(rejectionInfo.reason)} />
              <DetailField label="Correo enviado" value={rejectionInfo.emailSent ? "Sí" : "No"} />
              {rejectionInfo.note && <DetailField label="Observación" value={rejectionInfo.note} fullWidth />}
            </DetailFieldGrid>
          </div>
        )}

        {/* Notes (when not editable) */}
        {!isEditable && lead.notes && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Notas</Label>
            <p className="text-sm whitespace-pre-wrap">{lead.notes}</p>
          </div>
        )}
      </div>
    ),
  });

  // === For editable leads: show the approval form sections ===
  if (isEditable) {
    // Conflict alerts
    const conflictAlerts = (
      <div className="space-y-3">
        {duplicates.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
            <div className="flex items-center gap-2 text-amber-400 text-sm font-medium">
              <AlertTriangle className="h-4 w-4" />
              Cuenta con el mismo nombre ya existe
            </div>
            <div className="flex flex-col gap-2 pl-6">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="radio" name="accountResolution" checked={!useExistingAccountId}
                  onChange={() => { setUseExistingAccountId(null); setInstallationConflicts([]); setInstallationUseExisting({}); }} className="rounded border-input" />
                Crear nueva cuenta
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="radio" name="accountResolution" checked={!!useExistingAccountId}
                  onChange={() => setUseExistingAccountId(duplicates[0]?.id ?? null)} className="rounded border-input" />
                Usar cuenta existente:
              </label>
              <select className="ml-6 mt-1 max-w-xs rounded border border-input bg-background px-2 py-1.5 text-xs text-foreground"
                value={useExistingAccountId ?? ""}
                onChange={(e) => { setUseExistingAccountId(e.target.value || null); setInstallationUseExisting({}); }}>
                <option value="">Seleccionar cuenta...</option>
                {duplicates.map((dup) => (
                  <option key={dup.id} value={dup.id}>{dup.name} {dup.rut ? `(${dup.rut})` : ""} — {dup.type === "client" ? "Cliente" : "Prospecto"}</option>
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
                <input type="radio" name="contactResolution" checked={contactResolution === "overwrite"} onChange={() => setContactResolution("overwrite")} className="rounded border-input" />
                Sobrescribir con los datos de este lead
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="radio" name="contactResolution" checked={contactResolution === "use_existing"} onChange={() => setContactResolution("use_existing")} className="rounded border-input" />
                Mantener el contacto existente
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="radio" name="contactResolution" checked={contactResolution === "create"} onChange={() => setContactResolution("create")} className="rounded border-input" />
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
                  <Button key={inst._key} type="button"
                    variant={installationUseExisting[inst._key] === conf.id ? "default" : "outline"}
                    size="sm" className="h-7 text-xs"
                    onClick={() => setInstallationUseExisting((prev) => {
                      if (prev[inst._key] === conf.id) { const next = { ...prev }; delete next[inst._key]; return next; }
                      return { ...prev, [inst._key]: conf.id };
                    })}>
                    {installationUseExisting[inst._key] === conf.id ? "Usar existente ✓" : "Usar esta existente"}
                  </Button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    );

    // SECTION: Account
    sections.push({
      key: "account",
      label: "Cuenta (Prospecto)",
      children: (
        <div className="space-y-4">
          {conflictAlerts}
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5 md:col-span-2 lg:col-span-3">
              <Label className="text-xs">Nombre de empresa *</Label>
              <Input value={approveForm.accountName} onChange={(e) => updateApproveForm("accountName", e.target.value)} placeholder="Nombre de la empresa" className={inputClassName} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">RUT</Label>
              <Input value={approveForm.rut} onChange={(e) => updateApproveForm("rut", e.target.value)} placeholder="76.123.456-7" className={inputClassName} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs">Razón social (empresa)</Label>
              <Input value={approveForm.legalName} onChange={(e) => updateApproveForm("legalName", e.target.value)} placeholder="Empresa SpA / Ltda / S.A." className={inputClassName} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Representante legal</Label>
              <Input value={approveForm.legalRepresentativeName} onChange={(e) => updateApproveForm("legalRepresentativeName", e.target.value)} placeholder="Nombre completo" className={inputClassName} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">RUT representante legal</Label>
              <Input value={approveForm.legalRepresentativeRut} onChange={(e) => updateApproveForm("legalRepresentativeRut", e.target.value)} placeholder="12.345.678-9" className={inputClassName} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Industria</Label>
              <select className={selectClassName} value={approveForm.industry} onChange={(e) => updateApproveForm("industry", e.target.value)}>
                <option value="">Seleccionar industria</option>
                {industries.map((i) => (<option key={i.id} value={i.name}>{i.name}</option>))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Segmento</Label>
              <Input value={approveForm.segment} onChange={(e) => updateApproveForm("segment", e.target.value)} placeholder="Corporativo, PYME..." className={inputClassName} />
            </div>
            <div className="space-y-1.5 md:col-span-2 lg:col-span-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs">Página web</Label>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={enrichCompanyInfoFromWebsite} disabled={enrichingCompanyInfo || !approveForm.website.trim()}>
                  {enrichingCompanyInfo && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                  Traer datos de la empresa
                </Button>
              </div>
              <Input value={approveForm.website} onChange={(e) => updateApproveForm("website", e.target.value)} placeholder="https://www.empresa.cl" className={inputClassName} />
              <p className="text-[10px] text-muted-foreground">Se detecta automáticamente desde el dominio del email. Se asocia a la cuenta.</p>
            </div>
            <div className="space-y-1.5 md:col-span-2 lg:col-span-3">
              <Label className="text-xs">Información de la empresa</Label>
              <textarea value={approveForm.companyInfo} onChange={(e) => updateApproveForm("companyInfo", e.target.value)}
                placeholder="Resumen comercial de qué hace la empresa..." className={`w-full min-h-[96px] resize-y rounded-md border px-3 py-2 text-sm ${inputClassName}`} rows={4} />
              {detectedCompanyLogoUrl && (
                <div className="space-y-2 rounded-md border border-border bg-muted/20 p-2">
                  <div className="text-[10px] text-muted-foreground">Logo detectado</div>
                  <div className="flex items-center gap-3">
                    <img src={detectedCompanyLogoUrl} alt="Logo empresa detectado" className="h-12 w-12 rounded border border-border bg-background object-contain" />
                    <span className="truncate text-[10px] text-muted-foreground">{detectedCompanyLogoUrl}</span>
                  </div>
                  <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[10px]"
                    onClick={async () => { try { await navigator.clipboard.writeText(detectedCompanyLogoUrl); toast.success("URL del logo copiada."); } catch { toast.error("No se pudo copiar."); } }}>
                    Copiar URL
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      ),
    });

    // SECTION: Contacts
    sections.push({
      key: "contacts",
      label: "Contacto principal",
      children: (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Nombre *</Label>
            <Input value={approveForm.contactFirstName} onChange={(e) => updateApproveForm("contactFirstName", e.target.value)} placeholder="Nombre" className={inputClassName} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Apellido</Label>
            <Input value={approveForm.contactLastName} onChange={(e) => updateApproveForm("contactLastName", e.target.value)} placeholder="Apellido" className={inputClassName} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Cargo</Label>
            <Input value={approveForm.roleTitle} onChange={(e) => updateApproveForm("roleTitle", e.target.value)} placeholder="Gerente, jefe..." className={inputClassName} />
          </div>
          <div className="space-y-1.5 md:col-span-2 lg:col-span-1">
            <Label className="text-xs">Email</Label>
            <Input value={approveForm.email} onChange={(e) => updateApproveForm("email", e.target.value)} placeholder="correo@empresa.com" className={inputClassName} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Teléfono</Label>
            <Input value={approveForm.phone} onChange={(e) => updateApproveForm("phone", e.target.value)} placeholder="+56 9 1234 5678" className={inputClassName} />
          </div>
        </div>
      ),
    });

    // SECTION: Deals
    sections.push({
      key: "deals",
      label: "Negocio",
      children: (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Título del negocio</Label>
            <Input value={approveForm.dealTitle} onChange={(e) => updateApproveForm("dealTitle", e.target.value)} placeholder="Oportunidad para..." className={inputClassName} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notas iniciales</Label>
            <textarea value={approveForm.notes} onChange={(e) => updateApproveForm("notes", e.target.value)}
              placeholder="Notas sobre este negocio (se copiarán al negocio y cotización)..."
              className={`w-full min-h-[64px] resize-none rounded-md border px-3 py-2 text-sm ${inputClassName}`} rows={2} />
            <p className="text-[10px] text-muted-foreground">Estas notas se agregarán al negocio y a las cotizaciones creadas.</p>
          </div>
        </div>
      ),
    });

    // SECTION: Installations & Dotación
    sections.push({
      key: "installations",
      label: "Instalaciones y Dotación",
      action: (
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addInstallation}>
          <Plus className="h-3 w-3" /> Nueva instalación
        </Button>
      ),
      children: (
        <div className="space-y-4 pb-40 lg:pb-32">
          {installations.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">Sin instalaciones. Agrega una para asignar dotación.</p>
          )}
          {installations.map((inst, instIdx) => (
            <div key={inst._key} className="rounded-lg border border-border bg-muted/10 overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border/60 flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs font-semibold flex-1">Instalación {instIdx + 1}</span>
                {installations.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => removeInstallation(inst._key)}>
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <div className="p-3 space-y-3">
                <div className="space-y-1">
                  <Label className="text-[11px]">Nombre *</Label>
                  <Input value={inst.name} onChange={(e) => updateInstallation(inst._key, "name", e.target.value)} placeholder="Bodega central, Sucursal norte..." className={`h-9 text-sm ${inputClassName}`} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Dirección (Google Maps)</Label>
                  <div className="flex gap-2 items-center">
                    <AddressAutocomplete value={inst.address} onChange={(result) => handleAddressChange(inst._key, result)} placeholder="Buscar dirección..." className={`h-9 text-sm flex-1 ${inputClassName}`} showMap={false} />
                    {(inst.address || (inst.lat != null && inst.lng != null)) && (
                      <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" title="Abrir en Google Maps" asChild>
                        <a href={inst.lat != null && inst.lng != null ? `https://www.google.com/maps/@${inst.lat},${inst.lng},17z` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(inst.address)}`} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Comuna</Label>
                    <Input value={inst.commune} onChange={(e) => updateInstallation(inst._key, "commune", e.target.value)} placeholder="Las Condes" className={`h-9 text-sm ${inputClassName}`} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Ciudad</Label>
                    <Input value={inst.city} onChange={(e) => updateInstallation(inst._key, "city", e.target.value)} placeholder="Santiago" className={`h-9 text-sm ${inputClassName}`} />
                  </div>
                </div>
                {/* Dotación */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <Users className="h-3 w-3" /> Dotación
                      {inst.dotacion.length > 0 && (
                        <span className="ml-1 text-[10px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                          {inst.dotacion.reduce((s, d) => s + (d.cantidad || 1) * (d.numPuestos || 1), 0)} guardia{inst.dotacion.reduce((s, d) => s + (d.cantidad || 1) * (d.numPuestos || 1), 0) !== 1 ? "s" : ""}
                        </span>
                      )}
                    </span>
                    <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] gap-1 px-2" onClick={() => addDotacionToInst(inst._key)}>
                      <Plus className="h-2.5 w-2.5" /> Posición
                    </Button>
                  </div>
                  {inst.dotacion.length === 0 && (
                    <button type="button" onClick={() => addDotacionToInst(inst._key)} className="w-full py-3 rounded-md border border-dashed border-border text-xs text-muted-foreground hover:bg-muted/30 transition-colors">
                      + Agregar posición de guardia
                    </button>
                  )}
                  {inst.dotacion.map((dot, dotIdx) => (
                    <div key={dotIdx} className="rounded-md border border-border/60 bg-background p-2.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-muted-foreground">Posición {dotIdx + 1}</span>
                        <div className="flex items-center gap-1">
                          <Button type="button" variant="outline" size="sm" className="h-7 text-[10px] px-2 gap-1" onClick={() => cloneDotacionInInst(inst._key, dotIdx)}>
                            <Copy className="h-3 w-3" /> Clonar
                          </Button>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive shrink-0" onClick={() => removeDotacionFromInst(inst._key, dotIdx)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-[10px]">Tipo de puesto *</Label>
                          <select className={selectCompactClassName} value={dot.puestoTrabajoId || ""}
                            onChange={(e) => { const puestoTrabajoId = e.target.value; const selected = cpqPuestos.find((p) => p.id === puestoTrabajoId); updateDotacionField(inst._key, dotIdx, "puestoTrabajoId", puestoTrabajoId); updateDotacionField(inst._key, dotIdx, "puesto", selected?.name || dot.puesto || ""); }}>
                            <option value="">Seleccionar puesto...</option>
                            {cpqPuestos.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px]">Nombre personalizado</Label>
                          <Input value={dot.customName || ""} onChange={(e) => updateDotacionField(inst._key, dotIdx, "customName", e.target.value)} placeholder={dot.puesto || "Ej: CCTV acceso principal"} className={`h-8 text-sm ${inputClassName}`} />
                        </div>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-5">
                        <div className="space-y-1">
                          <Label className="text-[10px]">Cargo *</Label>
                          <select className={selectCompactClassName} value={dot.cargoId || ""} onChange={(e) => updateDotacionField(inst._key, dotIdx, "cargoId", e.target.value)}>
                            <option value="">Seleccionar cargo...</option>
                            {cpqCargos.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px]">Rol *</Label>
                          <select className={selectCompactClassName} value={dot.rolId || ""} onChange={(e) => updateDotacionField(inst._key, dotIdx, "rolId", e.target.value)}>
                            <option value="">Seleccionar rol...</option>
                            {cpqRoles.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px]">Guardias</Label>
                          <select className={selectCompactClassName} value={Math.min(10, Math.max(1, dot.cantidad ?? 1))} onChange={(e) => updateDotacionField(inst._key, dotIdx, "cantidad", Number(e.target.value))}>
                            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (<option key={n} value={n}>{n}</option>))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px]">N° puestos</Label>
                          <select
                            className={selectCompactClassName}
                            value={Math.min(20, Math.max(1, dot.numPuestos ?? 1))}
                            onChange={(e) => updateDotacionField(inst._key, dotIdx, "numPuestos", Number(e.target.value))}
                          >
                            {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px]">Sueldo base</Label>
                          <Input type="text" inputMode="numeric"
                            value={dot.baseSalary != null ? formatNumber(dot.baseSalary, { minDecimals: 0, maxDecimals: 0 }) : ""}
                            onChange={(e) => { const raw = e.target.value.replace(/\D/g, ""); updateDotacionField(inst._key, dotIdx, "baseSalary", raw === "" ? undefined : Math.max(0, parseLocalizedNumber(e.target.value))); }}
                            onBlur={() => { if (dot.baseSalary == null) updateDotacionField(inst._key, dotIdx, "baseSalary", 550000); }}
                            placeholder="550.000"
                            className={`h-8 text-sm ${inputClassName}`} />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Label className="text-[10px]">Horario</Label>
                          <div className="flex gap-1">
                            <Button type="button" size="sm" variant={(dot.shiftType || "day") === "day" ? "default" : "outline"} className="h-6 px-2 text-[10px]" onClick={() => setDotacionShift(inst._key, dotIdx, "day")}>Día</Button>
                            <Button type="button" size="sm" variant={(dot.shiftType || "day") === "night" ? "default" : "outline"} className="h-6 px-2 text-[10px]" onClick={() => setDotacionShift(inst._key, dotIdx, "night")}>Noche</Button>
                          </div>
                        </div>
                        {(dot.shiftType || "day") === "day" ? (
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-[10px]">Inicio</Label>
                              <select className={selectCompactClassName} value={dot.horaInicio} onChange={(e) => setDotacionDayStart(inst._key, dotIdx, e.target.value)}>
                                {DAY_START_OPTIONS.map((time) => (<option key={time} value={time}>{time}</option>))}
                              </select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px]">Término</Label>
                              <Input value={dot.horaFin} className={`h-8 text-sm ${inputClassName}`} readOnly />
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1"><Label className="text-[10px]">Inicio</Label><Input value="20:00" className={`h-8 text-sm ${inputClassName}`} readOnly /></div>
                            <div className="space-y-1"><Label className="text-[10px]">Término</Label><Input value="08:00" className={`h-8 text-sm ${inputClassName}`} readOnly /></div>
                          </div>
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">Días</Label>
                        <div className="flex flex-wrap gap-1">
                          {WEEKDAYS.map((day) => {
                            const active = dot.dias.includes(day);
                            return (
                              <button key={day} type="button" onClick={() => toggleDotacionDay(inst._key, dotIdx, day)}
                                className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${active ? "bg-primary/15 text-primary border border-primary/30" : "bg-muted text-muted-foreground border border-transparent hover:border-border"}`}>
                                {WEEKDAYS_SHORT[day]}
                              </button>
                            );
                          })}
                          <button type="button" onClick={() => { const allSelected = dot.dias.length === 7; updateDotacionField(inst._key, dotIdx, "dias", allSelected ? [] : [...WEEKDAYS]); }}
                            className="px-2 py-1 rounded text-[10px] font-medium text-muted-foreground hover:text-foreground border border-dashed border-border">
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
          <p className="text-[10px] text-muted-foreground">Solo se crearán instalaciones con nombre. La dotación se guarda como referencia para el negocio.</p>

          {/* Costos incluidos */}
          <div className="space-y-3 pt-4 border-t border-border/60">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Costos incluidos</span>
              </div>
              <Button type="button" variant="outline" size="sm" className="text-xs" disabled={inferringCosts}
                onClick={async () => {
                  setInferringCosts(true);
                  try {
                    const res = await fetch("/api/ai/lead-cost-inference", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId: lead.id }) });
                    const data = await res.json();
                    if (data.success && Array.isArray(data.groupIds)) { setSelectedCostGroups(data.groupIds); toast.success("Sugerencia aplicada."); }
                    else toast.error(data?.error || "No se pudo obtener la sugerencia");
                  } catch { toast.error("Error al sugerir costos"); }
                  finally { setInferringCosts(false); }
                }}>
                {inferringCosts ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                Sugerir con IA
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">Marca qué ítems de costo incluir en la cotización. Los montos se configuran después en el cotizador.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 rounded-md border border-border/60 bg-muted/10 p-3">
                <span className="text-[10px] font-medium uppercase text-muted-foreground">Directos</span>
                <div className="flex flex-wrap gap-3">
                  {COST_GROUPS_DIRECTOS.map((g) => (
                    <label key={g.id} className="flex items-center gap-2 cursor-pointer text-sm">
                      <input type="checkbox" checked={selectedCostGroups.includes(g.id)}
                        onChange={(e) => { if (e.target.checked) setSelectedCostGroups((prev) => [...prev, g.id]); else setSelectedCostGroups((prev) => prev.filter((id) => id !== g.id)); }}
                        className="rounded border-border" />
                      {g.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-2 rounded-md border border-border/60 bg-muted/10 p-3">
                <span className="text-[10px] font-medium uppercase text-muted-foreground">Indirectos</span>
                <div className="flex flex-wrap gap-3">
                  {COST_GROUPS_INDIRECTOS.map((g) => (
                    <label key={g.id} className="flex items-center gap-2 cursor-pointer text-sm">
                      <input type="checkbox" checked={selectedCostGroups.includes(g.id)}
                        onChange={(e) => { if (e.target.checked) setSelectedCostGroups((prev) => [...prev, g.id]); else setSelectedCostGroups((prev) => prev.filter((id) => id !== g.id)); }}
                        className="rounded border-border" />
                      {g.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
    });
  }

  // === SECTION: Files (always) ===
  sections.push({
    key: "files",
    children: <FileAttachments entityType="lead" entityId={lead.id} readOnly={!isEditable} title="Archivos adjuntos" />,
  });

  return (
    <>
      <CrmDetailLayout
        pageType="lead"
        module="leads"
        title={lead.companyName || fullName}
        subtitle={lead.companyName ? fullName : undefined}
        badge={statusBadge}
        backHref="/crm/leads"
        backLabel="Prospectos"
        actions={headerActions}
        sections={sections}
      />

      {/* ── Sticky action bar for editable leads ── */}
      {isEditable && (
        <div className="sticky bottom-14 lg:bottom-0 -mx-4 sm:-mx-6 lg:-mx-8 xl:-mx-10 2xl:-mx-12 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 py-3 z-10">
          {!duplicateChecked && (
            <p className="text-xs text-muted-foreground mb-2 w-full text-center sm:text-left">
              Nada se crea hasta que hagas clic en &quot;Verificar y aprobar&quot; y luego confirmes.
            </p>
          )}
          {duplicateChecked && (
            <div className="mb-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-foreground space-y-1">
              <p className="font-medium text-emerald-400">Verificación completada — al confirmar se creará:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-0.5 pl-1">
                <li>
                  <span className="text-foreground font-medium">Cuenta:</span>{" "}
                  {useExistingAccountId
                    ? <><span className="text-amber-400">usar existente</span> ({duplicates.find((d) => d.id === useExistingAccountId)?.name || "cuenta seleccionada"})</>
                    : <><span className="text-emerald-400">nueva</span> &quot;{approveForm.accountName}&quot;</>}
                </li>
                <li>
                  <span className="text-foreground font-medium">Contacto:</span>{" "}
                  {existingContact
                    ? contactResolution === "use_existing"
                      ? <><span className="text-amber-400">mantener existente</span> ({existingContact.firstName} {existingContact.lastName})</>
                      : contactResolution === "overwrite"
                        ? <><span className="text-amber-400">sobrescribir</span> {existingContact.firstName} {existingContact.lastName}</>
                        : <><span className="text-emerald-400">nuevo contacto</span></>
                    : <><span className="text-emerald-400">nuevo</span> {approveForm.contactFirstName} {approveForm.contactLastName}</>}
                </li>
                <li><span className="text-foreground font-medium">Negocio:</span> &quot;{approveForm.dealTitle}&quot;</li>
                {installations.filter((i) => i.name.trim()).length > 0 && (
                  <li>
                    <span className="text-foreground font-medium">Instalaciones:</span>{" "}
                    {installations.filter((i) => i.name.trim()).map((i) => i.name).join(", ")}
                  </li>
                )}
              </ul>
            </div>
          )}
          <div className="flex flex-col sm:flex-row items-center justify-end gap-2">
            <Button variant="outline" onClick={saveLeadDraft} disabled={approving || savingLead}>
              {savingLead && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" />
              Guardar en revisión
            </Button>
            <Button variant="destructive" onClick={openRejectModal} disabled={approving || savingLead}>
              <XCircle className="mr-2 h-4 w-4" />
              Rechazar
            </Button>
            <Button onClick={approveLead} disabled={approving || savingLead}>
              {approving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {!duplicateChecked
                ? "Verificar y aprobar"
                : duplicates.length > 0
                  ? "Confirmar aprobación (con conflictos)"
                  : "Confirmar aprobación"}
            </Button>
          </div>
        </div>
      )}

      {/* ── Approval Success Modal ── */}
      <Dialog open={!!approvalResult} onOpenChange={(open) => { if (!open) { setApprovalResult(null); router.push("/crm/leads"); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              Lead aprobado
            </DialogTitle>
            <DialogDescription>
              Se crearon los siguientes registros:
            </DialogDescription>
          </DialogHeader>
          {approvalResult && (
            <div className="space-y-3">
              <div className="space-y-2 text-sm">
                <Link href={`/crm/contacts/${approvalResult.contact.id}`} className="flex items-center gap-3 rounded-md border border-border p-3 hover:bg-muted/50 transition-colors">
                  <Users className="h-4 w-4 text-blue-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">Contacto</p>
                    <p className="font-medium truncate">{approvalResult.contact.firstName} {approvalResult.contact.lastName}</p>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </Link>
                <Link href={`/crm/accounts/${approvalResult.account.id}`} className="flex items-center gap-3 rounded-md border border-border p-3 hover:bg-muted/50 transition-colors">
                  <Building2 className="h-4 w-4 text-violet-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">Cuenta</p>
                    <p className="font-medium truncate">{approvalResult.account.name}</p>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </Link>
                <Link href={`/crm/deals/${approvalResult.deal.id}`} className="flex items-center gap-3 rounded-md border border-border p-3 hover:bg-muted/50 transition-colors">
                  <Briefcase className="h-4 w-4 text-amber-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">Negocio</p>
                    <p className="font-medium truncate">{approvalResult.deal.title}</p>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </Link>
                {approvalResult.quotes.map((q) => (
                  <Link key={q.id} href={`/cpq/${q.id}`} className="flex items-center gap-3 rounded-md border border-border p-3 hover:bg-muted/50 transition-colors">
                    <FileText className="h-4 w-4 text-emerald-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground">Cotización CPQ</p>
                      <p className="font-medium truncate">{q.code}{q.installationName ? ` — ${q.installationName}` : ""}</p>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </Link>
                ))}
              </div>
            </div>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            {approvalResult && approvalResult.quotes.length > 0 && (
              <Button className="w-full" onClick={() => router.push(`/cpq/${approvalResult.quotes[0].id}`)}>
                Ir a cotización CPQ
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
            <Button variant="outline" className="w-full" onClick={() => { setApprovalResult(null); router.push("/crm/leads"); }}>
              Volver a leads
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reject Modal ── */}
      <Dialog open={rejectOpen} onOpenChange={(open) => { setRejectOpen(open); }}>
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
              <select className={selectClassName} value={rejectReason} onChange={(e) => setRejectReason(e.target.value as LeadRejectReason)}>
                {REJECTION_REASON_OPTIONS.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nota interna</Label>
              <textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="Contexto interno del rechazo..."
                className={`w-full min-h-[80px] resize-none rounded-md border px-3 py-2 text-sm ${inputClassName}`} rows={3} />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={rejectSendEmail} onChange={(e) => setRejectSendEmail(e.target.checked)} />
              Enviar correo de respuesta
            </label>
            {rejectSendEmail && (
              <div className="space-y-3 rounded-md border border-border p-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Template (opcional)</Label>
                  <select className={selectClassName} value={rejectTemplateId} onChange={(e) => applyRejectTemplate(e.target.value)}>
                    <option value="">Sin template</option>
                    {docTemplatesReject.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Asunto *</Label>
                  <Input value={rejectEmailSubject} onChange={(e) => setRejectEmailSubject(e.target.value)} placeholder="Asunto del correo" className={inputClassName} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Mensaje *</Label>
                  <textarea value={rejectEmailBody} onChange={(e) => setRejectEmailBody(e.target.value)} placeholder="Contenido del correo..."
                    className={`w-full min-h-[140px] rounded-md border px-3 py-2 text-sm ${inputClassName}`} rows={6} />
                  <p className="text-[10px] text-muted-foreground">La firma configurada en el sistema se agrega automáticamente al momento del envío.</p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={rejecting}>Cancelar</Button>
            <Button variant="destructive" onClick={rejectLead} disabled={rejecting || !canConfirmReject}>
              {rejecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar rechazo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ── */}
      <ConfirmDialog
        open={deleteConfirm}
        onOpenChange={setDeleteConfirm}
        title="Eliminar prospecto"
        description="El prospecto será eliminado permanentemente. Esta acción no se puede deshacer."
        onConfirm={deleteLead}
      />
    </>
  );
}
