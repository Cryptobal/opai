/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
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
  Save,
  CheckCircle2,
  XCircle,
  Building2,
  FileText,
  ArrowRight,
  ChevronDown,
  Globe,
  Info,
  Phone,
  Send,
  MessageCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/opai/StatusBadge";
import { EntityDetailLayout, useEntityTabs, type EntityTab, type EntityHeaderAction } from "./EntityDetailLayout";
import { DetailField, DetailFieldGrid } from "./DetailField";
import { AddressAutocomplete, type AddressResult } from "@/components/ui/AddressAutocomplete";
import { MapsUrlPasteInput } from "@/components/ui/MapsUrlPasteInput";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { toast } from "sonner";
import { formatNumber, parseLocalizedNumber } from "@/lib/utils";
import { resolveDocument, tiptapToPlainText } from "@/lib/docs/token-resolver";
import { FileAttachments } from "./FileAttachments";
import { LeadSourceBadge } from "./LeadSourceBadge";
import { DotacionSummary } from "./DotacionSummary";
import { ServiceTemplateButtons } from "@/components/cpq/ServiceTemplateButtons";
import type { ServiceTemplate } from "@/lib/cpq/service-templates";
import {
  LeadInstallationCpq,
  createDefaultLeadCpqConfig,
  DEFAULT_LEAD_CPQ_CURRENCY,
  type LeadCpqConfig,
} from "./LeadInstallationCpq";
import { SERVICE_TYPES } from "@/lib/constants";
import { computeLeadCpqMonthlySaleClp } from "@/lib/crm/lead-cpq-monthly-total";
import { formatCurrency } from "@/components/cpq/utils";

/* ─── Truncated text helper ─── */

function TruncatedText({ label, text, maxChars = 200, className }: { label?: string; text: string; maxChars?: number; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > maxChars;
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && <Label className="text-xs text-muted-foreground">{label}</Label>}
      <p className="text-sm whitespace-pre-wrap break-words">
        {isLong && !expanded ? text.slice(0, maxChars) + "..." : text}
      </p>
      {isLong && (
        <button type="button" onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors">
          <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
          {expanded ? "Ver menos" : "Ver más"}
        </button>
      )}
    </div>
  );
}

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
const WEEKDAYS_LABORABLES = ["lunes", "martes", "miercoles", "jueves", "viernes"];
const WEEKDAYS_FINDE = ["sabado", "domingo"];
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

function cloneInstallationDraft(inst: InstallationDraft): InstallationDraft {
  const baseName = inst.name.trim();
  return {
    _key: newInstallationKey(),
    name: baseName ? `${baseName} (copia)` : "",
    address: inst.address,
    city: inst.city,
    commune: inst.commune,
    lat: inst.lat,
    lng: inst.lng,
    dotacion: inst.dotacion.map((d) => ({
      ...d,
      dias: [...d.dias],
    })),
  };
}

function cloneLeadCpqConfig(cfg: LeadCpqConfig): LeadCpqConfig {
  return JSON.parse(JSON.stringify(cfg)) as LeadCpqConfig;
}

