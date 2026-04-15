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
import { EmptyState } from "@/components/opai/EmptyState";
import { getQuoteStatus } from "@/lib/quoteStatus";
import { CrmInstallationsClient } from "./CrmInstallationsClient";
import { EmailHistoryList } from "./EmailHistoryList";
import { EntityDetailLayout, useEntityTabs, type EntityTab, type EntityHeaderAction } from "./EntityDetailLayout";
import { DetailField, DetailFieldGrid } from "./DetailField";
import { CrmRelatedRecordCard, CrmRelatedRecordGrid } from "./CrmRelatedRecordCard";
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
} from "lucide-react";
import { DuplicateAccountModal } from "./DuplicateAccountModal";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
  segment?: string | null;
  website?: string | null;
  address?: string | null;
  commune?: string | null;
  notaryName?: string | null;
  notaryDate?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  contacts: ContactRow[];
  deals: DealRow[];
  installations: InstallationRow[];
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
  const [updatingAccountType, setUpdatingAccountType] = useState(false);
  const [updatingAccountStatus, setUpdatingAccountStatus] = useState(false);
  const [accountStatusConfirmOpen, setAccountStatusConfirmOpen] = useState(false);
  const [accountStatusNextValue, setAccountStatusNextValue] = useState<boolean>(false);
  const [accountTypeConfirmOpen, setAccountTypeConfirmOpen] = useState(false);
  const [accountTypeNextValue, setAccountTypeNextValue] = useState<"prospect" | "client">("client");
  const [accountForm, setAccountForm] = useState({
    name: account.name,
    rut: account.rut || "",
    legalName: account.legalName || "",
    legalRepresentativeName: account.legalRepresentativeName || "",
    legalRepresentativeRut: account.legalRepresentativeRut || "",
    industry: account.industry || "",
    segment: account.segment || "",
    website: account.website || "",
    address: account.address || "",
    commune: account.commune || "",
    notaryName: account.notaryName || "",
    notaryDate: account.notaryDate || "",
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
    setAccountForm({
      name: account.name,
      rut: account.rut || "",
      legalName: account.legalName || "",
      legalRepresentativeName: account.legalRepresentativeName || "",
      legalRepresentativeRut: account.legalRepresentativeRut || "",
      industry: account.industry || "",
      segment: account.segment || "",
      website: account.website || "",
      address: account.address || "",
      commune: account.commune || "",
      notaryName: account.notaryName || "",
      notaryDate: account.notaryDate || "",
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

  // ── Extra actions (lifecycle toggles + quick contact) ──
  const primaryPhone = account.contacts.find(c => c.isPrimary)?.phone || account.contacts[0]?.phone;
  const hasPortalContacts = account.contacts.some(c => c.portalEnabled);
  const extraActions = (
    <div className="flex items-center gap-1.5">
      {primaryPhone && (
        <>
          <a href={`tel:+56${primaryPhone}`} title="Llamar"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted transition-colors">
            <Phone className="h-4 w-4" />
          </a>
          <a href={`https://wa.me/56${primaryPhone}`} target="_blank" rel="noopener noreferrer" title="WhatsApp"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-green-600/30 bg-green-600/15 text-green-400 hover:bg-green-600/25 transition-colors">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
          </a>
        </>
      )}
      {lifecycle === "prospect" && (
        <Button size="sm" variant="secondary" onClick={() => openToggleAccountType("client")} disabled={updatingAccountType}>
          {updatingAccountType ? "Guardando..." : "Convertir a cliente"}
        </Button>
      )}
      {lifecycle !== "prospect" && (
        <Button
          size="sm"
          variant={account.isActive ? "outline" : "secondary"}
          onClick={openToggleAccountStatus}
          disabled={updatingAccountStatus}
        >
          {updatingAccountStatus ? "Guardando..." : account.isActive ? "Desactivar" : "Activar"}
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={() => setChatModalOpen(true)} disabled={!hasPortalContacts} title={!hasPortalContacts ? "Sin contactos con portal activo" : "Iniciar chat externo"}>
        <MessageCircle className="h-4 w-4 mr-1.5" />
        Chat
      </Button>
    </div>
  );

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
                      enc.averageScore >= 4 ? "text-emerald-400" : enc.averageScore >= 3 ? "text-amber-400" : "text-red-400"
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

  const headerActions: EntityHeaderAction[] = [
    { label: "Editar cuenta", icon: Pencil, onClick: openAccountEdit, primary: true },
    { label: "Buscar duplicados", icon: GitMerge, onClick: () => setDuplicateModalOpen(true) },
    { label: "Eliminar cuenta", icon: Trash2, onClick: () => setDeleteAccountConfirm(true), variant: "destructive" },
  ];

  // ── Tab content: General ──
  const generalContent = (
    <div className="space-y-6 rounded-lg border border-border bg-card p-4 sm:p-5">
      <DetailFieldGrid columns={3}>
        <DetailField
          label="Tipo"
          value={
            <Badge variant="outline" className={lifecycle !== "prospect" ? "border-emerald-500/30 text-emerald-400" : "border-amber-500/30 text-amber-400"}>
              {lifecycle === "prospect" ? "Prospecto" : "Cliente"}
            </Badge>
          }
        />
        <DetailField
          label="Estado"
          value={
            <Badge variant="outline" className={lifecycle === "client_active" ? "border-emerald-500/30 text-emerald-400" : "border-rose-500/30 text-rose-400"}>
              {lifecycle === "client_active" ? "Activa" : lifecycle === "client_inactive" ? "Ex cliente" : "Inactiva"}
            </Badge>
          }
        />
        <DetailField
          label="Página web"
          value={account.website ? (
            <a href={account.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate flex items-center gap-1">
              {account.website}<ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          ) : undefined}
        />
        <DetailField label="RUT" value={account.rut} mono copyable />
        <DetailField label="Razón social" value={account.legalName} />
        <DetailField label="Industria" value={account.industry} />
        <DetailField label="Representante legal" value={account.legalRepresentativeName} />
        <DetailField label="RUT representante" value={account.legalRepresentativeRut} mono copyable />
        <DetailField label="Notaría" value={account.notaryName} />
        <DetailField label="Fecha escritura" value={account.notaryDate} />
        <DetailField label="Segmento" value={account.segment} />
        <DetailField
          label="Dirección"
          value={account.address}
          icon={account.address ? <MapPin className="h-3 w-3" /> : undefined}
        />
        <DetailField label="Comuna" value={account.commune} />
        <DetailField
          label="Fecha inicio"
          value={account.startDate ? new Intl.DateTimeFormat("es-CL").format(new Date(account.startDate)) : undefined}
        />
        <DetailField
          label="Fecha término"
          value={account.endDate ? new Intl.DateTimeFormat("es-CL").format(new Date(account.endDate)) : undefined}
        />
        <DetailField label="Fecha creación" value={account.createdAt ? new Date(account.createdAt).toLocaleString("es-CL", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"} />
        <DetailField label="Última modificación" value={account.updatedAt ? new Date(account.updatedAt).toLocaleString("es-CL", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"} />
      </DetailFieldGrid>

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
                    <span className="text-xs text-amber-600/90">Sin email — necesario para el portal</span>
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
        {activeTab === "general" && generalContent}

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
            onRefresh={() => router.refresh()}
          />
        )}

        {activeTab === "files" && <FileAttachments entityType="account" entityId={account.id} title="Documentos" />}
      </EntityDetailLayout>

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
              <Label className="text-xs">Nombre *</Label>
              <Input value={accountForm.name} onChange={(e) => setAccountForm((p) => ({ ...p, name: e.target.value }))} className={inputCn} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">RUT</Label>
              <Input value={accountForm.rut} onChange={(e) => setAccountForm((p) => ({ ...p, rut: e.target.value }))} className={inputCn} placeholder="76.123.456-7" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Razón social</Label>
              <Input
                value={accountForm.legalName}
                onChange={(e) => setAccountForm((p) => ({ ...p, legalName: e.target.value }))}
                className={inputCn}
                placeholder="Empresa SpA / Ltda / S.A."
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Representante legal</Label>
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
              <Label className="text-xs">RUT representante legal</Label>
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
              <Label className="text-xs">Notaría (personería)</Label>
              <Input
                value={accountForm.notaryName}
                onChange={(e) => setAccountForm((p) => ({ ...p, notaryName: e.target.value }))}
                className={inputCn}
                placeholder="Ej: Notaría de Santiago, Notario Juan Pérez"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Fecha escritura pública</Label>
              <Input
                value={accountForm.notaryDate}
                onChange={(e) => setAccountForm((p) => ({ ...p, notaryDate: e.target.value }))}
                className={inputCn}
                placeholder="Ej: 15 de marzo de 2024"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Industria</Label>
              <Input value={accountForm.industry} onChange={(e) => setAccountForm((p) => ({ ...p, industry: e.target.value }))} className={inputCn} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Segmento</Label>
              <Input value={accountForm.segment} onChange={(e) => setAccountForm((p) => ({ ...p, segment: e.target.value }))} className={inputCn} placeholder="Corporativo, PYME..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Sitio web</Label>
              <Input value={accountForm.website} onChange={(e) => setAccountForm((p) => ({ ...p, website: e.target.value }))} className={inputCn} placeholder="https://..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Dirección</Label>
              <Input value={accountForm.address} onChange={(e) => setAccountForm((p) => ({ ...p, address: e.target.value }))} className={inputCn} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Comuna</Label>
              <Input value={accountForm.commune} onChange={(e) => setAccountForm((p) => ({ ...p, commune: e.target.value }))} className={inputCn} placeholder="Lo Barnechea, Providencia..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Fecha inicio</Label>
              <Input type="date" value={accountForm.startDate} onChange={(e) => setAccountForm((p) => ({ ...p, startDate: e.target.value }))} className={inputCn} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Fecha término</Label>
              <Input type="date" value={accountForm.endDate} onChange={(e) => setAccountForm((p) => ({ ...p, endDate: e.target.value }))} className={inputCn} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Notas</Label>
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

      {/* ── Contact Edit Modal ── */}
      <Dialog open={!!editContact} onOpenChange={(v) => !v && setEditContact(null)}>
        <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Editar contacto</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Nombre *</Label>
              <Input value={editForm.firstName} onChange={(e) => setEditForm((p) => ({ ...p, firstName: e.target.value }))} className={inputCn} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Apellido *</Label>
              <Input value={editForm.lastName} onChange={(e) => setEditForm((p) => ({ ...p, lastName: e.target.value }))} className={inputCn} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email *</Label>
              <Input value={editForm.email} onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))} className={inputCn} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Teléfono</Label>
              <Input value={editForm.phone} onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))} className={inputCn} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cargo</Label>
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
              <Label className="text-xs">Nombre *</Label>
              <Input value={newContactForm.firstName} onChange={(e) => setNewContactForm((p) => ({ ...p, firstName: e.target.value }))} className={inputCn} placeholder="Nombre" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Apellido</Label>
              <Input value={newContactForm.lastName} onChange={(e) => setNewContactForm((p) => ({ ...p, lastName: e.target.value }))} className={inputCn} placeholder="Apellido" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email *</Label>
              <Input value={newContactForm.email} onChange={(e) => setNewContactForm((p) => ({ ...p, email: e.target.value }))} className={inputCn} placeholder="correo@empresa.com" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Teléfono</Label>
              <Input value={newContactForm.phone} onChange={(e) => setNewContactForm((p) => ({ ...p, phone: e.target.value }))} className={inputCn} placeholder="+56 9 1234 5678" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cargo</Label>
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
