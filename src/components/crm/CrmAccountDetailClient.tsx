/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/opai-ds";
import { getQuoteStatus } from "@/lib/quoteStatus";
import { CrmInstallationsClient } from "./CrmInstallationsClient";
import { EmailHistoryList } from "./EmailHistoryList";
import { EntityDetailLayout, useEntityTabs, type EntityTab, type EntityHeaderAction } from "./EntityDetailLayout";
import { OnboardingAccountBanner } from "@/components/crm/onboarding/OnboardingAccountBanner";
import { OnboardingClientModal } from "@/components/crm/onboarding/OnboardingClientModal";
import { AccountBillingDocSection } from "@/components/crm/AccountBillingDocSection";
import { DetailField } from "./DetailField";
import { CrmRelatedRecordCard, CrmRelatedRecordGrid } from "./CrmRelatedRecordCard";
import { AssociatedTicketsSection } from "./AssociatedTicketsSection";
import { CRM_MODULES } from "./CrmModuleIcons";
import {
  MapPin,
  Pencil,
  Trash2,
  Loader2,
  Plus,
  Sparkles,
  ExternalLink,
  Info,
  Users,
  Briefcase,
  FileText,
  Mail,
  Phone,
  Receipt,
  Shield,
  History,
  ClipboardList,
  ScrollText,
  MessageCircle,
  GitMerge,
  Key,
  ChevronDown,
  Power,
  UserCheck,
  ListChecks,
  Ticket as TicketIcon,
} from "lucide-react";
import { DuplicateAccountModal } from "./DuplicateAccountModal";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { FileAttachments } from "./FileAttachments";
import { AccountExpensesSection } from "@/components/finance/AccountExpensesSection";
import { CreateQuoteModal } from "@/components/cpq/CreateQuoteModal";
import { CreateDealModal } from "./CreateDealModal";
import { CrmSectionCreateButton } from "./CrmSectionCreateButton";
import { AssociatedRecordsPanel, type AssociatedSection } from "@/components/ui/AssociatedRecordsPanel";
import { AccountPortalSection } from "./AccountPortalSection";
import { AccountContractsSection } from "./AccountContractsSection";
import { CrmActivityTimeline } from "./CrmActivityTimeline";
import { NewExternalChatModal } from "@/components/chat/NewExternalChatModal";
import { useChatSidePanelContext } from "@/components/chat/ChatFloatingProvider";
import { useRegisterChatPageContext } from "@/components/opai/ChatPageContextProvider";

const ACCOUNT_LOGO_MARKER_PREFIX = "[[ACCOUNT_LOGO_URL:";
const ACCOUNT_LOGO_MARKER_SUFFIX = "]]";

function extractAccountLogoUrl(notes?: string | null): string | null {
  if (!notes) return null;
  const start = notes.indexOf(ACCOUNT_LOGO_MARKER_PREFIX);
  if (start === -1) return null;
  const end = notes.indexOf(ACCOUNT_LOGO_MARKER_SUFFIX, start);
  if (end === -1) return null;
  const raw = notes
    .slice(start + ACCOUNT_LOGO_MARKER_PREFIX.length, end)
    .trim();
  return raw || null;
}

function stripAccountLogoMarker(notes?: string | null): string {
  if (!notes) return "";
  const pattern = /\[\[ACCOUNT_LOGO_URL:[^\]]+\]\]\n?/g;
  return notes.replace(pattern, "").trim();
}

function withAccountLogoMarker(notes: string, logoUrl: string | null): string {
  const cleanNotes = stripAccountLogoMarker(notes);
  if (!logoUrl) return cleanNotes;
  const marker = `${ACCOUNT_LOGO_MARKER_PREFIX}${logoUrl}${ACCOUNT_LOGO_MARKER_SUFFIX}`;
  return cleanNotes ? `${marker}\n${cleanNotes}` : marker;
}

const BROKEN_LOGO_PREFIX = "/uploads/company-logos/";
function sanitizeLogoUrl(url: string | null | undefined): string | null {
  if (!url || url.startsWith(BROKEN_LOGO_PREFIX)) return null;
  return url;
}

type ContactRow = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  roleTitle?: string | null;
  isPrimary?: boolean;
  portalEnabled?: boolean;
  portalPinVisible?: string | null;
};

type DealRow = {
  id: string;
  title: string;
  amount: string;
  status: string;
  stage?: { name: string; color?: string | null } | null;
  primaryContact?: { firstName: string; lastName: string } | null;
};

type InstallationRow = {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  commune?: string | null;
  lat?: number | null;
  lng?: number | null;
  notes?: string | null;
  status?: "prospect" | "active" | "inactive";
  contractStatus?: "vigente" | "por_vencer" | "vencido" | "no_aplica" | "sin_documento";
  contractTitle?: string | null;
};

type QuoteRow = {
  id: string;
  code: string;
  name?: string | null;
  status: string;
  clientName?: string | null;
  monthlyCost: number | string;
  createdAt: string;
};

type AccountDetail = {
  id: string;
  name: string;
  type: "prospect" | "client";
  isActive: boolean;
  status: "prospect" | "client_active" | "client_inactive" | string;
  rut?: string | null;
  legalName?: string | null;
  legalRepresentativeName?: string | null;
  legalRepresentativeRut?: string | null;
  industry?: string | null;
  /** Giro / actividad económica formal SII (autocompleta receptor en DTE). */
  giro?: string | null;
  segment?: string | null;
  website?: string | null;
  address?: string | null;
  commune?: string | null;
  /** Ciudad (distinta a comuna). El SII pide ambas en facturas. */
  city?: string | null;
  notaryName?: string | null;
  notaryDate?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  // ── Documento de Cobro ──
  numeroOrdenContrato?: string | null;
  contactoEstadoPagoId?: string | null;
  layoutDocumentoCobro?: "DTE_PREVIEW" | "PROFORMA" | "ESTADO_DE_PAGO";
  contacts: ContactRow[];
  deals: DealRow[];
  installations: InstallationRow[];
  // Canonical source for legal reps / personería. The portal edits these
  // tables directly; the flat columns above are a cache for token resolution.
  representantesLegales?: Array<{
    id: string;
    nombre: string;
    rut: string;
    email: string | null;
  }>;
  personeria?: {
    id: string;
    fechaEscritura: string | null;
    tipoEscritura: string | null;
    notaria: string | null;
  } | null;
  encuestasCliente?: Array<{
    id: string;
    contactName: string;
    averageScore: number | null;
    npsScore: number | null;
    createdAt: string;
    visitId: string;
  }>;
  _count: { contacts: number; deals: number; installations: number };
};

type ActivityEvent = {
  id: string;
  action: string;
  details?: Record<string, unknown> | null;
  createdAt: string;
  createdBy?: string | null;
  createdByName?: string | null;
};

function formatCLP(value: number | string): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 0 }).format(n || 0);
}

function getAccountLifecycle(account: Pick<AccountDetail, "status" | "type" | "isActive">) {
  if (account.status === "prospect") return "prospect";
  if (account.status === "client_active") return "client_active";
  if (account.status === "client_inactive") return "client_inactive";
  if (account.type === "prospect") return "prospect";
  return account.isActive ? "client_active" : "client_inactive";
}