/** Nombre inicial al crear el borrador desde el lead: «Empresa - Comuna». */
function defaultInstallationNameFromLead(
  companyName: string | null | undefined,
  commune: string,
): string {
  const company = (companyName || "").trim();
  const com = (commune || "").trim();
  if (company && com) return `${company} - ${com}`;
  if (company) return company;
  return com;
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

type InstallationCatalogDefaults = {
  puestoId: string;
  puestoName: string;
  cargoId: string;
  rolId: string;
};

function parseDotacionItemFromMeta(raw: unknown, defaults: InstallationCatalogDefaults): DotacionItem {
  if (!raw || typeof raw !== "object") {
    return createEmptyDotacion(defaults.cargoId, defaults.rolId, defaults.puestoId, defaults.puestoName);
  }
  const d = raw as Record<string, unknown>;
  return {
    puestoTrabajoId: typeof d.puestoTrabajoId === "string" ? d.puestoTrabajoId : defaults.puestoId,
    puesto: typeof d.puesto === "string" ? d.puesto : defaults.puestoName,
    customName: typeof d.customName === "string" && d.customName.trim() ? d.customName : undefined,
    cargoId: typeof d.cargoId === "string" ? d.cargoId : defaults.cargoId,
    rolId: typeof d.rolId === "string" ? d.rolId : defaults.rolId,
    baseSalary: typeof d.baseSalary === "number" && d.baseSalary > 0 ? d.baseSalary : 550000,
    shiftType: d.shiftType === "night" ? "night" : "day",
    cantidad: typeof d.cantidad === "number" && d.cantidad > 0 ? Math.floor(d.cantidad) : 1,
    numPuestos:
      typeof d.numPuestos === "number" && Number.isFinite(d.numPuestos) && d.numPuestos > 0
        ? Math.floor(d.numPuestos)
        : 1,
    horaInicio: typeof d.horaInicio === "string" ? normalizeTimeToHHmm(d.horaInicio, "08:00") : "08:00",
    horaFin: typeof d.horaFin === "string" ? normalizeTimeToHHmm(d.horaFin, "20:00") : "20:00",
    dias: Array.isArray(d.dias) ? normalizeLeadDias(d.dias as string[]) : [...WEEKDAYS],
  };
}

function parseInstallationsDraftFromMetadata(
  raw: unknown,
  catalogDefaults: InstallationCatalogDefaults
): InstallationDraft[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  try {
    return raw.map((item) => {
      if (!item || typeof item !== "object") throw new Error("invalid");
      const o = item as Record<string, unknown>;
      const _key = typeof o._key === "string" && o._key.trim() ? o._key : newInstallationKey();
      const dotacionRaw = Array.isArray(o.dotacion) ? o.dotacion : [];
      const dotacion = dotacionRaw.map((dr) => parseDotacionItemFromMeta(dr, catalogDefaults));
      return {
        _key,
        name: typeof o.name === "string" ? o.name : "",
        address: typeof o.address === "string" ? o.address : "",
        city: typeof o.city === "string" ? o.city : "",
        commune: typeof o.commune === "string" ? o.commune : "",
        lat: typeof o.lat === "number" ? o.lat : undefined,
        lng: typeof o.lng === "number" ? o.lng : undefined,
        dotacion,
      };
    });
  } catch {
    return null;
  }
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

function buildLeadDraftPatchPayload(
  leadRow: CrmLead,
  approveForm: ApproveFormState,
  selectedCostGroups: string[],
  cpqConfigs: Record<string, LeadCpqConfig>,
  installations: InstallationDraft[]
): Record<string, unknown> {
  const baseMeta =
    leadRow.metadata && typeof leadRow.metadata === "object" && !Array.isArray(leadRow.metadata)
      ? { ...(leadRow.metadata as Record<string, unknown>) }
      : {};
  return {
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
      ...baseMeta,
      approveFormDraft: {
        rut: approveForm.rut,
        legalName: approveForm.legalName,
        legalRepresentativeName: approveForm.legalRepresentativeName,
        legalRepresentativeRut: approveForm.legalRepresentativeRut,
        segment: approveForm.segment,
        roleTitle: approveForm.roleTitle,
        dealTitle: approveForm.dealTitle,
        companyInfo: approveForm.companyInfo,
        selectedCostGroups,
      },
      cpqConfigs,
      installationsDraft: installations,
    },
  };
}

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
  const leadRef = useRef(lead);
  leadRef.current = lead;
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
  const [installations, setInstallations] = useState<InstallationDraft[]>([]);

  // ─── CPQ config per installation ───
  const [cpqConfigs, setCpqConfigs] = useState<Record<string, LeadCpqConfig>>({});
  const [proposalTemplates, setProposalTemplates] = useState<{ id: string; name: string; slug?: string }[]>([]);
  const [ufValue, setUfValue] = useState<number | null>(null);
  const [expandedInstallations, setExpandedInstallations] = useState<Record<string, boolean>>({});

  // Backward compat aliases from cpqConfigs
  const firstInstKey = installations[0]?._key;
  const firstCpqConfig = firstInstKey ? cpqConfigs[firstInstKey] : undefined;
  const marginPercentage = firstCpqConfig?.marginPercentage ?? 13;
  const proposalTemplateId = firstCpqConfig?.conditions?.proposalTemplateId ?? "estandar";
  const additionalLines = (firstCpqConfig?.additionalLines ?? []).map((l) => ({ name: l.nombre, monthlyAmount: Number(l.precio || 0) }));

  // ─── Express send state ───
  const [sendingExpress, setSendingExpress] = useState(false);
  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false);
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  const [whatsappSentTo, setWhatsappSentTo] = useState("");
  const [enrichingCompanyInfo, setEnrichingCompanyInfo] = useState(false);
  const [detectedCompanyLogoUrl, setDetectedCompanyLogoUrl] = useState<string | null>(null);

  // ─── Autosave borrador completo (todas las pestañas editables, debounced ~2,5s) ───
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fullAutosaveBoot = useRef(true);
  const lastAutosavedFingerprint = useRef<string>("");
  const lastLeadIdForAutosave = useRef(lead.id);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "pending" | "saving" | "saved" | "error">("idle");
  const autoSaveStatusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (lastLeadIdForAutosave.current !== lead.id) {
      lastLeadIdForAutosave.current = lead.id;
      fullAutosaveBoot.current = true;
      lastAutosavedFingerprint.current = "";
    }
  }, [lead.id]);

  const draftAutosaveRef = useRef({
    approveForm,
    selectedCostGroups,
    cpqConfigs,
    installations,
  });
  draftAutosaveRef.current = { approveForm, selectedCostGroups, cpqConfigs, installations };

  const leadDraftFingerprint = useMemo(
    () =>
      JSON.stringify({
        approveForm,
        selectedCostGroups,
        cpqConfigs,
        installations,
      }),
    [approveForm, selectedCostGroups, cpqConfigs, installations]
  );

  useEffect(() => {
    if (!isEditable || !lead.id) return;

    if (fullAutosaveBoot.current) {
      fullAutosaveBoot.current = false;
      lastAutosavedFingerprint.current = leadDraftFingerprint;
      return;
    }

    if (leadDraftFingerprint === lastAutosavedFingerprint.current) return;

    setAutoSaveStatus("pending");
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);

    autoSaveTimer.current = setTimeout(() => {
      void (async () => {
        const snapshot = draftAutosaveRef.current;
        const leadRow = leadRef.current;
        const fp = JSON.stringify(snapshot);
        if (fp === lastAutosavedFingerprint.current) {
          setAutoSaveStatus("idle");
          return;
        }

        setAutoSaveStatus("saving");
        try {
          const body = buildLeadDraftPatchPayload(
            leadRow,
            snapshot.approveForm,
            snapshot.selectedCostGroups,
            snapshot.cpqConfigs,
            snapshot.installations
          );
          const res = await fetch(`/api/crm/leads/${lead.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const data = (await res.json().catch(() => ({}))) as {
            success?: boolean;
            data?: CrmLead;
            error?: string;
          };
          if (!res.ok || !data.success || !data.data) {
            setAutoSaveStatus("error");
            return;
          }
          setLead((prev) => ({ ...prev, ...data.data }));
          lastAutosavedFingerprint.current = fp;
          setAutoSaveStatus("saved");
          if (autoSaveStatusTimer.current) clearTimeout(autoSaveStatusTimer.current);
          autoSaveStatusTimer.current = setTimeout(() => setAutoSaveStatus("idle"), 2500);
        } catch {
          setAutoSaveStatus("error");
        }
      })();
    }, 2500);

    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [leadDraftFingerprint, isEditable, lead.id]);

  // ─── CPQ monthly sale per installation + sum (sticky header y filas colapsadas) ───
  const [leadCpqMonthlyTotalClp, setLeadCpqMonthlyTotalClp] = useState<number | null>(null);
  const [leadCpqSaleClpByKey, setLeadCpqSaleClpByKey] = useState<Record<string, number>>({});
  const [leadCpqTotalsLoading, setLeadCpqTotalsLoading] = useState(false);
  const cpqTotalsSerializeKey = useMemo(() => JSON.stringify(cpqConfigs), [cpqConfigs]);
  const hasCpqPositions = useMemo(
    () => Object.values(cpqConfigs).some((c) => c && c.positions.length > 0),
    [cpqConfigs]
  );

  useEffect(() => {
    const keys = Object.keys(cpqConfigs);
    if (keys.length === 0 || !hasCpqPositions) {
      setLeadCpqMonthlyTotalClp(null);
      setLeadCpqSaleClpByKey({});
      setLeadCpqTotalsLoading(false);
      return;
    }

    let cancelled = false;
    setLeadCpqTotalsLoading(true);

    const t = setTimeout(() => {
      void (async () => {
        try {
          const parts = await Promise.all(
            keys.map(async (key) => {
              const cfg = cpqConfigs[key];
              if (!cfg || cfg.positions.length === 0) return { key, clp: 0 };
              const res = await fetch("/api/crm/leads/employer-cost-preview", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  positions: cfg.positions.map((p) => ({
                    baseSalary: Number(p.baseSalary) || 550000,
                  })),
                  ufValue: ufValue ?? undefined,
                }),
              });
              const json = await res.json();
              if (!json.success || !Array.isArray(json.data?.items)) return { key, clp: 0 };
              const items = json.data.items.map((it: { employerCostPerGuard: number }) => ({
                employerCostPerGuard: Number(it.employerCostPerGuard) || 0,
              }));
              const clp = computeLeadCpqMonthlySaleClp(cfg, items);
              return { key, clp };
            })
          );
          if (!cancelled) {
            const byKey: Record<string, number> = {};
            let sum = 0;
            for (const { key, clp } of parts) {
              byKey[key] = clp;
              sum += clp;
            }
            setLeadCpqSaleClpByKey(byKey);
            setLeadCpqMonthlyTotalClp(sum);
          }
        } catch {
          if (!cancelled) {
            setLeadCpqMonthlyTotalClp(null);
            setLeadCpqSaleClpByKey({});
          }
        } finally {
          if (!cancelled) setLeadCpqTotalsLoading(false);
        }
      })();
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [cpqTotalsSerializeKey, ufValue, hasCpqPositions]);

  const leadStickyMeta = useMemo(() => {
    if (!hasCpqPositions && !leadCpqTotalsLoading) return null;
    const uf = ufValue && ufValue > 0 ? ufValue : null;
    return (
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3 px-0">
        <span className="text-[10px] sm:text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
          Total mensual estimado (suma instalaciones)
        </span>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0 text-[11px] sm:text-xs tabular-nums">
          {leadCpqTotalsLoading ? (
            <span className="text-muted-foreground inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin shrink-0" aria-hidden />
              Calculando…
            </span>
          ) : leadCpqMonthlyTotalClp != null ? (
            <>
              <span className="font-semibold text-foreground">{formatCurrency(leadCpqMonthlyTotalClp)}</span>
              {uf ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  {(leadCpqMonthlyTotalClp / uf).toFixed(2)} UF
                </span>
              ) : (
                <span className="text-muted-foreground">UF: —</span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">No disponible</span>
          )}
        </div>
      </div>
    );
  }, [
    hasCpqPositions,
    leadCpqTotalsLoading,
    leadCpqMonthlyTotalClp,
    ufValue,
  ]);

  const headerAutosaveIndicator = isEditable ? (
    autoSaveStatus !== "idle" ? (
      <div
        className="flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-[10px] text-muted-foreground tabular-nums"
        title="Autoguardado del borrador (Cuenta, Contacto, Negocio, Instalaciones, CPQ…), ~2,5 s después del último cambio."
      >
        {autoSaveStatus === "pending" && <span className="text-amber-500">●</span>}
        {autoSaveStatus === "pending" && <span className="hidden min-[400px]:inline">Cambios…</span>}
        {autoSaveStatus === "saving" && <Loader2 className="h-3 w-3 animate-spin shrink-0" aria-hidden />}
        {autoSaveStatus === "saving" && <span>Guardando</span>}
        {autoSaveStatus === "saved" && <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" aria-hidden />}
        {autoSaveStatus === "saved" && <span className="text-emerald-600 dark:text-emerald-400">Guardado</span>}
        {autoSaveStatus === "error" && <span className="text-destructive">Error</span>}
      </div>
    ) : (
      <div
        className="hidden md:flex items-center gap-1 text-[10px] text-muted-foreground/70 px-1"
        title="El borrador se guarda solo en todas las pestañas editables. También puedes usar «Guardar en revisión»."
      >
        <CheckCircle2 className="h-3 w-3 opacity-40" aria-hidden />
        <span>Autosave activo</span>
      </div>
    )
  ) : null;

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

  // ─── Converted entities (for approved leads) ───
  const [convertedEntities, setConvertedEntities] = useState<{
    account: { id: string; name: string } | null;
    contact: { id: string; firstName: string | null; lastName: string | null } | null;
    deal: { id: string; title: string } | null;
    quotes: { id: string; code: string; installationName: string | null }[];
  } | null>(null);

  useEffect(() => {
    if (lead.status !== "approved") return;
    const accountId = lead.convertedAccountId;
    const contactId = lead.convertedContactId;
    const dealId = lead.convertedDealId;
    if (!accountId && !contactId && !dealId) return;

    const fetches: Promise<any>[] = [];
    if (accountId) fetches.push(fetch(`/api/crm/accounts/${accountId}`).then((r) => r.json()).catch(() => null));
    else fetches.push(Promise.resolve(null));
    if (contactId) fetches.push(fetch(`/api/crm/contacts/${contactId}`).then((r) => r.json()).catch(() => null));
    else fetches.push(Promise.resolve(null));
    if (dealId) fetches.push(fetch(`/api/crm/deals/${dealId}`).then((r) => r.json()).catch(() => null));
    else fetches.push(Promise.resolve(null));
    fetches.push(
      fetch(`/api/cpq/quotes?leadId=${lead.id}`).then((r) => r.json()).catch(() => null)
    );

    Promise.all(fetches).then(([accRes, conRes, dealRes, quotesRes]) => {
      setConvertedEntities({
        account: accRes?.success && accRes.data ? { id: accRes.data.id, name: accRes.data.name } : null,
        contact: conRes?.success && conRes.data ? { id: conRes.data.id, firstName: conRes.data.firstName, lastName: conRes.data.lastName } : null,
        deal: dealRes?.success && dealRes.data ? { id: dealRes.data.id, title: dealRes.data.title } : null,
        quotes: Array.isArray(quotesRes?.data) ? quotesRes.data.map((q: any) => ({ id: q.id, code: q.code, installationName: q.installation?.name || q.name || null })) : [],
      });
    });
  }, [lead.id, lead.status, lead.convertedAccountId, lead.convertedContactId, lead.convertedDealId]);

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

    fetch("/api/cpq/proposal-templates").then((r) => r.json()).then((res) => {
      if (res?.success && Array.isArray(res.data)) setProposalTemplates(res.data);
    }).catch(() => {});

    fetch("/api/fx/uf").then((r) => r.ok ? r.json() : null).then((d) => {
      if (d?.success) setUfValue(d.value);
    }).catch(() => {});
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

    // Restore CPQ configs from metadata
    const savedCpqConfigs = meta?.cpqConfigs as Record<string, LeadCpqConfig> | undefined;
    if (savedCpqConfigs && typeof savedCpqConfigs === "object") {
      setCpqConfigs(savedCpqConfigs);
    }

    const catalogDefaults: InstallationCatalogDefaults = {
      puestoId: defaultPuesto.id,
      puestoName: defaultPuesto.name,
      cargoId: defaultCargoId,
      rolId: defaultRolId,
    };
    const fromInstallationsDraft = parseInstallationsDraftFromMetadata(meta?.installationsDraft, catalogDefaults);
    if (fromInstallationsDraft && fromInstallationsDraft.length > 0) {
      setInstallations(fromInstallationsDraft);
    } else {
      // Build installations from lead data (primer ingreso / sin borrador guardado)
      const leadLat = meta?.lat as number | undefined;
      const leadLng = meta?.lng as number | undefined;
      const leadAddress = ((lead as any).address || "").trim();
      const leadCommune = ((lead as any).commune || "").trim();
      const leadCity = ((lead as any).city || "").trim();
      const instAddress = leadAddress || [leadCommune, leadCity].filter(Boolean).join(", ");
      const firstInst = createEmptyInstallation(
        defaultInstallationNameFromLead(lead.companyName, leadCommune),
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
    }
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
  const selectClassName = "flex h-9 min-h-[44px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
  const selectCompactClassName = "flex h-9 min-h-[44px] w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

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
      const raw = payload?.data?.localLogoUrl || payload?.data?.logoUrl || null;
      const logoUrl = raw && !raw.startsWith("/uploads/company-logos/") ? raw : null;
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
  const addInstallation = () => {
    setInstallations((prev) => [...prev, createEmptyInstallation()]);
  };
  const duplicateInstallationByKey = (sourceKey: string) => {
    setInstallations((prev) => {
      const src = prev.find((i) => i._key === sourceKey);
      if (!src) return prev;
      const clone = cloneInstallationDraft(src);
      setCpqConfigs((pc) => {
        const base = pc[src._key] ?? createDefaultLeadCpqConfig();
        return { ...pc, [clone._key]: cloneLeadCpqConfig(base) };
      });
      setExpandedInstallations((ex) => ({ ...ex, [clone._key]: true }));
      return [...prev, clone];
    });
  };
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
  const applyServiceTemplate = (instKey: string, template: ServiceTemplate) => {
    setInstallations((prev) =>
      prev.map((inst) => {
        if (inst._key !== instKey) return inst;
        const newDotacion: DotacionItem[] = template.positions.map((pos) => ({
          puestoTrabajoId: defaultPuesto.id || undefined,
          puesto: defaultPuesto.name || pos.name,
          customName: pos.name,
          cargoId: defaultCargoId || undefined,
          rolId: defaultRolId || undefined,
          baseSalary: pos.baseSalary,
          shiftType: pos.shiftStart === "20:00" ? "night" : "day",
          cantidad: pos.guardsCount,
          numPuestos: 1,
          horaInicio: pos.shiftStart,
          horaFin: pos.shiftEnd,
          dias: [...pos.daysOfWeek],
        }));
        return { ...inst, dotacion: newDotacion };
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
      const payload = buildLeadDraftPatchPayload(lead, approveForm, selectedCostGroups, cpqConfigs, installations);
      const res = await fetch(`/api/crm/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Error al guardar");
      setLead((prev) => ({ ...prev, ...data.data }));
      lastAutosavedFingerprint.current = JSON.stringify({
        approveForm,
        selectedCostGroups,
        cpqConfigs,
        installations,
      });
      toast.success("Lead guardado en revisión");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el lead");
    } finally {
      setSavingLead(false);
    }
  };

  // ─── Build approve payload helper ───
  const buildApprovePayload = () => {
    const instPayload = installations
      .filter((inst) => inst.name.trim())
      .map((inst) => {
        const { _key, ...rest } = inst;
        const useExistingInstallationId = installationUseExisting[_key] || undefined;
        const cpqCfg = cpqConfigs[_key];
        const dotacion = cpqCfg?.positions?.length
          ? cpqCfg.positions.map((p) => ({
              puestoTrabajoId: p.puestoTrabajoId,
              puesto: p.puesto,
              customName: p.customName,
              cargoId: p.cargoId,
              rolId: p.rolId,
              baseSalary: p.baseSalary,
              shiftType: p.shiftType,
              cantidad: p.cantidad,
              numPuestos: p.numPuestos || 1,
              horaInicio: p.horaInicio,
              horaFin: p.horaFin,
              dias: p.dias,
            }))
          : rest.dotacion;

        const cpqData = cpqCfg ? {
          quoteName: cpqCfg.quoteName || undefined,
          currency: cpqCfg.currency ?? DEFAULT_LEAD_CPQ_CURRENCY,
          marginPercentage: cpqCfg.marginPercentage,
          marginMode: cpqCfg.marginMode,
          financialCosts: cpqCfg.financialCosts,
          selectedCostGroups: cpqCfg.selectedCostGroups,
          costItems: cpqCfg.costItems.filter((c) => c.enabled).map((c) => ({
            catalogItemId: c.catalogItemId,
            name: c.name,
            type: c.type,
            unit: c.unit,
            basePrice: c.basePrice,
            priceOverride: c.priceOverride,
          })),
          additionalLines: cpqCfg.additionalLines.map((l) => ({
            nombre: l.nombre,
            precio: l.precio,
            cantidad: l.cantidad,
            marginPct: l.marginPct,
            recurrencia: l.recurrencia,
            tipo: l.tipo,
            descripcion: l.descripcion,
          })),
          conditions: cpqCfg.conditions,
          companyDescription: cpqCfg.companyDescription || undefined,
          serviceDescription: cpqCfg.serviceDescription || undefined,
          uniformChangesPerYear: cpqCfg.uniformChangesPerYear ?? 3,
          avgStayMonths: cpqCfg.avgStayMonths ?? 4,
        } : undefined;

        return {
          ...rest,
          dotacion,
          ...(useExistingInstallationId ? { useExistingInstallationId } : {}),
          ...(cpqData ? { cpqData } : {}),
        };
      });

    const firstCpq = cpqConfigs[installations[0]?._key];
    return {
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
      selectedCostGroups: firstCpq?.selectedCostGroups ?? selectedCostGroups,
      marginPercentage: firstCpq?.marginPercentage ?? 13,
      marginMode: firstCpq?.marginMode ?? "margin_on_sale",
      financialCosts: firstCpq?.financialCosts ?? {},
      proposalTemplateId: firstCpq?.conditions?.proposalTemplateId ?? proposalTemplateId,
      additionalLines: (firstCpq?.additionalLines ?? []).map((l) => ({
        name: l.nombre,
        monthlyAmount: Number(l.precio || 0),
        cantidad: l.cantidad,
        marginPct: l.marginPct,
        recurrencia: l.recurrencia,
        tipo: l.tipo,
        descripcion: l.descripcion,
      })),
    };
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
      const payload = buildApprovePayload();

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
        // Si hay coincidencia exacta por nombre, preseleccionar la cuenta existente.
        if (dups.length > 0) {
          const requestedName = (accountNameToUse || approveForm.accountName || "").trim();
          const normalizedRequested = normalizeCatalogLabel(requestedName);
          const exactMatch = dups.find(
            (dup: DuplicateAccount) => normalizeCatalogLabel(dup.name) === normalizedRequested
          );
          setUseExistingAccountId(exactMatch?.id ?? null);
        }
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

  // ─── Express: Approve and Send ───
  const approveAndSend = async () => {
    const accountNameToUse = useExistingAccountId ? "" : approveForm.accountName.trim();
    if (!useExistingAccountId && !accountNameToUse) {
      toast.error("El nombre de la empresa es obligatorio.");
      return;
    }
    if (!approveForm.email.trim()) {
      toast.error("El email del contacto es obligatorio para enviar la propuesta.");
      return;
    }
    // Check if any installation has positions (either in dotacion or cpqConfigs)
    const hasDotacion = installations.some((inst) => {
      const cpqCfg = cpqConfigs[inst._key];
      return (cpqCfg?.positions?.length ?? 0) > 0 || inst.dotacion.length > 0;
    });
    if (!hasDotacion) {
      toast.error("Agrega al menos un puesto de guardia.");
      return;
    }
    setSendingExpress(true);
    try {
      const payload = buildApprovePayload();

      const response = await fetch(`/api/crm/leads/${lead.id}/approve-and-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        if (result.error === "CALCULATION_FAILED" || result.error === "SEND_FAILED") {
          toast.error(result.message || "Error en el proceso express.");
          if (result.quoteId) {
            setApprovalResult({
              account: { id: result.data?.accountId || "", name: approveForm.accountName },
              contact: { id: result.data?.contactId || "", firstName: approveForm.contactFirstName, lastName: approveForm.contactLastName },
              deal: { id: result.dealId, title: approveForm.dealTitle },
              quotes: [{ id: result.quoteId, code: "", installationName: null }],
            });
          }
          return;
        }
        throw new Error(result?.error || "Error al aprobar y enviar");
      }

      toast.success(`Propuesta enviada a ${result.data.sentTo}`);

      // Open WhatsApp modal (igual que en CPQ: abre aunque no haya teléfono)
      let openedWhatsAppModal = false;
      if (result.data.whatsappMessage) {
        const phone = result.data.whatsappPhone ?? "";
        const message = result.data.whatsappMessage;
        const waUrl = phone
          ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
          : `https://wa.me/?text=${encodeURIComponent(message)}`;
        setWhatsappUrl(waUrl);
        setWhatsappSentTo(result.data.sentTo);
        setWhatsappModalOpen(true);
        openedWhatsAppModal = true;
      }

      // Navigate away after a delay (solo si no se abrió el modal de WhatsApp)
      setTimeout(() => {
        if (!openedWhatsAppModal) router.push("/crm/leads");
      }, 2000);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "No se pudo aprobar y enviar.");
    } finally {
      setSendingExpress(false);
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

  // ─── WhatsApp pre-filled message helpers ───
  const sanitizePhone = (phone: string): string => {
    const cleaned = phone.replace(/[\s\-\(\)\+]/g, "");
    if (cleaned.startsWith("9") && cleaned.length === 9) return `56${cleaned}`;
    return cleaned;
  };

  const buildWhatsAppUrl = (): string => {
    const phone = sanitizePhone(lead.phone || "");
    const nombre = (lead.firstName || "").split(" ")[0];
    const nombreEmpresa = lead.companyName || "";
    const solicitud = lead.notes || "";
    const message = `Hola ${nombre}, soy Carlos de Gard Security 👋
Hemos recibido tu consulta para ${nombreEmpresa}. La vamos a trabajar con mucho gusto.
Quería confirmar contigo que el servicio requerido es: ${solicitud}
¿Es correcto? Así avanzamos de inmediato.
Conoce más sobre nosotros en https://gard.cl`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  };

  // ─── Tab state & definitions ───
  const { activeTab, setActiveTab } = useEntityTabs("general");

  const STATUS_MAP: Record<string, { label: string; variant: "default" | "warning" | "success" | "destructive" }> = {
    pending: { label: "Pendiente", variant: "warning" },
    in_review: { label: "En revisión", variant: "default" },
    approved: { label: "Aprobado", variant: "success" },
    rejected: { label: "Rechazado", variant: "destructive" },
  };
  const statusInfo = STATUS_MAP[lead.status] || STATUS_MAP.pending;

  const [fileCount, setFileCount] = useState(0);
  useEffect(() => {
    fetch(`/api/crm/files?entityType=lead&entityId=${encodeURIComponent(lead.id)}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setFileCount(d.data.length); })
      .catch(() => {});
  }, [lead.id]);

  const tabs: EntityTab[] = [
    { id: "general", label: "General", icon: Info },
    { id: "account", label: "Cuenta", icon: Building2, hidden: !isEditable },
    { id: "contacts", label: "Contacto", icon: Users, hidden: !isEditable },
    { id: "deals", label: "Negocio", icon: Briefcase, hidden: !isEditable },
    { id: "installations", label: "Instalaciones", icon: MapPin, hidden: !isEditable },
    { id: "files", label: "Documentos", icon: FileText, count: fileCount },
  ];

  const headerActions: EntityHeaderAction[] = [
    { label: "Eliminar", icon: Trash2, variant: "destructive", onClick: () => setDeleteConfirm(true) },
  ];

  // === TAB: General ===
  const generalContent = (
      <div className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-5">
        <DetailFieldGrid columns={3}>
          <DetailField label="Empresa" value={lead.companyName} />
          <DetailField label="Contacto" value={fullName} />
          <DetailField label="Email" value={lead.email} copyable />
          <DetailField label="Teléfono" value={lead.phone} mono copyable />
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

        <DetailFieldGrid columns={3}>
          <DetailField label="Fecha creación" value={lead.createdAt ? new Date(lead.createdAt).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"} />
          <DetailField label="Última modificación" value={lead.updatedAt ? new Date(lead.updatedAt).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"} />
          <DetailField label="Fuente" value={<LeadSourceBadge source={lead.source} />} />
        </DetailFieldGrid>

        {/* Solicitud del cliente — siempre visible en General */}
        {(lead.serviceType || lead.notes) && (
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4 space-y-3">
            <h4 className="text-sm font-medium text-blue-400 flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-400 shrink-0" />
              Solicitud
            </h4>
            <div className="space-y-2 text-sm">
              {lead.serviceType && (
                <DetailField
                  label="Servicio"
                  value={SERVICE_TYPES.find((s) => s.value === lead.serviceType)?.label ?? lead.serviceType}
                />
              )}
              {lead.notes && (
                <TruncatedText label="Detalle de la solicitud" text={lead.notes} maxChars={300} />
              )}
            </div>
          </div>
        )}

        {/* Dotación solicitada (read-only summary) */}
        {dotacion && dotacion.length > 0 && (
          <DotacionSummary dotacion={dotacion} totalGuards={totalGuards} />
        )}

        {/* Entidades creadas (lead aprobado) */}
        {lead.status === "approved" && convertedEntities && (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
            <h4 className="text-sm font-medium text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Registros creados
            </h4>
            <div className="space-y-2 text-sm">
              {convertedEntities.account && (
                <Link href={`/crm/accounts/${convertedEntities.account.id}`} className="flex items-center gap-3 rounded-md border border-border p-3 hover:bg-muted/50 transition-colors">
                  <Building2 className="h-4 w-4 text-violet-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">Cuenta</p>
                    <p className="font-medium truncate">{convertedEntities.account.name}</p>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </Link>
              )}
              {convertedEntities.contact && (
                <Link href={`/crm/contacts/${convertedEntities.contact.id}`} className="flex items-center gap-3 rounded-md border border-border p-3 hover:bg-muted/50 transition-colors">
                  <Users className="h-4 w-4 text-blue-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">Contacto</p>
                    <p className="font-medium truncate">{[convertedEntities.contact.firstName, convertedEntities.contact.lastName].filter(Boolean).join(" ")}</p>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </Link>
              )}
              {convertedEntities.deal && (
                <Link href={`/crm/deals/${convertedEntities.deal.id}`} className="flex items-center gap-3 rounded-md border border-border p-3 hover:bg-muted/50 transition-colors">
                  <Briefcase className="h-4 w-4 text-amber-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">Negocio</p>
                    <p className="font-medium truncate">{convertedEntities.deal.title}</p>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </Link>
              )}
              {convertedEntities.quotes.map((q) => (
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

        {/* Correo original (email_forward) */}
        {lead.source === "email_forward" && meta && (() => {
          const emailMeta = meta as { inboundEmail?: { subject?: string; from?: string; text?: string; html?: string; receivedAt?: string } };
          const email = emailMeta?.inboundEmail;
          if (!email) return null;
          return (
            <div className="rounded-lg border border-border overflow-hidden min-w-0">
              <div className="px-3 py-2 border-b border-border/60 bg-muted/30 flex items-center gap-2">
                <Mailbox className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Correo original</span>
                {email.receivedAt && (
                  <span className="ml-auto text-[10px] text-muted-foreground">{new Date(email.receivedAt).toLocaleString()}</span>
                )}
              </div>
              <div className="p-3 space-y-2 text-sm min-w-0 overflow-hidden">
                {email.subject && (
                  <DetailFieldGrid columns={2}>
                    <DetailField label="Asunto" value={email.subject} />
                    <DetailField label="De" value={email.from} />
                  </DetailFieldGrid>
                )}
                <TruncatedText
                  text={email.text ? email.text : email.html ? email.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 2000) : "Sin contenido"}
                  maxChars={200}
                  className="rounded-md border border-border bg-background/80 p-3 text-xs"
                />
              </div>
            </div>
          );
        })()}

        {/* Rejection info */}
        {lead.status === "rejected" && rejectionInfo && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
            <h4 className="text-sm font-medium text-destructive flex items-center gap-2">
              <XCircle className="h-4 w-4" />
              Información del rechazo
            </h4>
            <DetailFieldGrid columns={3}>
              <DetailField label="Motivo" value={getRejectReasonLabel(rejectionInfo.reason)} />
              <DetailField label="Correo enviado" value={
                <Badge variant={rejectionInfo.emailSent ? "success" : "warning"} className="text-[10px]">
                  {rejectionInfo.emailSent ? "Sí" : "No"}
                </Badge>
              } />
              {rejectionInfo.note && <DetailField label="Observación" value={rejectionInfo.note} fullWidth />}
            </DetailFieldGrid>
          </div>
        )}

      </div>
  );

  // === For editable leads: approval form tab contents ===
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
              <select className="ml-6 mt-1 w-full max-w-[280px] sm:max-w-xs rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground min-h-[44px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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

    // TAB: Account
    const accountContent = (
        <div className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-5">
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
              <SearchableSelect
                value={approveForm.industry}
                options={industries.map((i) => ({ id: i.name, label: i.name }))}
                placeholder="Seleccionar industria"
                onChange={(val) => updateApproveForm("industry", val)}
              />
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
    );

    // TAB: Contacts
    const contactsContent = (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 rounded-lg border border-border bg-card p-4 sm:p-5">
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
    );

    // TAB: Deals
    const dealsContent = (
        <div className="space-y-3 rounded-lg border border-border bg-card p-4 sm:p-5">
          <div className="space-y-1.5">
            <Label className="text-xs">Título del negocio</Label>
            <Input value={approveForm.dealTitle} onChange={(e) => updateApproveForm("dealTitle", e.target.value)} placeholder="Oportunidad para..." className={inputClassName} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Solicitud</Label>
            <textarea value={approveForm.notes} onChange={(e) => updateApproveForm("notes", e.target.value)}
              placeholder="Descripción de la solicitud (se copiará al negocio y cotización)..."
              className={`w-full min-h-[120px] resize-y rounded-md border px-3 py-2 text-sm ${inputClassName}`} rows={5} />
            <p className="text-[10px] text-muted-foreground">Esta solicitud se agregará al negocio y a las cotizaciones creadas.</p>
          </div>
        </div>
    );

    // TAB: Installations & Dotación
    const installationsContent = (
        <div className="space-y-5 pb-52 sm:pb-40 lg:pb-32">
          {installations.length === 0 && (
            <div className="rounded-xl border border-dashed border-border/70 bg-card/40 px-4 py-8 text-center">
              <p className="text-xs text-muted-foreground">Sin instalaciones. Usa &quot;Nueva instalación&quot; para comenzar (luego puedes duplicar cada una con el ícono de copiar en su fila).</p>
            </div>
          )}
          {installations.map((inst, instIdx) => {
            const instConfig = cpqConfigs[inst._key];
            const isExpanded = expandedInstallations[inst._key] !== false; // default expanded
            const instGuards = instConfig?.positions?.reduce((s, p) => s + (p.cantidad || 1) * (p.numPuestos || 1), 0) ?? 0;
            const dispCur = (instConfig?.currency ?? DEFAULT_LEAD_CPQ_CURRENCY) as "CLP" | "UF";
            const saleClp = leadCpqSaleClpByKey[inst._key];
            const salePending = leadCpqTotalsLoading && !(inst._key in leadCpqSaleClpByKey);
            const ufV = ufValue && ufValue > 0 ? ufValue : null;
            const saleUf = saleClp != null && ufV ? saleClp / ufV : null;
            const marginPct = instConfig?.marginPercentage ?? 0;
            const finEnabled = instConfig?.financialCosts?.financialEnabled;
            const finPct = instConfig?.financialCosts?.financialRatePct ?? 0;
            return (
            <div
              key={inst._key}
              className="rounded-xl border-2 border-border bg-card shadow-sm ring-1 ring-border/40 overflow-hidden"
            >
              {/* Cabecera: izquierda = expandir/contraer; derecha = quitar, copiar, chevron */}
              <div className="flex w-full items-stretch">
                <button
                  type="button"
                  onClick={() => setExpandedInstallations((prev) => ({ ...prev, [inst._key]: !isExpanded }))}
                  className="min-w-0 flex-1 flex items-center gap-2 px-4 py-3 text-left hover:bg-muted/10 transition-colors rounded-tl-xl"
                >
                  <MapPin className="h-4 w-4 shrink-0 text-primary" />
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground shrink-0">#{instIdx + 1}</span>
                  <span className="text-sm font-semibold min-w-0 truncate">
                    {inst.name || <span className="text-muted-foreground italic">Sin nombre</span>}
                  </span>
                  {!isExpanded && instGuards > 0 && (
                    <span className="text-[10px] text-muted-foreground ml-1 truncate">
                      {instConfig?.positions?.length ?? 0} puesto(s) · {instGuards} guardias
                    </span>
                  )}
                </button>
                <div className="flex items-center gap-0.5 pr-2 shrink-0 border-l border-border/30">
                  {installations.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      title="Quitar instalación"
                      onClick={() => removeInstallation(inst._key)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    title="Copiar esta instalación (datos y cotización)"
                    onClick={() => duplicateInstallationByKey(inst._key)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-tr-xl"
                    title={isExpanded ? "Plegar" : "Expandir"}
                    onClick={() => setExpandedInstallations((prev) => ({ ...prev, [inst._key]: !isExpanded }))}
                  >
                    <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
                  </Button>
                </div>
              </div>
              {!isExpanded && (instConfig?.positions?.length ?? 0) > 0 && (
                <div className="px-4 pb-2.5 pt-1.5 border-t border-border/25 bg-muted/10 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  {salePending ? (
                    <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin shrink-0" aria-hidden />
                      Calculando…
                    </span>
                  ) : saleClp != null ? (
                    <>
                      {dispCur === "UF" ? (
                        <>
                          <span className="text-sm font-semibold tabular-nums text-emerald-500 dark:text-emerald-400">
                            {saleUf != null
                              ? `${saleUf.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF`
                              : "— UF"}
                          </span>
                          <span className="text-[11px] text-muted-foreground tabular-nums">{formatCurrency(saleClp)}</span>
                        </>
                      ) : (
                        <>
                          <span className="text-sm font-semibold tabular-nums text-sky-500 dark:text-sky-400">
                            {formatCurrency(saleClp)}
                          </span>
                          {saleUf != null ? (
                            <span className="text-[11px] font-medium tabular-nums text-emerald-600/85 dark:text-emerald-400/90">
                              {saleUf.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF
                            </span>
                          ) : null}
                        </>
                      )}
                      <span className="text-[10px] text-muted-foreground hidden sm:inline">·</span>
                      <span className="text-[10px] text-muted-foreground">Margen {marginPct}%</span>
                      {finEnabled ? (
                        <span className="text-[10px] text-muted-foreground">Fin. {finPct}%</span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">Sin total</span>
                  )}
                </div>
              )}
              {/* Collapsible content */}
              {isExpanded && (
              <div className="px-4 pb-4 pt-1 space-y-3 border-t border-border/30">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                    <MapsUrlPasteInput onResolve={(result) => handleAddressChange(inst._key, result)} className="mt-1.5" />
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

                {/* ── CPQ Embebido (dentro de cada instalación) ── */}
                <LeadInstallationCpq
                  config={cpqConfigs[inst._key] || createDefaultLeadCpqConfig()}
                  onChange={(cfg) => setCpqConfigs((prev) => ({ ...prev, [inst._key]: cfg }))}
                  proposalTemplates={proposalTemplates}
                  catalogDefaults={defaultPuesto.id ? { puestoId: defaultPuesto.id, puestoName: defaultPuesto.name, cargoId: defaultCargoId, rolId: defaultRolId } : undefined}
                  cpqPuestos={cpqPuestos}
                  cpqCargos={cpqCargos}
                  cpqRoles={cpqRoles}
                  leadId={lead.id}
                  accountName={approveForm.accountName}
                  industry={approveForm.industry}
                  installationName={inst.name}
                  installationCity={inst.city}
                  ufValue={ufValue}
                />
              </div>
              )}
            </div>
            );
          })}
          <p className="text-[10px] text-muted-foreground">
            Cada instalación tiene su propia configuración. El nombre de cotización sigue al nombre de la instalación hasta que lo edites. Con la fila plegada ves total UF/CLP y márgenes según la moneda elegida.
          </p>
        </div>
    );

  return (
    <>
      <EntityDetailLayout
        className={isEditable ? "pb-52 sm:pb-28" : undefined}
        breadcrumb={["CRM", "Prospectos", lead.companyName || fullName]}
        breadcrumbHrefs={["/crm", "/crm/leads"]}
        header={{
          avatar: { initials: (lead.companyName || fullName).charAt(0).toUpperCase() },
          title: lead.companyName || fullName,
          status: statusInfo,
          actions: headerActions,
          extra: (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {headerAutosaveIndicator}
              {lead.phone ? (
                <div className="flex items-center gap-1.5">
                  <a href={`tel:+${sanitizePhone(lead.phone || "")}`} title="Llamar"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted transition-colors">
                    <Phone className="h-4 w-4" />
                  </a>
                  <a href={buildWhatsAppUrl()} target="_blank" rel="noopener noreferrer" title="WhatsApp"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-green-600/30 bg-green-600/15 text-green-400 hover:bg-green-600/25 transition-colors">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                  </a>
                </div>
              ) : null}
            </div>
          ),
        }}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        stickyMeta={leadStickyMeta}
      >
        {activeTab === "general" && generalContent}
        {activeTab === "account" && isEditable && accountContent}
        {activeTab === "contacts" && isEditable && contactsContent}
        {activeTab === "deals" && isEditable && dealsContent}
        {activeTab === "installations" && isEditable && (
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-sm font-medium">Instalaciones y Dotación</h3>
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addInstallation}>
                <Plus className="h-3 w-3" /> Nueva instalación
              </Button>
            </div>
            {installationsContent}
          </div>
        )}
        {activeTab === "files" && <FileAttachments entityType="lead" entityId={lead.id} readOnly={!isEditable} title="Documentos" />}
      </EntityDetailLayout>

      {/* ── Sticky action bar for editable leads ── */}
      {isEditable && (
        <div className="sticky bottom-14 lg:bottom-0 -mx-4 sm:-mx-6 lg:-mx-8 xl:-mx-10 2xl:-mx-12 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] z-10">
          {!duplicateChecked && (
            <p className="text-xs text-muted-foreground mb-2 w-full text-center sm:text-left">
              Nada se crea hasta que hagas clic en &quot;Verificar y aprobar&quot; y luego confirmes.
            </p>
          )}
          {duplicateChecked && (
            <div className="mb-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-foreground space-y-1">
              <p className="font-medium text-emerald-400">Verificación completada — al confirmar se creará:</p>
              <div className="flex flex-wrap gap-2 mt-1.5">
                <Badge variant="outline" className="gap-1.5 text-[11px]">
                  <Building2 className="h-3 w-3" />
                  {useExistingAccountId
                    ? <><span className="text-amber-400">Usar:</span> {duplicates.find((d) => d.id === useExistingAccountId)?.name || "existente"}</>
                    : <><span className="text-emerald-400">Nueva:</span> {approveForm.accountName}</>}
                </Badge>
                <Badge variant="outline" className="gap-1.5 text-[11px]">
                  <Users className="h-3 w-3" />
                  {existingContact
                    ? contactResolution === "use_existing"
                      ? <><span className="text-amber-400">Mantener:</span> {existingContact.firstName}</>
                      : contactResolution === "overwrite"
                        ? <><span className="text-amber-400">Sobrescribir:</span> {existingContact.firstName}</>
                        : <span className="text-emerald-400">Nuevo contacto</span>
                    : <><span className="text-emerald-400">Nuevo:</span> {approveForm.contactFirstName} {approveForm.contactLastName}</>}
                </Badge>
                <Badge variant="outline" className="gap-1.5 text-[11px]">
                  <Briefcase className="h-3 w-3" />
                  {approveForm.dealTitle}
                </Badge>
                {installations.filter((i) => i.name.trim()).length > 0 && (
                  <Badge variant="outline" className="gap-1.5 text-[11px]">
                    <MapPin className="h-3 w-3" />
                    {installations.filter((i) => i.name.trim()).map((i) => i.name).join(", ")}
                  </Badge>
                )}
              </div>
            </div>
          )}
          {/* Mobile: Aprobar first (top, thumb-reachable), then others */}
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={saveLeadDraft} disabled={approving || savingLead} className="sm:order-1">
              {savingLead ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Guardar en revisión
            </Button>
            <Button variant="outline" size="sm" onClick={openRejectModal} disabled={approving || savingLead} className="text-destructive hover:text-destructive sm:order-2">
              <XCircle className="mr-2 h-4 w-4" />
              Rechazar
            </Button>
            <Button onClick={approveLead} disabled={approving || savingLead || sendingExpress} className="sm:order-3">
              {approving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              {!duplicateChecked
                ? "Verificar y aprobar"
                : (duplicates.length > 0 || existingContact || installationConflicts.length > 0)
                  ? "Confirmar aprobación (con conflictos)"
                  : "Confirmar aprobación"}
            </Button>
            {duplicateChecked && approveForm.email.trim() && installations.some((i) => i.dotacion.length > 0 || (cpqConfigs[i._key]?.positions?.length ?? 0) > 0) && (
              <Button onClick={approveAndSend} disabled={approving || savingLead || sendingExpress} className="sm:order-4 bg-emerald-600 hover:bg-emerald-700 text-white">
                {sendingExpress ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Aprobar y Enviar
              </Button>
            )}
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
              <>
                <Button className="w-full" onClick={() => router.push(`/cpq/${approvalResult.quotes[0].id}`)}>
                  <FileText className="mr-2 h-4 w-4" />
                  Ir al CPQ — Revisar y ajustar
                </Button>
                {approveForm.email.trim() && approvalResult.quotes.length > 0 && (
                  <Button
                    variant="default"
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                    disabled={sendingExpress}
                    onClick={async () => {
                      setSendingExpress(true);
                      try {
                        const quoteId = approvalResult!.quotes[0].id;
                        // Generate AI description first
                        await fetch("/api/ai/quote-description", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ quoteId }),
                        }).catch(() => {});
                        // Send via portal (recipientContactId para asegurar contacto correcto)
                        const res = await fetch(`/api/cpq/quotes/${quoteId}/send-portal`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            followUp: { include: true, targetStageId: null },
                            recipientContactId: approvalResult!.contact.id,
                          }),
                        });
                        const data = await res.json();
                        if (!res.ok || !data.success) throw new Error(data.error || "Error al enviar");
                        toast.success(`Propuesta enviada a ${data.data.sentTo}`);
                        setApprovalResult(null);
                        if (data.data.whatsappMessage) {
                          const phone = data.data.whatsappPhone ?? "";
                          const waUrl = phone
                            ? `https://wa.me/${phone}?text=${encodeURIComponent(data.data.whatsappMessage)}`
                            : `https://wa.me/?text=${encodeURIComponent(data.data.whatsappMessage)}`;
                          setWhatsappUrl(waUrl);
                          setWhatsappSentTo(data.data.sentTo ?? "");
                          setWhatsappModalOpen(true);
                        } else {
                          router.push("/crm/leads");
                        }
                      } catch (err) {
                        console.error(err);
                        toast.error(err instanceof Error ? err.message : "Error al enviar propuesta");
                      } finally {
                        setSendingExpress(false);
                      }
                    }}
                  >
                    {sendingExpress ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    Enviar propuesta ahora
                  </Button>
                )}
              </>
            )}
            <Button variant="outline" className="w-full" onClick={() => { setApprovalResult(null); router.push("/crm/leads"); }}>
              Volver a leads
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── WhatsApp Modal (post-send) — mismo diseño que portal/CPQ ── */}
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
              Email enviado a <strong className="text-foreground">{whatsappSentTo || "el cliente"}</strong>. Haz clic para enviarle el mismo mensaje por WhatsApp.
            </p>
            <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 space-y-1">
              <p className="text-xs font-semibold text-green-400 uppercase tracking-wide">El mensaje incluye</p>
              <p className="text-xs text-muted-foreground">🔑 Email y PIN de acceso al portal</p>
              <p className="text-xs text-muted-foreground">🔗 Link al portal y a la propuesta técnica</p>
              <p className="text-xs text-muted-foreground">📋 Beneficios del portal explicados</p>
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            {whatsappUrl && (
              <Button
                className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white h-11"
                onClick={() => { window.open(whatsappUrl, "_blank"); setWhatsappModalOpen(false); router.push("/crm/leads"); }}
              >
                <MessageCircle className="h-4 w-4" />
                Compartir por WhatsApp
              </Button>
            )}
            <Button variant="ghost" className="w-full text-muted-foreground text-xs" onClick={() => { setWhatsappModalOpen(false); router.push("/crm/leads"); }}>
              Omitir
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
            <label className="flex items-center gap-2.5 text-sm cursor-pointer rounded-md border border-border px-3 py-2.5 hover:bg-muted/30 transition-colors">
              <input type="checkbox" checked={rejectSendEmail} onChange={(e) => setRejectSendEmail(e.target.checked)} className="h-4 w-4 rounded border-input" />
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
