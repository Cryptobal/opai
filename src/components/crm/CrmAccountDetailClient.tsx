/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useState } from "react";
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
import { CrmInstallationsClient } from "./CrmInstallationsClient";
import { EmailHistoryList } from "./EmailHistoryList";
import { CrmDetailLayout, type DetailSection } from "./CrmDetailLayout";
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
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { NotesSection } from "./NotesSection";
import { FileAttachments } from "./FileAttachments";
import { AccountExpensesSection } from "@/components/finance/AccountExpensesSection";

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

type ContactRow = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  roleTitle?: string | null;
  isPrimary?: boolean;
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
  isActive?: boolean;
};

type QuoteRow = {
  id: string;
  code: string;
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
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
  contacts: ContactRow[];
  deals: DealRow[];
  installations: InstallationRow[];
  _count: { contacts: number; deals: number; installations: number };
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
  currentUserId,
}: {
  account: AccountDetail;
  quotes?: QuoteRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [account, setAccount] = useState(initialAccount);
  const [accountLogoUrl, setAccountLogoUrl] = useState<string | null>(
    extractAccountLogoUrl(initialAccount.notes)
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
    startDate: account.startDate ? new Date(account.startDate).toISOString().slice(0, 10) : "",
    endDate: account.endDate ? new Date(account.endDate).toISOString().slice(0, 10) : "",
    notes: stripAccountLogoMarker(account.notes),
  });

  // ── Contact edit state ──
  const [editContact, setEditContact] = useState<ContactRow | null>(null);
  const [editForm, setEditForm] = useState({ firstName: "", lastName: "", email: "", phone: "", roleTitle: "", isPrimary: false });
  const [savingContact, setSavingContact] = useState(false);

  // ── New contact state ──
  const [newContactOpen, setNewContactOpen] = useState(false);
  const [newContactForm, setNewContactForm] = useState({ firstName: "", lastName: "", email: "", phone: "", roleTitle: "", isPrimary: false });
  const [creatingContact, setCreatingContact] = useState(false);

  // ── Delete state ──
  const [deleteAccountConfirm, setDeleteAccountConfirm] = useState(false);
  const [deleteContactConfirm, setDeleteContactConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: "" });

  // ── Cambio de contacto principal (solo uno por cuenta) ──
  const [primaryChangeConfirm, setPrimaryChangeConfirm] = useState<{ type: "edit" | "new"; otherName: string } | null>(null);

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
      const logoUrl = payload?.data?.localLogoUrl || payload?.data?.logoUrl || null;
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
          isActive: data.data.type === "prospect" ? false : inst.isActive,
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
          isActive: data.data.isActive ? inst.isActive : false,
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
      setAccount((prev) => ({
        ...prev,
        contacts: [data.data, ...prev.contacts],
        _count: { ...prev._count, contacts: prev._count.contacts + 1 },
      }));
      setNewContactOpen(false);
      setNewContactForm({ firstName: "", lastName: "", email: "", phone: "", roleTitle: "", isPrimary: false });
      setPrimaryChangeConfirm(null);
      toast.success("Contacto creado");
    } catch {
      toast.error("No se pudo crear el contacto.");
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

  const lifecycleSubtitle = [
    lifecycle === "prospect" ? "Prospecto" : lifecycle === "client_active" ? "Cliente activo" : "Ex cliente",
    account.industry || null,
    account.segment || null,
  ].filter(Boolean).join(" · ");

  // ── Extra actions (lifecycle toggles) ──
  const extraActions = (
    <div className="flex items-center gap-2">
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
    </div>
  );

  // ── Sections ──
  const ContactsIcon = CRM_MODULES.contacts.icon;
  const DealsIcon = CRM_MODULES.deals.icon;
  const QuotesIcon = CRM_MODULES.quotes.icon;

  const sections: DetailSection[] = [
    {
      key: "general",
      children: (
        <div className="grid gap-6 lg:grid-cols-2">
          <DetailFieldGrid>
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
            <DetailField label="RUT" value={account.rut} mono copyable />
            <DetailField label="Razón social" value={account.legalName} />
            <DetailField label="Representante legal" value={account.legalRepresentativeName} />
            <DetailField label="RUT representante" value={account.legalRepresentativeRut} mono copyable />
            <DetailField label="Industria" value={account.industry} />
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
          </DetailFieldGrid>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Página web</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={enrichCompanyInfoFromWebsite}
                  disabled={enrichingCompanyInfo || !(account.website || enrichWebsiteInput)?.trim()}
                >
                  {enrichingCompanyInfo && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                  Traer datos
                </Button>
              </div>
              {account.website ? (
                <a href={account.website} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline truncate block">
                  {account.website}
                </a>
              ) : (
                <Input
                  value={enrichWebsiteInput}
                  onChange={(e) => setEnrichWebsiteInput(e.target.value)}
                  placeholder="https://www.empresa.cl"
                  className={`h-8 text-xs ${inputCn}`}
                />
              )}
            </div>
            {accountLogoUrl && (
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground mb-1.5 font-medium">Logo</p>
                <img
                  src={accountLogoUrl}
                  alt={`Logo ${account.name}`}
                  className="h-16 w-16 rounded-lg border border-border bg-background object-contain"
                />
              </div>
            )}
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Información de la empresa</span>
              {stripAccountLogoMarker(account.notes) ? (
                <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground leading-relaxed">
                  {stripAccountLogoMarker(account.notes)}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground/60 italic">Sin descripción</p>
              )}
              <div className="flex items-center gap-2 pt-1">
                <Input
                  value={regenerateInstruction}
                  onChange={(e) => setRegenerateInstruction(e.target.value)}
                  placeholder="Instrucción para IA (opcional)..."
                  className={`h-8 text-xs flex-1 ${inputCn}`}
                />
                <Button type="button" size="sm" variant="outline" onClick={regenerateNotesWithAi} disabled={regenerating}>
                  {regenerating && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                  <Sparkles className="mr-1 h-3 w-3" />
                  Regenerar
                </Button>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "contacts",
      count: account.contacts.length,
      action: (
        <Button size="sm" variant="ghost" onClick={() => setNewContactOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Agregar
        </Button>
      ),
      children: account.contacts.length === 0 ? (
        <EmptyState icon={<ContactsIcon className="h-8 w-8" />} title="Sin contactos" description="Esta cuenta no tiene contactos registrados." compact />
      ) : (
        <CrmRelatedRecordGrid>
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
      ),
    },
    {
      key: "installations",
      count: account.installations.length,
      children: (
        <CrmInstallationsClient
          accountId={account.id}
          accountIsActive={account.isActive}
          initialInstallations={account.installations}
        />
      ),
    },
    {
      key: "deals",
      count: account.deals.length,
      children: account.deals.length === 0 ? (
        <EmptyState icon={<DealsIcon className="h-8 w-8" />} title="Sin negocios" description="No hay negocios vinculados a esta cuenta." compact />
      ) : (
        <CrmRelatedRecordGrid>
          {account.deals.map((deal) => (
            <CrmRelatedRecordCard
              key={deal.id}
              module="deals"
              title={deal.title}
              subtitle={deal.stage?.name || "Sin etapa"}
              meta={`$${Number(deal.amount).toLocaleString("es-CL")}`}
              badge={
                deal.status === "won"
                  ? { label: "Ganado", variant: "success" }
                  : deal.status === "lost"
                  ? { label: "Perdido", variant: "destructive" }
                  : undefined
              }
              href={`/crm/deals/${deal.id}`}
            />
          ))}
        </CrmRelatedRecordGrid>
      ),
    },
    {
      key: "quotes",
      count: quotes.length,
      children: quotes.length === 0 ? (
        <EmptyState icon={<QuotesIcon className="h-8 w-8" />} title="Sin cotizaciones" description="No hay cotizaciones vinculadas a esta cuenta." compact />
      ) : (
        <CrmRelatedRecordGrid>
          {quotes.map((q) => (
            <CrmRelatedRecordCard
              key={q.id}
              module="quotes"
              title={q.code}
              subtitle={q.clientName || undefined}
              meta={formatCLP(q.monthlyCost)}
              badge={{ label: q.status, variant: "secondary" }}
              href={`/crm/cotizaciones/${q.id}`}
            />
          ))}
        </CrmRelatedRecordGrid>
      ),
    },
    {
      key: "communication",
      children: <EmailHistoryList accountId={account.id} compact />,
    },
    {
      key: "rendiciones",
      label: "Rendiciones de gastos",
      children: (
        <AccountExpensesSection
          accountId={account.id}
          installationIds={account.installations?.map((i) => i.id) || []}
        />
      ),
    },
    {
      key: "notes",
      children: <NotesSection entityType="account" entityId={account.id} currentUserId={currentUserId} />,
    },
    {
      key: "files",
      children: <FileAttachments entityType="account" entityId={account.id} title="Archivos" />,
    },
  ];

  return (
    <>
      <CrmDetailLayout
        pageType="account"
        module="accounts"
        title={account.name}
        subtitle={lifecycleSubtitle}
        badge={lifecycleBadge}
        backHref="/crm/accounts"
        actions={[
          { label: "Editar cuenta", icon: Pencil, onClick: openAccountEdit },
          { label: "Eliminar cuenta", icon: Trash2, onClick: () => setDeleteAccountConfirm(true), variant: "destructive" },
        ]}
        extra={extraActions}
        sections={sections}
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