export function CrmAccountDetailClient({
  account: initialAccount,
  quotes = [],
  activityEvents = [],
  currentUserId,
}: {
  account: AccountDetail;
  quotes?: QuoteRow[];
  activityEvents?: ActivityEvent[];
  currentUserId: string;
}) {
  const router = useRouter();
  const chatCtx = useChatSidePanelContext();
  const [account, setAccount] = useState(initialAccount);

  // Registra contexto de página para el asistente OPAI Intelligence:
  // permite preguntas tipo "resúmeme este cliente", "qué documentos tiene",
  // "muéstrame las cotizaciones", sin que el usuario tenga que repetir el nombre.
  useRegisterChatPageContext({
    entityType: "crm_account",
    entityId: account.id,
    entityName: account.name,
    entityUrl: `/crm/accounts/${account.id}`,
    extra: account.industry ? `Industria: ${account.industry}` : undefined,
  });
  const [accountLogoUrl, setAccountLogoUrl] = useState<string | null>(
    sanitizeLogoUrl(
      (initialAccount as Record<string, unknown>).logoUrl as string | null
      ?? extractAccountLogoUrl(initialAccount.notes)
    )
  );

  // ── Account edit state ──
  const [editAccountOpen, setEditAccountOpen] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  /**
   * Estado del lookup SII: cuando `loading=true` mostramos spinner en
   * el botón. Cuando `data` viene seteado se abre el modal de preview
   * con el diff y los checkboxes para aplicar selectivamente.
   */
  const [siiLookup, setSiiLookup] = useState<{
    loading: boolean;
    data: {
      rut: string;
      sii: {
        razonSocial: string;
        giro: string | null;
        giroCodigo: string | null;
        direccion: string | null;
        comuna: string | null;
        ciudad: string | null;
        correoIntercambio: string | null;
      };
      rawSii: {
        actividadesEconomicas: Array<{ codigo: string; descripcion: string }>;
        domicilios: Array<{ direccion: string; ciudad: string; comuna: string }>;
      };
      diff: Record<string, { current: string | null; sii: string | null; changes: boolean }>;
      apply: Record<string, { enabled: boolean; value: string }>;
    } | null;
  }>({ loading: false, data: null });
  const [applyingSii, setApplyingSii] = useState(false);
  const [updatingAccountType, setUpdatingAccountType] = useState(false);
  const [updatingAccountStatus, setUpdatingAccountStatus] = useState(false);
  const [accountStatusConfirmOpen, setAccountStatusConfirmOpen] = useState(false);
  const [accountStatusNextValue, setAccountStatusNextValue] = useState<boolean>(false);
  const [accountTypeConfirmOpen, setAccountTypeConfirmOpen] = useState(false);
  const [accountTypeNextValue, setAccountTypeNextValue] = useState<"prospect" | "client">("client");
  // Relations pre-fill when flat columns lag (portal is the canonical editor).
  // Single-rep contexts: legacy edit form. Multi-rep editing happens in Portal Cliente.
  const firstRepForForm = account.representantesLegales?.[0];
  const personeriaForForm = account.personeria;
  const [accountForm, setAccountForm] = useState({
    name: account.name,
    rut: account.rut || "",
    legalName: account.legalName || "",
    legalRepresentativeName:
      account.legalRepresentativeName || firstRepForForm?.nombre || "",
    legalRepresentativeRut:
      account.legalRepresentativeRut || firstRepForForm?.rut || "",
    industry: account.industry || "",
    giro: account.giro || "",
    segment: account.segment || "",
    website: account.website || "",
    address: account.address || "",
    commune: account.commune || "",
    city: account.city || "",
    notaryName: account.notaryName || personeriaForForm?.notaria || "",
    notaryDate:
      account.notaryDate ||
      (personeriaForForm?.fechaEscritura
        ? personeriaForForm.fechaEscritura.slice(0, 10)
        : ""),
    startDate: account.startDate ? new Date(account.startDate).toISOString().slice(0, 10) : "",
    endDate: account.endDate ? new Date(account.endDate).toISOString().slice(0, 10) : "",
    notes: stripAccountLogoMarker(account.notes),
  });

  // ── Logo upload ──
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("entityType", "account");
      formData.append("entityId", account.id);
      const res = await fetch("/api/crm/files/upload", { method: "POST", body: formData });
      const json = await res.json();
      const logoUrl = json.data?.publicUrl ?? json.data?.url;
      if (json.success && logoUrl) {
        await fetch(`/api/crm/accounts/${account.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ logoUrl }),
        });
        setAccountLogoUrl(logoUrl);
      }
    } catch {
      // silently fail
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }

  // ── Chat modal state ──
  const [chatModalOpen, setChatModalOpen] = useState(false);

  // ── Contact edit state ──
  const [editContact, setEditContact] = useState<ContactRow | null>(null);
  const [editForm, setEditForm] = useState({ firstName: "", lastName: "", email: "", phone: "", roleTitle: "", isPrimary: false });
  const [savingContact, setSavingContact] = useState(false);

  // ── New contact state ──
  const [newContactOpen, setNewContactOpen] = useState(false);
  const [dealCreateOpen, setDealCreateOpen] = useState(false);
  const [quoteCreateOpen, setQuoteCreateOpen] = useState(false);
  const [newContactForm, setNewContactForm] = useState({ firstName: "", lastName: "", email: "", phone: "", roleTitle: "", isPrimary: false });
  const [creatingContact, setCreatingContact] = useState(false);

  // ── Delete state ──
  const [deleteAccountConfirm, setDeleteAccountConfirm] = useState(false);
  const [deleteContactConfirm, setDeleteContactConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: "" });

  // ── Cambio de contacto principal (solo uno por cuenta) ──
  const [primaryChangeConfirm, setPrimaryChangeConfirm] = useState<{ type: "edit" | "new"; otherName: string } | null>(null);

  // ── Ref para abrir modal de nueva instalación desde header de sección ──
  const createInstallationRef = useRef<{ open: () => void } | null>(null);

  // ── Enrich / Regenerate company info ──
  const [enrichingCompanyInfo, setEnrichingCompanyInfo] = useState(false);
  const [enrichWebsiteInput, setEnrichWebsiteInput] = useState("");
  const [regenerateInstruction, setRegenerateInstruction] = useState("");
  const [regenerating, setRegenerating] = useState(false);

  const lifecycle = getAccountLifecycle(account);

  const inputCn = "bg-background text-foreground placeholder:text-muted-foreground border-input focus-visible:ring-ring";

  // ── Account handlers ──
  const openAccountEdit = () => {
    // Single-rep canonical (matches token resolution behavior).
    const firstRep = account.representantesLegales?.[0];
    const pers = account.personeria;
    setAccountForm({
      name: account.name,
      rut: account.rut || "",
      legalName: account.legalName || "",
      legalRepresentativeName:
        account.legalRepresentativeName || firstRep?.nombre || "",
      legalRepresentativeRut:
        account.legalRepresentativeRut || firstRep?.rut || "",
      industry: account.industry || "",
      giro: account.giro || "",
      segment: account.segment || "",
      website: account.website || "",
      address: account.address || "",
      commune: account.commune || "",
      city: account.city || "",
      notaryName: account.notaryName || pers?.notaria || "",
      notaryDate:
        account.notaryDate ||
        (pers?.fechaEscritura ? pers.fechaEscritura.slice(0, 10) : ""),
      startDate: account.startDate ? new Date(account.startDate).toISOString().slice(0, 10) : "",
      endDate: account.endDate ? new Date(account.endDate).toISOString().slice(0, 10) : "",
      notes: stripAccountLogoMarker(account.notes),
    });
    setEditAccountOpen(true);
  };

  const saveAccount = async () => {
    if (!accountForm.name.trim()) { toast.error("El nombre es obligatorio."); return; }
    setSavingAccount(true);
    try {
      const res = await fetch(`/api/crm/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...accountForm,
          notes: withAccountLogoMarker(accountForm.notes, accountLogoUrl),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);
      setAccount((prev) => ({
        ...prev,
        ...accountForm,
        notes: withAccountLogoMarker(accountForm.notes, accountLogoUrl),
      }));
      setEditAccountOpen(false);
      toast.success("Cuenta actualizada");
    } catch {
      toast.error("No se pudo actualizar la cuenta.");
    } finally {
      setSavingAccount(false);
    }
  };

  const deleteAccount = async () => {
    try {
      const res = await fetch(`/api/crm/accounts/${account.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Cuenta eliminada");
      router.push("/crm/accounts");
    } catch {
      toast.error("No se pudo eliminar");
    }
  };

  /**
   * Lookup SII por RUT vía SimpleAPI. NO escribe en la cuenta — sólo
   * trae los datos oficiales y abre un modal donde el operador elige
   * qué campos aplicar (con preview del diff vs. estado actual).
   *
   * El SII puede tardar hasta ~2 minutos por RUT (cola del SII), por
   * eso el endpoint backend tiene `maxDuration: 120` y acá mostramos
   * spinner persistente mientras esperamos.
   */
  const lookupRutFromSii = async () => {
    if (!account.rut) {
      toast.error("Necesitás cargar el RUT antes de consultar al SII.");
      return;
    }
    setSiiLookup({ loading: true, data: null });
    try {
      const res = await fetch(
        `/api/crm/accounts/${account.id}/lookup-rut`,
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Error al consultar al SII");
      }
      const initialApply: Record<string, { enabled: boolean; value: string }> = {};
      for (const [k, v] of Object.entries(
        json.data.diff as Record<string, { changes: boolean; sii: string | null }>,
      )) {
        // Por default activamos los campos donde el SII trae info y hay
        // cambio respecto al actual. El operador puede destildar y/o editar
        // el valor manualmente antes de aplicar.
        initialApply[k] = { enabled: v.changes, value: v.sii ?? "" };
      }
      setSiiLookup({
        loading: false,
        data: { ...json.data, apply: initialApply },
      });
    } catch (err) {
      toast.error((err as Error).message);
      setSiiLookup({ loading: false, data: null });
    }
  };

  /**
   * Aplica los campos seleccionados del lookup SII al CrmAccount vía
   * PATCH. Mapea las keys del diff a las del schema (son las mismas).
   */
  const applySiiData = async () => {
    if (!siiLookup.data) return;
    const { apply } = siiLookup.data;
    // Usamos el value editable del state (prepoblado con SII pero
    // sobrescribible por el operador). Si el operador vacía el campo
    // editado, lo enviamos como null para limpiar el dato en la cuenta.
    const fieldMap: Array<["legalName" | "giro" | "address" | "commune" | "city", string]> = [
      ["legalName", "legalName"],
      ["giro", "giro"],
      ["address", "address"],
      ["commune", "commune"],
      ["city", "city"],
    ];
    const payload: Record<string, string | null> = {};
    for (const [field] of fieldMap) {
      const entry = apply[field];
      if (!entry?.enabled) continue;
      const trimmed = entry.value.trim();
      payload[field] = trimmed || null;
    }

    if (Object.keys(payload).length === 0) {
      toast.error("No seleccionaste ningún campo para aplicar.");
      return;
    }

    setApplyingSii(true);
    try {
      const res = await fetch(`/api/crm/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "No se pudo actualizar");
      setAccount((prev) => ({ ...prev, ...payload }));
      toast.success(
        `Cuenta actualizada con ${Object.keys(payload).length} campo(s) del SII.`,
      );
      setSiiLookup({ loading: false, data: null });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setApplyingSii(false);
    }
  };

  const enrichCompanyInfoFromWebsite = async () => {
    const website = (account.website || enrichWebsiteInput || "").trim();
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
          companyName: account.name,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "No se pudo obtener información del sitio.");
      }
      const summary = payload?.data?.summary || "";
      const normalizedWebsite = payload?.data?.websiteNormalized || "";
      const logoUrl = sanitizeLogoUrl(payload?.data?.localLogoUrl || payload?.data?.logoUrl);
      const industry = payload?.data?.industry || "";
      const segment = payload?.data?.segment || "";
      const legalName = payload?.data?.legalName || "";
      const companyRut = payload?.data?.companyRut || "";
      const legalRepresentativeName = payload?.data?.legalRepresentativeName || "";
      const legalRepresentativeRut = payload?.data?.legalRepresentativeRut || "";

      const newNotes = summary ? withAccountLogoMarker(summary, logoUrl) : (logoUrl ? withAccountLogoMarker("", logoUrl) : account.notes);
      const patchBody: Record<string, unknown> = {
        notes: newNotes,
        website: normalizedWebsite || account.website,
        industry: industry && !["not available", "n/a", "no disponible"].includes(industry.toLowerCase()) ? industry : account.industry,
        segment: segment && !["not available", "n/a", "no disponible"].includes(segment.toLowerCase()) ? segment : account.segment,
        legalName: legalName && !["not available", "n/a", "no disponible"].includes(legalName.toLowerCase()) ? legalName : account.legalName,
        rut: companyRut && !["not available", "n/a", "no disponible"].includes(companyRut.toLowerCase()) ? companyRut : account.rut,
        legalRepresentativeName: legalRepresentativeName && !["not available", "n/a", "no disponible"].includes(legalRepresentativeName.toLowerCase()) ? legalRepresentativeName : account.legalRepresentativeName,
        legalRepresentativeRut: legalRepresentativeRut && !["not available", "n/a", "no disponible"].includes(legalRepresentativeRut.toLowerCase()) ? legalRepresentativeRut : account.legalRepresentativeRut,
      };
      const res = await fetch(`/api/crm/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error);

      setAccount((prev) => ({ ...prev, ...patchBody }));
      setAccountLogoUrl(logoUrl);
      setEnrichWebsiteInput("");
      setAccountForm((prev) => ({
        ...prev,
        notes: stripAccountLogoMarker(newNotes),
        website: patchBody.website as string || prev.website,
        industry: patchBody.industry as string || prev.industry,
        segment: patchBody.segment as string || prev.segment,
        legalName: patchBody.legalName as string || prev.legalName,
        rut: patchBody.rut as string || prev.rut,
        legalRepresentativeName: patchBody.legalRepresentativeName as string || prev.legalRepresentativeName,
        legalRepresentativeRut: patchBody.legalRepresentativeRut as string || prev.legalRepresentativeRut,
      }));
      toast.success("Datos de la empresa actualizados desde la web.");
      router.refresh();
    } catch (error) {
      console.error(error);
      const detail = error instanceof Error ? error.message : "";
      toast.error(detail || "No se pudo traer datos de la empresa. Verifica que la URL sea correcta e intenta de nuevo.");
    } finally {
      setEnrichingCompanyInfo(false);
    }
  };

  const regenerateNotesWithAi = async () => {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/crm/accounts/${account.id}/regenerate-notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customInstruction: regenerateInstruction.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error);

      const newNotes = data.data?.notes;
      if (newNotes) {
        setAccount((prev) => ({ ...prev, notes: newNotes }));
        setAccountForm((prev) => ({ ...prev, notes: stripAccountLogoMarker(newNotes) }));
        toast.success("Descripción regenerada con IA.");
        router.refresh();
      }
    } catch (error) {
      console.error(error);
      toast.error("No se pudo regenerar la descripción.");
    } finally {
      setRegenerating(false);
    }
  };

  const openToggleAccountStatus = () => {
    setAccountStatusNextValue(!account.isActive);
    setAccountStatusConfirmOpen(true);
  };

  const openToggleAccountType = (nextType: "prospect" | "client") => {
    setAccountTypeNextValue(nextType);
    setAccountTypeConfirmOpen(true);
  };

  const confirmToggleAccountType = async () => {
    setUpdatingAccountType(true);
    try {
      const res = await fetch(`/api/crm/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: accountTypeNextValue }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error);

      setAccount((prev) => ({
        ...prev,
        type: data.data.type,
        isActive: data.data.isActive,
        status: data.data.status,
        installations: prev.installations.map((inst) => ({
          ...inst,
          status: data.data.type === "prospect" ? "prospect" : inst.status ?? "active",
        })),
      }));

      setAccountTypeConfirmOpen(false);
      toast.success(
        accountTypeNextValue === "client"
          ? "Cuenta convertida a cliente"
          : "Cuenta convertida a prospecto"
      );
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error("No se pudo cambiar el tipo de cuenta.");
    } finally {
      setUpdatingAccountType(false);
    }
  };

  const confirmToggleAccountStatus = async () => {
    setUpdatingAccountStatus(true);
    try {
      const res = await fetch(`/api/crm/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: accountStatusNextValue }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error);

      setAccount((prev) => ({
        ...prev,
        isActive: data.data.isActive,
        status: data.data.status,
        installations: prev.installations.map((inst) => ({
          ...inst,
          status: data.data.isActive ? inst.status ?? "active" : "inactive",
        })),
      }));
      setAccountStatusConfirmOpen(false);
      toast.success(data.data.isActive ? "Cuenta activada" : "Cuenta desactivada");
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error("No se pudo actualizar el estado de la cuenta.");
    } finally {
      setUpdatingAccountStatus(false);
    }
  };

  // ── Contact handlers ──
  const openContactEdit = (contact: ContactRow) => {
    setEditContact(contact);
    setEditForm({
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email || "",
      phone: contact.phone || "",
      roleTitle: contact.roleTitle || "",
      isPrimary: contact.isPrimary || false,
    });
  };

  const doSaveContact = async () => {
    if (!editContact) return;
    setSavingContact(true);
    try {
      const res = await fetch("/api/crm/contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editContact.id, ...editForm }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAccount((prev) => ({
        ...prev,
        contacts: prev.contacts.map((c) => (c.id === editContact.id ? { ...c, ...editForm } : c)),
      }));
      setEditContact(null);
      setPrimaryChangeConfirm(null);
      toast.success("Contacto actualizado");
    } catch {
      toast.error("No se pudo actualizar");
    } finally {
      setSavingContact(false);
    }
  };

  const saveContact = async () => {
    if (!editContact) return;
    if (editForm.isPrimary) {
      const otherPrimary = account.contacts.find((c) => c.id !== editContact.id && c.isPrimary);
      if (otherPrimary) {
        const otherName = [otherPrimary.firstName, otherPrimary.lastName].filter(Boolean).join(" ").trim() || "Otro contacto";
        setPrimaryChangeConfirm({ type: "edit", otherName });
        return;
      }
    }
    await doSaveContact();
  };

  const deleteContact = async (id: string) => {
    try {
      const res = await fetch(`/api/crm/contacts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setAccount((prev) => ({
        ...prev,
        contacts: prev.contacts.filter((c) => c.id !== id),
        _count: { ...prev._count, contacts: prev._count.contacts - 1 },
      }));
      setDeleteContactConfirm({ open: false, id: "" });
      toast.success("Contacto eliminado");
    } catch {
      toast.error("No se pudo eliminar");
    }
  };

  const doCreateContact = async () => {
    if (!newContactForm.firstName.trim() || !newContactForm.email.trim()) {
      toast.error("Nombre y email son obligatorios.");
      return;
    }
    setCreatingContact(true);
    try {
      const res = await fetch("/api/crm/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newContactForm, accountId: account.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);
      const newContact = data.data;
      setAccount((prev) => {
        const alreadyInList = prev.contacts.some((c) => c.id === newContact.id);
        return {
          ...prev,
          contacts: alreadyInList ? prev.contacts : [newContact, ...prev.contacts],
          _count: { ...prev._count, contacts: alreadyInList ? prev._count.contacts : prev._count.contacts + 1 },
        };
      });
      setNewContactOpen(false);
      setNewContactForm({ firstName: "", lastName: "", email: "", phone: "", roleTitle: "", isPrimary: false });
      setPrimaryChangeConfirm(null);
      toast.success("Contacto creado");
    } catch (err: any) {
      toast.error(err?.message || "No se pudo crear el contacto.");
    } finally {
      setCreatingContact(false);
    }
  };

  const createContact = async () => {
    if (!newContactForm.firstName.trim() || !newContactForm.email.trim()) {
      toast.error("Nombre y email son obligatorios.");
      return;
    }
    if (newContactForm.isPrimary) {
      const otherPrimary = account.contacts.find((c) => c.isPrimary);
      if (otherPrimary) {
        const otherName = [otherPrimary.firstName, otherPrimary.lastName].filter(Boolean).join(" ").trim() || "Otro contacto";
        setPrimaryChangeConfirm({ type: "new", otherName });
        return;
      }
    }
    await doCreateContact();
  };

  // ── Lifecycle badge ──
  const lifecycleBadge =
    lifecycle === "prospect"
      ? { label: "Prospecto", variant: "warning" as const }
      : lifecycle === "client_active"
        ? { label: "Cliente activo", variant: "success" as const }
        : { label: "Ex cliente", variant: "destructive" as const };

  // ── Quick contact actions (siempre visibles: Phone + WhatsApp).
  // Todo lo demás (Chat, Convertir, Activar/Desactivar) se movió a `headerActions`
  // para que en mobile se colapsen al menú "..." y no saturen el header.
  const primaryPhone = account.contacts.find(c => c.isPrimary)?.phone || account.contacts[0]?.phone;
  const hasPortalContacts = account.contacts.some(c => c.portalEnabled);
  const extraActions = primaryPhone ? (
    <div className="flex items-center gap-1.5">
      <a href={`tel:+56${primaryPhone}`} title="Llamar"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted transition-colors">
        <Phone className="h-4 w-4" />
      </a>
      <a href={`https://wa.me/56${primaryPhone}`} target="_blank" rel="noopener noreferrer" title="WhatsApp"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-status-ok-border bg-status-ok-soft text-status-ok-fg hover:brightness-110 transition-colors">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
      </a>
    </div>
  ) : undefined;

  // ── Tab state & definitions ──
  const { activeTab, setActiveTab } = useEntityTabs("general");
  const ContactsIcon = CRM_MODULES.contacts.icon;
  const DealsIcon = CRM_MODULES.deals.icon;
  const QuotesIcon = CRM_MODULES.quotes.icon;

  const ACTIVITY_SEEN_KEY = "opai-activity-seen-";
  const [unreadActivityCount, setUnreadActivityCount] = useState(() => {
    if (typeof window === "undefined") return activityEvents.length;
    const seen = localStorage.getItem(ACTIVITY_SEEN_KEY + account.id);
    const t = seen ? new Date(seen).getTime() : 0;
    return activityEvents.filter((e) => new Date(e.createdAt).getTime() > t).length;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = localStorage.getItem(ACTIVITY_SEEN_KEY + account.id);
    const t = seen ? new Date(seen).getTime() : 0;
    const count = activityEvents.filter((e) => new Date(e.createdAt).getTime() > t).length;
    setUnreadActivityCount(count);
  }, [account.id, activityEvents]);

  useEffect(() => {
    const handler = (e: CustomEvent<{ accountId?: string }>) => {
      if (e.detail?.accountId === account.id) setUnreadActivityCount(0);
    };
    window.addEventListener("opai-activity-seen", handler as EventListener);
    return () => window.removeEventListener("opai-activity-seen", handler as EventListener);
  }, [account.id]);

  const handleTabChange = useCallback(
    (tab: string) => {
      if (tab === "activity") {
        if (typeof window !== "undefined") {
          const latest = activityEvents.length
            ? Math.max(...activityEvents.map((e) => new Date(e.createdAt).getTime()))
            : Date.now();
          localStorage.setItem(ACTIVITY_SEEN_KEY + account.id, new Date(latest).toISOString());
        }
        setUnreadActivityCount(0);
      }
      setActiveTab(tab);
    },
    [account.id, activityEvents, setActiveTab]
  );

  const [fileCount, setFileCount] = useState(0);
  useEffect(() => {
    fetch(`/api/crm/files?entityType=account&entityId=${encodeURIComponent(account.id)}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setFileCount(d.data.length); })
      .catch(() => {});
  }, [account.id]);

  const tabs: EntityTab[] = [
    { id: "general", label: "General", icon: Info },
    { id: "communication", label: "Comunicación", icon: Mail },
    { id: "portal", label: "Portal", icon: Shield },
    { id: "contracts", label: "Contratos", icon: ScrollText },
    { id: "files", label: "Documentos", icon: FileText, count: fileCount },
    { id: "activity", label: "Actividad", icon: History, count: unreadActivityCount },
  ];

  const associatedSections: AssociatedSection[] = [
    {
      id: "contacts",
      label: "Contactos",
      icon: ContactsIcon,
      count: account.contacts.length,
      onAdd: () => setNewContactOpen(true),
      content: (
        <div className="space-y-3">
          {account.contacts.length === 0 ? (
            <EmptyState icon={<ContactsIcon className="h-8 w-8" />} title="Sin contactos" description="Esta cuenta no tiene contactos registrados." compact />
          ) : (
            <CrmRelatedRecordGrid className="!grid-cols-1">
              {account.contacts.map((contact) => (
                <CrmRelatedRecordCard
                  key={contact.id}
                  module="contacts"
                  title={`${contact.firstName} ${contact.lastName}`.trim()}
                  subtitle={contact.roleTitle || "Sin cargo"}
                  meta={[contact.email, contact.phone].filter(Boolean).join(" · ") || undefined}
                  badge={contact.isPrimary ? { label: "Principal", variant: "default" } : undefined}
                  href={`/crm/contacts/${contact.id}`}
                />
              ))}
            </CrmRelatedRecordGrid>
          )}
        </div>
      ),
    },
    {
      id: "installations",
      label: "Instalaciones",
      icon: MapPin,
      count: account.installations.length,
      onAdd: () => createInstallationRef.current?.open(),
      content: (
        <div className="space-y-3">
          <CrmInstallationsClient
            accountId={account.id}
            accountIsActive={account.isActive}
            initialInstallations={account.installations}
            createRef={createInstallationRef}
          />
        </div>
      ),
    },
    {
      id: "deals",
      label: "Negocios",
      icon: DealsIcon,
      count: account.deals.length,
      onAdd: () => setDealCreateOpen(true),
      content: (
        <div className="space-y-3">
          <CreateDealModal accountId={account.id} accountName={account.name} open={dealCreateOpen} onOpenChange={setDealCreateOpen} />
          {account.deals.length === 0 ? (
            <EmptyState icon={<DealsIcon className="h-8 w-8" />} title="Sin negocios" description="No hay negocios vinculados a esta cuenta." compact />
          ) : (
            <CrmRelatedRecordGrid className="!grid-cols-1">
              {account.deals.map((deal) => {
                const stageColor = (deal.stage as { color?: string | null } | undefined)?.color;
                const badge =
                  deal.status === "won"
                    ? { label: "Ganado", variant: "success" as const }
                    : deal.status === "lost"
                      ? { label: "Perdido", variant: "destructive" as const }
                      : deal.stage?.name
                        ? { label: deal.stage.name, color: stageColor || undefined }
                        : undefined;
                return (
                  <CrmRelatedRecordCard
                    key={deal.id}
                    module="deals"
                    title={deal.title}
                    meta={`$${Number(deal.amount).toLocaleString("es-CL")}`}
                    badge={badge}
                    href={`/crm/deals/${deal.id}`}
                  />
                );
              })}
            </CrmRelatedRecordGrid>
          )}
        </div>
      ),
    },
    {
      id: "quotes",
      label: "Cotizaciones",
      icon: QuotesIcon,
      count: quotes.length,
      onAdd: () => setQuoteCreateOpen(true),
      content: (
        <div className="space-y-3">
          <CreateQuoteModal defaultClientName={account.name} accountId={account.id} open={quoteCreateOpen} onOpenChange={setQuoteCreateOpen} />
          {quotes.length === 0 ? (
            <EmptyState icon={<QuotesIcon className="h-8 w-8" />} title="Sin cotizaciones" description="No hay cotizaciones vinculadas a esta cuenta." compact />
          ) : (
            <CrmRelatedRecordGrid className="!grid-cols-1">
              {quotes.map((q) => {
                const statusMeta = getQuoteStatus(q.status);
                const createdLabel = q.createdAt
                  ? `Creada: ${new Intl.DateTimeFormat("es-CL", { dateStyle: "short" }).format(new Date(q.createdAt))}`
                  : undefined;
                const quoteName = q.name?.trim();
                const title = quoteName || q.code;
                const subtitle = [quoteName ? q.code : null, createdLabel].filter(Boolean).join(" · ");
                return (
                  <CrmRelatedRecordCard
                    key={q.id}
                    module="quotes"
                    title={title}
                    subtitle={subtitle || undefined}
                    meta={formatCLP(q.monthlyCost)}
                    badge={{ label: statusMeta.label, color: statusMeta.color }}
                    href={`/crm/cotizaciones/${q.id}`}
                  />
                );
              })}
            </CrmRelatedRecordGrid>
          )}
        </div>
      ),
    },
    {
      id: "tickets",
      label: "Tickets",
      icon: TicketIcon,
      onAdd: () => router.push(`/ops/tickets?createForAccountId=${account.id}`),
      content: <AssociatedTicketsSection filterKey="accountId" filterValue={account.id} />,
    },
    {
      id: "rendiciones",
      label: "Rendiciones",
      icon: Receipt,
      content: (
        <AccountExpensesSection
          accountId={account.id}
          installationIds={account.installations?.map((i) => i.id) || []}
        />
      ),
    },
    {
      id: "encuestas",
      label: "Encuestas Cliente",
      icon: ClipboardList,
      count: account.encuestasCliente?.length ?? 0,
      content: (
        <div className="space-y-2">
          {account.encuestasCliente && account.encuestasCliente.length > 0 ? (
            account.encuestasCliente.map((enc) => (
              <Link
                key={enc.id}
                href={`/ops/supervision/${enc.visitId}`}
                className="flex items-center justify-between rounded-lg border p-3 text-sm hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{enc.contactName}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" }).format(new Date(enc.createdAt))}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-2">
                  {enc.averageScore !== null && (
                    <span className={`text-sm font-medium ${
                      enc.averageScore >= 4 ? "text-status-ok-fg" : enc.averageScore >= 3 ? "text-status-warn-fg" : "text-status-danger-fg"
                    }`}>
                      {enc.averageScore.toFixed(1)}/5
                    </span>
                  )}
                  {enc.npsScore !== null && (
                    <span className="text-xs text-muted-foreground">
                      NPS: {enc.npsScore}
                    </span>
                  )}
                </div>
              </Link>
            ))
          ) : (
            <EmptyState
              icon={<ClipboardList className="h-8 w-8" />}
              title="Sin encuestas"
              description="No hay encuestas de cliente registradas."
              compact
            />
          )}
        </div>
      ),
    },
  ];

  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [onboardingTarget, setOnboardingTarget] = useState<
    { dealId: string; defaultPlaybookId?: string } | null
  >(null);

  const wonDeals = account.deals.filter((d) => d.status === "won");

  const openOnboardingForDeal = async (dealId: string) => {
    try {
      const res = await fetch(`/api/onboarding/by-deal?dealId=${dealId}`);
      const json = await res.json();
      if (!res.ok || !json?.success) {
        toast.error("No se pudo cargar el onboarding");
        return;
      }
      if (json.data.exists) {
        router.push(
          `/crm/accounts/${json.data.onboarding.accountId}/onboarding/${json.data.onboarding.id}`,
        );
      } else {
        setOnboardingTarget({ dealId, defaultPlaybookId: json.data.defaultPlaybookId });
      }
    } catch {
      toast.error("No se pudo cargar el onboarding");
    }
  };

  const onboardingActions: EntityHeaderAction[] =
    wonDeals.length === 0
      ? []
      : wonDeals.length === 1
        ? [
            {
              label: "Onboarding del cliente",
              icon: ListChecks,
              onClick: () => openOnboardingForDeal(wonDeals[0].id),
            },
          ]
        : wonDeals.map((d) => ({
            label: `Onboarding · ${d.title}`,
            icon: ListChecks,
            onClick: () => openOnboardingForDeal(d.id),
          }));

  const headerActions: EntityHeaderAction[] = [
    { label: "Editar cuenta", icon: Pencil, onClick: openAccountEdit, primary: true },
    ...onboardingActions,
    {
      label: !hasPortalContacts ? "Chat (sin contactos con portal)" : "Iniciar chat externo",
      icon: MessageCircle,
      onClick: () => { if (hasPortalContacts) setChatModalOpen(true); },
      hidden: !hasPortalContacts,
    },
    {
      label: "Convertir a cliente",
      icon: UserCheck,
      onClick: () => openToggleAccountType("client"),
      hidden: lifecycle !== "prospect",
    },
    {
      label: account.isActive ? "Desactivar cuenta" : "Activar cuenta",
      icon: Power,
      onClick: openToggleAccountStatus,
      hidden: lifecycle === "prospect",
    },
    { label: "Buscar duplicados", icon: GitMerge, onClick: () => setDuplicateModalOpen(true) },
    { label: "Eliminar cuenta", icon: Trash2, onClick: () => setDeleteAccountConfirm(true), variant: "destructive" },
  ];

  // ── Tab content: General ──
  const generalContent = (
    <div className="space-y-3 sm:space-y-4">
      {/* ── Hero: identidad clave (Tipo + Estado + Razón social + dirección) ── */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={lifecycle !== "prospect" ? "border-status-ok-border text-status-ok-fg" : "border-status-warn-border text-status-warn-fg"}
          >
            {lifecycle === "prospect" ? "Prospecto" : "Cliente"}
          </Badge>
          <Badge
            variant="outline"
            className={lifecycle === "client_active" ? "border-status-ok-border text-status-ok-fg" : "border-status-danger-border text-status-danger-fg"}
          >
            <span
              className={`mr-1 inline-flex h-1.5 w-1.5 rounded-full ${
                lifecycle === "client_active" ? "bg-status-ok" : "bg-status-danger"
              }`}
            />
            {lifecycle === "client_active" ? "Activa" : lifecycle === "client_inactive" ? "Ex cliente" : "Inactiva"}
          </Badge>
          {account.website && (
            <a
              href={account.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 truncate rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-muted/50"
            >
              <span className="truncate max-w-[180px] sm:max-w-xs">{account.website.replace(/^https?:\/\//, "")}</span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          )}
        </div>
        {account.legalName && (
          <p className="mt-2 truncate text-sm text-muted-foreground">{account.legalName}</p>
        )}
        {account.address && (
          <div className="mt-3 flex items-start gap-2 border-t border-border/50 pt-3">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="break-words text-[14px] leading-snug text-foreground">{account.address}</p>
              {(account.commune || account.city) && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {[account.commune, account.city].filter(Boolean).join(", ")}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bloque "Datos para facturación SII" — siempre visible para que el
          operador vea de un vistazo qué datos del receptor se autocompletarán
          al emitir un DTE para esta cuenta. Si algún campo está vacío,
          muestra "Sin cargar" con un hint para editar.

          Incluye un botón "Consultar SII" que pega al endpoint oficial de
          SimpleAPI (rut.simpleapi.cl/v2/{rut}) y trae los datos públicos
          del contribuyente: razón social, giros, domicilios, email DTE.
          El operador ve un preview con diff y elige qué campos aplicar. */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-2 border-b border-border/50 px-4 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
            Datos para facturación SII
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={lookupRutFromSii}
              disabled={!account.rut || siiLookup.loading}
              className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
              title={
                account.rut
                  ? "Consultar datos oficiales del contribuyente al SII"
                  : "Necesitás cargar el RUT primero"
              }
            >
              {siiLookup.loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              {siiLookup.loading ? "Consultando SII…" : "Consultar SII"}
            </button>
            <button
              type="button"
              onClick={openAccountEdit}
              className="text-[11px] font-medium text-primary hover:underline"
            >
              Editar
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-x-4 gap-y-2 p-4 sm:grid-cols-2">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
              Giro / Actividad económica
            </div>
            <div className="break-words text-[13px] leading-snug text-foreground">
              {account.giro || (
                <span className="italic text-muted-foreground/70">
                  Sin cargar — requerido por SII al facturar
                </span>
              )}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
              Dirección
            </div>
            <div className="break-words text-[13px] leading-snug text-foreground">
              {account.address || <span className="italic text-muted-foreground/70">Sin cargar</span>}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
              Comuna
            </div>
            <div className="break-words text-[13px] leading-snug text-foreground">
              {account.commune || <span className="italic text-muted-foreground/70">Sin cargar</span>}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
              Ciudad
            </div>
            <div className="break-words text-[13px] leading-snug text-foreground">
              {account.city || (
                <span className="italic text-muted-foreground/70">
                  Sin cargar — SII pide ambas (comuna + ciudad)
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats strip: datos clave (2 col mobile, 4 desktop) ── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <div className="min-w-0 rounded-xl border border-border bg-card p-3 sm:p-4">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">RUT</div>
          <div className="truncate font-mono text-[13px] font-medium tabular-nums text-foreground">
            {account.rut || <span className="font-sans text-muted-foreground/70">—</span>}
          </div>
        </div>
        <div className="min-w-0 rounded-xl border border-border bg-card p-3 sm:p-4">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">Industria</div>
          <div className="truncate text-[13px] font-medium text-foreground">
            {account.industry || <span className="text-muted-foreground/70">—</span>}
          </div>
        </div>
        <div className="min-w-0 rounded-xl border border-border bg-card p-3 sm:p-4">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">Segmento</div>
          <div className="truncate text-[13px] font-medium text-foreground">
            {account.segment || <span className="text-muted-foreground/70">—</span>}
          </div>
        </div>
        <div className="min-w-0 rounded-xl border border-border bg-card p-3 sm:p-4">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">Vigencia</div>
          <div className="truncate text-[13px] font-medium text-foreground">
            {account.startDate
              ? new Intl.DateTimeFormat("es-CL", { year: "numeric", month: "short" }).format(new Date(account.startDate))
              : <span className="text-muted-foreground/70">—</span>}
            {account.endDate && (
              <> → {new Intl.DateTimeFormat("es-CL", { year: "numeric", month: "short" }).format(new Date(account.endDate))}</>
            )}
          </div>
        </div>
      </div>

      {/* ── Representación legal (colapsable) ── */}
      {(() => {
        // Build the canonical list of representatives. Prefer relational rows
        // (edited in Portal Cliente). Fall back to legacy flat columns only if
        // no relational rows exist (back-compat with old accounts).
        const relationalReps = account.representantesLegales ?? [];
        const legacyRep =
          relationalReps.length === 0 &&
          (account.legalRepresentativeName || account.legalRepresentativeRut)
            ? {
                id: "__legacy__",
                nombre: account.legalRepresentativeName || "",
                rut: account.legalRepresentativeRut || "",
                email: null as string | null,
              }
            : null;
        const legalReps = relationalReps.length > 0 ? relationalReps : legacyRep ? [legacyRep] : [];

        const hasPersoneria = Boolean(
          account.notaryName ||
            account.personeria?.notaria ||
            account.notaryDate ||
            account.personeria?.fechaEscritura,
        );

        if (legalReps.length === 0 && !hasPersoneria) return null;

        return (
          <details className="group rounded-xl border border-border bg-card">
            <summary className="flex cursor-pointer list-none select-none items-center justify-between px-4 py-3 transition-colors hover:bg-muted/20">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Representación legal
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-4 px-4 pb-4 pt-1">
              {hasPersoneria && (
                <div className="space-y-2">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
                    Personería
                  </div>
                  <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                    <DetailField
                      label="Notaría"
                      value={account.notaryName || account.personeria?.notaria || null}
                    />
                    <DetailField
                      label="Fecha escritura"
                      value={
                        account.notaryDate ||
                        (account.personeria?.fechaEscritura
                          ? account.personeria.fechaEscritura.slice(0, 10)
                          : null)
                      }
                    />
                  </div>
                </div>
              )}

              {legalReps.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
                    {legalReps.length === 1 ? "Representante legal" : "Representantes legales"}
                  </div>
                  <div className="space-y-2">
                    {legalReps.map((rep, idx) => (
                      <div
                        key={rep.id}
                        className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2"
                      >
                        {legalReps.length > 1 && (
                          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
                            Representante {idx + 1}
                          </div>
                        )}
                        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                          <DetailField label="Nombre" value={rep.nombre || null} />
                          <DetailField label="RUT" value={rep.rut || null} mono copyable />
                          <DetailField label="Email" value={rep.email || null} mono copyable />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </details>
        );
      })()}

      {/* ── Documento de Cobro (colapsable) ── */}
      <AccountBillingDocSection
        accountId={account.id}
        initialNumeroOrdenContrato={account.numeroOrdenContrato ?? null}
        initialContactoEstadoPagoId={account.contactoEstadoPagoId ?? null}
        initialLayoutDocumentoCobro={
          account.layoutDocumentoCobro ?? "DTE_PREVIEW"
        }
        contacts={account.contacts.map((c) => ({
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email ?? null,
          roleTitle: c.roleTitle ?? null,
        }))}
        onSaved={(next) =>
          setAccount((prev) => ({
            ...prev,
            numeroOrdenContrato: next.numeroOrdenContrato,
            contactoEstadoPagoId: next.contactoEstadoPagoId,
            layoutDocumentoCobro: next.layoutDocumentoCobro,
          }))
        }
      />

      {/* ── Metadata (colapsable) ── */}
      <details className="group rounded-xl border border-border bg-card">
        <summary className="flex cursor-pointer list-none select-none items-center justify-between px-4 py-3 transition-colors hover:bg-muted/20">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Detalles técnicos
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 px-4 pb-4 pt-1 sm:grid-cols-2">
          <DetailField
            label="Fecha creación"
            value={
              account.createdAt
                ? new Date(account.createdAt).toLocaleString("es-CL", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                : "—"
            }
          />
          <DetailField
            label="Última modificación"
            value={
              account.updatedAt
                ? new Date(account.updatedAt).toLocaleString("es-CL", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                : "—"
            }
          />
        </div>
      </details>

      {/* ── Portal del cliente (PIN visible en General) ── */}
      <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Portal del cliente</span>
          </div>
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setActiveTab("portal")}>
            Gestionar accesos
          </Button>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Cada contacto ingresa con su <strong className="text-foreground/90 font-medium">correo</strong> y su{" "}
          <strong className="text-foreground/90 font-medium">PIN</strong> en{" "}
          <span className="font-mono text-foreground/80">/portal/cliente</span>.
        </p>
        {account.contacts.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin contactos. Agrega uno para poder habilitar el portal.</p>
        ) : (
          <ul className="space-y-2">
            {account.contacts.map((c) => {
              const pin = c.portalPinVisible?.trim();
              const label = [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || "Sin nombre";
              return (
                <li
                  key={c.id}
                  className="flex flex-col gap-1 rounded-md border border-border/60 bg-background/50 px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4"
                >
                  <span className="text-sm font-medium min-w-0">{label}</span>
                  {c.email ? (
                    <span className="text-xs text-muted-foreground truncate min-w-0">{c.email}</span>
                  ) : (
                    <span className="text-xs text-status-warn-fg/90">Sin email — necesario para el portal</span>
                  )}
                  <span className="text-sm font-mono tabular-nums sm:ml-auto">
                    {pin ? <>PIN: {pin}</> : <span className="text-muted-foreground font-sans text-xs">Sin PIN</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Información empresa (web + IA) ── */}
      <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {accountLogoUrl && (
              <img
                src={accountLogoUrl}
                alt={`Logo ${account.name}`}
                className="h-8 w-8 rounded-md border border-border bg-background object-contain shrink-0"
              />
            )}
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Información de la empresa</span>
          </div>
          <div className="flex items-center gap-1.5">
            {!account.website && (
              <Input
                value={enrichWebsiteInput}
                onChange={(e) => setEnrichWebsiteInput(e.target.value)}
                placeholder="https://www.empresa.cl"
                className={`h-7 text-xs w-44 ${inputCn}`}
              />
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={enrichCompanyInfoFromWebsite}
              disabled={enrichingCompanyInfo || !(account.website || enrichWebsiteInput)?.trim()}
            >
              {enrichingCompanyInfo && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
              Traer datos
            </Button>
          </div>
        </div>
        {stripAccountLogoMarker(account.notes) ? (
          <p className="text-xs text-muted-foreground leading-relaxed">
            {stripAccountLogoMarker(account.notes)}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground/60 italic">Sin descripción. Usa &quot;Traer datos&quot; para obtener información automáticamente.</p>
        )}
        <div className="flex items-center gap-2">
          <Input
            value={regenerateInstruction}
            onChange={(e) => setRegenerateInstruction(e.target.value)}
            placeholder="Instrucción para IA (opcional)..."
            className={`h-7 text-xs flex-1 ${inputCn}`}
          />
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={regenerateNotesWithAi} disabled={regenerating}>
            {regenerating && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
            <Sparkles className="mr-1 h-3 w-3" />
            Regenerar
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <input
        ref={logoInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={handleLogoUpload}
      />
      <EntityDetailLayout
        breadcrumb={["CRM", "Cuentas", account.name]}
        breadcrumbHrefs={["/crm", "/crm/accounts"]}
        header={{
          avatar: {
            initials: account.name.charAt(0).toUpperCase(),
            photoUrl: accountLogoUrl,
          },
          title: account.name,
          status: lifecycleBadge,
          actions: headerActions,
          extra: extraActions,
        }}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onAvatarClick={() => logoInputRef.current?.click()}
        rightPanel={<AssociatedRecordsPanel sections={associatedSections} />}
      >
        {activeTab === "general" && (
          <div className="space-y-3">
            {(account.status === "client_active" ||
              account.deals.some((d) => d.status === "won")) && (
              <OnboardingAccountBanner accountId={account.id} />
            )}
            {generalContent}
          </div>
        )}

        {activeTab === "communication" && <EmailHistoryList accountId={account.id} compact />}
        {activeTab === "activity" && (
          <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
            <CrmActivityTimeline events={activityEvents} />
          </div>
        )}

        {activeTab === "portal" && (
          <AccountPortalSection
            accountId={account.id}
            contacts={account.contacts.map(c => ({ ...c, email: c.email ?? null, phone: c.phone ?? null, isPrimary: c.isPrimary ?? false }))}
            accountStatus={account.status ?? (account.isActive ? "client_active" : "prospect")}
            accountIsActive={account.isActive}
            onRefresh={() => router.refresh()}
          />
        )}

        {activeTab === "contracts" && (
          <AccountContractsSection
            accountId={account.id}
            accountName={account.name}
            accountRut={account.rut ?? null}
            accountLegalName={account.legalName ?? null}
            accountGiro={account.giro ?? null}
            accountAddress={account.address ?? null}
            accountCommune={account.commune ?? null}
            accountCity={account.city ?? null}
            accountEmail={
              account.contacts?.find((c) => c.isPrimary && c.email)?.email ??
              account.contacts?.find((c) => c.email)?.email ??
              null
            }
            onRefresh={() => router.refresh()}
          />
        )}

        {activeTab === "files" && <FileAttachments entityType="account" entityId={account.id} title="Documentos" />}
      </EntityDetailLayout>

      {/* ── Onboarding Cliente Modal ── */}
      {onboardingTarget ? (
        <OnboardingClientModal
          open
          dealId={onboardingTarget.dealId}
          defaultPlaybookId={onboardingTarget.defaultPlaybookId}
          onClose={() => setOnboardingTarget(null)}
          onCreated={() => {
            setOnboardingTarget(null);
            router.refresh();
          }}
        />
      ) : null}

      {/* ── Duplicate Account Modal ── */}
      <DuplicateAccountModal
        open={duplicateModalOpen}
        onOpenChange={setDuplicateModalOpen}
        initialQuery={account.name}
        onMerged={() => router.refresh()}
      />

      {/* ── New External Chat Modal ── */}
      <NewExternalChatModal
        open={chatModalOpen}
        defaultStatus={
          account.status === "prospect" || account.status === "client_active"
            ? account.status
            : undefined
        }
        onClose={() => setChatModalOpen(false)}
        onCreated={async (channelId) => {
          setChatModalOpen(false);
          await chatCtx.refreshChannels?.();
          chatCtx.openPanel();
          chatCtx.selectChannel(channelId);
        }}
      />

      {/* ── Account Edit Modal ── */}
      <Dialog open={editAccountOpen} onOpenChange={setEditAccountOpen}>
        <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Editar cuenta</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Nombre *</Label>
              <Input value={accountForm.name} onChange={(e) => setAccountForm((p) => ({ ...p, name: e.target.value }))} className={inputCn} />
            </div>
            <div className="space-y-1.5">
              <Label>RUT</Label>
              <Input value={accountForm.rut} onChange={(e) => setAccountForm((p) => ({ ...p, rut: e.target.value }))} className={inputCn} placeholder="76.123.456-7" />
            </div>
            <div className="space-y-1.5">
              <Label>Razón social</Label>
              <Input
                value={accountForm.legalName}
                onChange={(e) => setAccountForm((p) => ({ ...p, legalName: e.target.value }))}
                className={inputCn}
                placeholder="Empresa SpA / Ltda / S.A."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Representante legal</Label>
              <Input
                value={accountForm.legalRepresentativeName}
                onChange={(e) =>
                  setAccountForm((p) => ({ ...p, legalRepresentativeName: e.target.value }))
                }
                className={inputCn}
                placeholder="Nombre completo"
              />
            </div>
            <div className="space-y-1.5">
              <Label>RUT representante legal</Label>
              <Input
                value={accountForm.legalRepresentativeRut}
                onChange={(e) =>
                  setAccountForm((p) => ({ ...p, legalRepresentativeRut: e.target.value }))
                }
                className={inputCn}
                placeholder="12.345.678-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Notaría (personería)</Label>
              <Input
                value={accountForm.notaryName}
                onChange={(e) => setAccountForm((p) => ({ ...p, notaryName: e.target.value }))}
                className={inputCn}
                placeholder="Ej: Notaría de Santiago, Notario Juan Pérez"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha escritura pública</Label>
              <Input
                value={accountForm.notaryDate}
                onChange={(e) => setAccountForm((p) => ({ ...p, notaryDate: e.target.value }))}
                className={inputCn}
                placeholder="Ej: 15 de marzo de 2024"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Industria</Label>
              <Input value={accountForm.industry} onChange={(e) => setAccountForm((p) => ({ ...p, industry: e.target.value }))} className={inputCn} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>
                Giro / Actividad económica{" "}
                <span className="text-[11px] font-normal text-muted-foreground ml-1">
                  (texto formal SII)
                </span>
              </Label>
              <Input
                value={accountForm.giro}
                onChange={(e) =>
                  setAccountForm((p) => ({ ...p, giro: e.target.value }))
                }
                className={inputCn}
                placeholder="Ej: Servicios de seguridad y vigilancia"
              />
              <p className="text-[11px] text-muted-foreground">
                Se autocompleta como receptor cuando facturas a este cliente.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Segmento</Label>
              <Input value={accountForm.segment} onChange={(e) => setAccountForm((p) => ({ ...p, segment: e.target.value }))} className={inputCn} placeholder="Corporativo, PYME..." />
            </div>
            <div className="space-y-1.5">
              <Label>Sitio web</Label>
              <Input value={accountForm.website} onChange={(e) => setAccountForm((p) => ({ ...p, website: e.target.value }))} className={inputCn} placeholder="https://..." />
            </div>
            <div className="space-y-1.5">
              <Label>Dirección</Label>
              <Input value={accountForm.address} onChange={(e) => setAccountForm((p) => ({ ...p, address: e.target.value }))} className={inputCn} />
            </div>
            <div className="space-y-1.5">
              <Label>Comuna</Label>
              <Input value={accountForm.commune} onChange={(e) => setAccountForm((p) => ({ ...p, commune: e.target.value }))} className={inputCn} placeholder="Lo Barnechea, Providencia..." />
            </div>
            <div className="space-y-1.5">
              <Label>
                Ciudad{" "}
                <span className="text-[11px] font-normal text-muted-foreground ml-1">
                  (SII pide ambas)
                </span>
              </Label>
              <Input
                value={accountForm.city}
                onChange={(e) =>
                  setAccountForm((p) => ({ ...p, city: e.target.value }))
                }
                className={inputCn}
                placeholder="Santiago, Concepción..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha inicio</Label>
              <Input type="date" value={accountForm.startDate} onChange={(e) => setAccountForm((p) => ({ ...p, startDate: e.target.value }))} className={inputCn} />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha término</Label>
              <Input type="date" value={accountForm.endDate} onChange={(e) => setAccountForm((p) => ({ ...p, endDate: e.target.value }))} className={inputCn} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Notas</Label>
              <textarea
                value={accountForm.notes}
                onChange={(e) => setAccountForm((p) => ({ ...p, notes: e.target.value }))}
                className={`min-h-[80px] w-full rounded-md border px-3 py-2 text-sm ${inputCn}`}
                placeholder="Notas sobre esta cuenta..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditAccountOpen(false)}>Cancelar</Button>
            <Button onClick={saveAccount} disabled={savingAccount}>
              {savingAccount && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── SII Lookup Preview Modal ──
          Se abre cuando el lookup vía /api/crm/accounts/[id]/lookup-rut
          retorna OK. Muestra una tabla con 5 campos clave (razón social,
          giro, dirección, comuna, ciudad) comparando lo que tiene OPAI
          vs. lo que devolvió el SII, con un checkbox por campo para
          aplicar selectivamente. Operaciones idempotentes: el operador
          puede volver a consultar después de aplicar y el diff queda
          vacío si todo coincide. */}
      <Dialog
        open={!!siiLookup.data}
        onOpenChange={(v) => !v && setSiiLookup({ loading: false, data: null })}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Datos oficiales del SII para {siiLookup.data?.rut}
            </DialogTitle>
          </DialogHeader>

          {siiLookup.data && (
            <div className="space-y-4 py-2">
              <p className="text-xs text-muted-foreground">
                Estos datos vienen del Servicio de Impuestos Internos vía
                SimpleAPI. Tildá los campos que querés aplicar a la cuenta.
                Los que no se tildan quedan como están.
              </p>

              {(["legalName", "giro", "address", "commune", "city"] as const).map((field) => {
                const labels: Record<typeof field, string> = {
                  legalName: "Razón social",
                  giro: "Giro / Actividad económica",
                  address: "Dirección",
                  commune: "Comuna",
                  city: "Ciudad",
                };
                const d = siiLookup.data!.diff[field];
                if (!d) return null;
                const hasChange = d.changes;
                const applyEntry = siiLookup.data!.apply[field] ?? { enabled: false, value: "" };
                const enabled = applyEntry.enabled;
                return (
                  <div
                    key={field}
                    className={cn(
                      "rounded-md border p-3",
                      hasChange
                        ? "border-status-warn-border bg-status-warn-soft/40"
                        : "border-ds-border-default bg-ds-surface-2",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        id={`apply-${field}`}
                        checked={enabled}
                        disabled={applyingSii}
                        onChange={(e) =>
                          setSiiLookup((prev) =>
                            prev.data
                              ? {
                                  ...prev,
                                  data: {
                                    ...prev.data,
                                    apply: {
                                      ...prev.data.apply,
                                      [field]: {
                                        ...(prev.data.apply[field] ?? { value: d.sii ?? "" }),
                                        enabled: e.target.checked,
                                      },
                                    },
                                  },
                                }
                              : prev,
                          )
                        }
                        className="mt-1 h-4 w-4 rounded border-input cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <label
                          htmlFor={`apply-${field}`}
                          className="text-sm font-medium cursor-pointer"
                        >
                          {labels[field]}{" "}
                          {hasChange ? (
                            <span className="text-[11px] font-normal text-status-warn-fg">
                              · cambia
                            </span>
                          ) : d.sii ? (
                            <span className="text-[11px] font-normal text-muted-foreground">
                              · igual
                            </span>
                          ) : (
                            <span className="text-[11px] font-normal text-muted-foreground">
                              · sin dato en SII
                            </span>
                          )}
                        </label>
                        <div className="mt-1 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
                          <div className="min-w-0">
                            <span className="text-muted-foreground">Actual: </span>
                            <span className="break-words">
                              {d.current || (
                                <span className="italic text-muted-foreground/70">vacío</span>
                              )}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <span className="text-muted-foreground">SII: </span>
                            <span className="break-words font-medium">
                              {d.sii || (
                                <span className="italic text-muted-foreground/70">vacío</span>
                              )}
                            </span>
                          </div>
                        </div>
                        {enabled && (
                          <div className="mt-2 space-y-1">
                            <Label
                              htmlFor={`value-${field}`}
                              className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground"
                            >
                              Valor a guardar
                            </Label>
                            <Input
                              id={`value-${field}`}
                              value={applyEntry.value}
                              disabled={applyingSii}
                              onChange={(e) =>
                                setSiiLookup((prev) =>
                                  prev.data
                                    ? {
                                        ...prev,
                                        data: {
                                          ...prev.data,
                                          apply: {
                                            ...prev.data.apply,
                                            [field]: {
                                              ...(prev.data.apply[field] ?? { enabled: true }),
                                              value: e.target.value,
                                            },
                                          },
                                        },
                                      }
                                    : prev,
                                )
                              }
                              placeholder={
                                d.sii ?? `Escribí la ${labels[field].toLowerCase()} manualmente`
                              }
                              className="h-9 text-sm"
                              maxLength={field === "address" ? 200 : 80}
                              autoComplete="off"
                            />
                            <p className="text-[11px] text-muted-foreground">
                              {d.sii
                                ? "Podés editar el valor antes de aplicarlo. Si lo vacías, se borra el dato actual."
                                : "El SII no devolvió este dato — escribilo a mano si lo querés guardar."}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Domicilios y actividades alternativas — solo informativo
                  (el SII publica más de uno cuando aplica). */}
              {siiLookup.data.rawSii.actividadesEconomicas.length > 1 && (
                <div className="rounded-md border border-ds-border-default bg-ds-surface-2 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80 mb-1.5">
                    Otras actividades económicas registradas
                  </p>
                  <ul className="space-y-1 text-xs">
                    {siiLookup.data.rawSii.actividadesEconomicas.slice(1).map((a) => (
                      <li key={a.codigo} className="flex gap-2">
                        <span className="font-mono text-muted-foreground shrink-0">
                          {a.codigo}
                        </span>
                        <span>{a.descripcion}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {siiLookup.data.rawSii.domicilios.length > 1 && (
                <div className="rounded-md border border-ds-border-default bg-ds-surface-2 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80 mb-1.5">
                    Otros domicilios registrados
                  </p>
                  <ul className="space-y-1 text-xs">
                    {siiLookup.data.rawSii.domicilios.slice(1).map((d, i) => (
                      <li key={i}>
                        {d.direccion}
                        {d.comuna && ` — ${d.comuna}`}
                        {d.ciudad && `, ${d.ciudad}`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSiiLookup({ loading: false, data: null })}
              disabled={applyingSii}
            >
              Cerrar
            </Button>
            <Button
              onClick={applySiiData}
              disabled={
                applyingSii ||
                !siiLookup.data ||
                !Object.values(siiLookup.data.apply).some((v) => v?.enabled)
              }
            >
              {applyingSii && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Aplicar a la cuenta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Contact Edit Modal ── */}
      <Dialog open={!!editContact} onOpenChange={(v) => !v && setEditContact(null)}>
        <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Editar contacto</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nombre *</Label>
              <Input value={editForm.firstName} onChange={(e) => setEditForm((p) => ({ ...p, firstName: e.target.value }))} className={inputCn} />
            </div>
            <div className="space-y-1.5">
              <Label>Apellido *</Label>
              <Input value={editForm.lastName} onChange={(e) => setEditForm((p) => ({ ...p, lastName: e.target.value }))} className={inputCn} />
            </div>
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input value={editForm.email} onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))} className={inputCn} />
            </div>
            <div className="space-y-1.5">
              <Label>Teléfono</Label>
              <Input value={editForm.phone} onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))} className={inputCn} />
            </div>
            <div className="space-y-1.5">
              <Label>Cargo</Label>
              <Input value={editForm.roleTitle} onChange={(e) => setEditForm((p) => ({ ...p, roleTitle: e.target.value }))} className={inputCn} />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editForm.isPrimary} onChange={(e) => setEditForm((p) => ({ ...p, isPrimary: e.target.checked }))} />
                Principal
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditContact(null)}>Cancelar</Button>
            <Button onClick={saveContact} disabled={savingContact}>
              {savingContact && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── New Contact Modal ── */}
      <Dialog open={newContactOpen} onOpenChange={setNewContactOpen}>
        <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Nuevo contacto</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nombre *</Label>
              <Input value={newContactForm.firstName} onChange={(e) => setNewContactForm((p) => ({ ...p, firstName: e.target.value }))} className={inputCn} placeholder="Nombre" />
            </div>
            <div className="space-y-1.5">
              <Label>Apellido</Label>
              <Input value={newContactForm.lastName} onChange={(e) => setNewContactForm((p) => ({ ...p, lastName: e.target.value }))} className={inputCn} placeholder="Apellido" />
            </div>
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input value={newContactForm.email} onChange={(e) => setNewContactForm((p) => ({ ...p, email: e.target.value }))} className={inputCn} placeholder="correo@empresa.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Teléfono</Label>
              <Input value={newContactForm.phone} onChange={(e) => setNewContactForm((p) => ({ ...p, phone: e.target.value }))} className={inputCn} placeholder="+56 9 1234 5678" />
            </div>
            <div className="space-y-1.5">
              <Label>Cargo</Label>
              <Input value={newContactForm.roleTitle} onChange={(e) => setNewContactForm((p) => ({ ...p, roleTitle: e.target.value }))} className={inputCn} placeholder="Gerente, jefe..." />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={newContactForm.isPrimary} onChange={(e) => setNewContactForm((p) => ({ ...p, isPrimary: e.target.checked }))} />
                Contacto principal
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewContactOpen(false)}>Cancelar</Button>
            <Button onClick={createContact} disabled={creatingContact}>
              {creatingContact && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Crear contacto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirm Dialogs ── */}
      <ConfirmDialog
        open={deleteAccountConfirm}
        onOpenChange={setDeleteAccountConfirm}
        title="Eliminar cuenta"
        description="Se eliminarán también contactos, negocios e instalaciones asociados. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={deleteAccount}
      />
      <ConfirmDialog
        open={accountStatusConfirmOpen}
        onOpenChange={setAccountStatusConfirmOpen}
        title={accountStatusNextValue ? "Activar cuenta" : "Desactivar cuenta"}
        description={
          accountStatusNextValue
            ? "La cuenta quedará como cliente activo y podrás operar instalaciones."
            : "La cuenta quedará como cliente inactivo (ex cliente) y se desactivarán sus instalaciones activas."
        }
        confirmLabel={accountStatusNextValue ? "Activar" : "Desactivar"}
        variant="default"
        onConfirm={confirmToggleAccountStatus}
      />
      <ConfirmDialog
        open={accountTypeConfirmOpen}
        onOpenChange={setAccountTypeConfirmOpen}
        title={accountTypeNextValue === "client" ? "Convertir a cliente" : "Convertir a prospecto"}
        description={
          accountTypeNextValue === "client"
            ? "La cuenta quedará marcada como cliente inactivo. Luego puedes activarla cuando corresponda."
            : "La cuenta quedará como prospecto inactivo y se desactivarán sus instalaciones activas."
        }
        confirmLabel={accountTypeNextValue === "client" ? "Convertir" : "Confirmar"}
        variant="default"
        onConfirm={confirmToggleAccountType}
      />
      <ConfirmDialog
        open={deleteContactConfirm.open}
        onOpenChange={(v) => setDeleteContactConfirm({ ...deleteContactConfirm, open: v })}
        title="Eliminar contacto"
        description="El contacto será eliminado permanentemente. Esta acción no se puede deshacer."
        onConfirm={() => deleteContact(deleteContactConfirm.id)}
      />
      <ConfirmDialog
        open={!!primaryChangeConfirm}
        onOpenChange={(v) => !v && setPrimaryChangeConfirm(null)}
        title="Cambiar contacto principal"
        description={
          primaryChangeConfirm
            ? `Al marcar este contacto como principal, ${primaryChangeConfirm.otherName} dejará de ser el contacto principal. ¿Continuar?`
            : ""
        }
        confirmLabel="Continuar"
        variant="default"
        onConfirm={() => {
          if (primaryChangeConfirm?.type === "edit") doSaveContact();
          else if (primaryChangeConfirm?.type === "new") doCreateContact();
        }}
      />

    </>
  );
}
