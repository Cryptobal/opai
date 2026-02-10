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
import { CollapsibleSection } from "./CollapsibleSection";
import { RecordActions } from "./RecordActions";
import { CrmInstallationsClient } from "./CrmInstallationsClient";
import { EmailHistoryList } from "./EmailHistoryList";
import {
  ArrowLeft,
  Building2,
  Users,
  TrendingUp,
  Mail,
  Phone,
  Globe,
  MapPin,
  Warehouse,
  Pencil,
  Trash2,
  Loader2,
  ChevronRight,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

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
};

type AccountDetail = {
  id: string;
  name: string;
  type: "prospect" | "client";
  status: string;
  rut?: string | null;
  industry?: string | null;
  segment?: string | null;
  size?: string | null;
  website?: string | null;
  address?: string | null;
  notes?: string | null;
  contacts: ContactRow[];
  deals: DealRow[];
  installations: InstallationRow[];
  _count: { contacts: number; deals: number; installations: number };
};

export function CrmAccountDetailClient({ account: initialAccount }: { account: AccountDetail }) {
  const router = useRouter();
  const [account, setAccount] = useState(initialAccount);

  // ── Account edit state ──
  const [editAccountOpen, setEditAccountOpen] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [accountForm, setAccountForm] = useState({
    name: account.name,
    rut: account.rut || "",
    industry: account.industry || "",
    segment: account.segment || "",
    size: account.size || "",
    website: account.website || "",
    address: account.address || "",
    notes: account.notes || "",
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

  const inputCn = "bg-background text-foreground placeholder:text-muted-foreground border-input focus-visible:ring-ring";

  // ── Account handlers ──
  const openAccountEdit = () => {
    setAccountForm({
      name: account.name,
      rut: account.rut || "",
      industry: account.industry || "",
      segment: account.segment || "",
      size: account.size || "",
      website: account.website || "",
      address: account.address || "",
      notes: account.notes || "",
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
        body: JSON.stringify(accountForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);
      setAccount((prev) => ({ ...prev, ...accountForm }));
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

  const saveContact = async () => {
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
      toast.success("Contacto actualizado");
    } catch {
      toast.error("No se pudo actualizar");
    } finally {
      setSavingContact(false);
    }
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

  const createContact = async () => {
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
      toast.success("Contacto creado");
    } catch {
      toast.error("No se pudo crear el contacto.");
    } finally {
      setCreatingContact(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between">
        <Link
          href="/crm/accounts"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a cuentas
        </Link>
        <RecordActions
          actions={[
            { label: "Editar cuenta", icon: Pencil, onClick: openAccountEdit },
            { label: "Eliminar cuenta", icon: Trash2, onClick: () => setDeleteAccountConfirm(true), variant: "destructive" },
          ]}
        />
      </div>

      {/* ── Section 1: Datos generales ── */}
      <CollapsibleSection
        icon={<Building2 className="h-4 w-4" />}
        title="Datos generales"
        action={
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={openAccountEdit}>
            <Pencil className="h-3 w-3 mr-1" />
            Editar
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-3 text-sm">
            <InfoRow label="Tipo">
              <Badge
                variant="outline"
                className={
                  account.type === "client"
                    ? "border-emerald-500/30 text-emerald-400"
                    : "border-amber-500/30 text-amber-400"
                }
              >
                {account.type === "client" ? "Cliente" : "Prospecto"}
              </Badge>
            </InfoRow>
            <InfoRow label="RUT">{account.rut || "—"}</InfoRow>
            <InfoRow label="Industria">{account.industry || "—"}</InfoRow>
            <InfoRow label="Segmento">{account.segment || "—"}</InfoRow>
            <InfoRow label="Tamaño">{account.size || "—"}</InfoRow>
          </div>
          <div className="space-y-3 text-sm">
            <InfoRow label="Página web">
              {account.website ? (
                <a href={account.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">
                  {account.website}
                </a>
              ) : (
                "—"
              )}
            </InfoRow>
            {account.address && (
              <InfoRow label="Dirección">
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {account.address}
                </span>
              </InfoRow>
            )}
            {account.notes && (
              <div className="rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                {account.notes}
              </div>
            )}
            {!account.address && !account.notes && (
              <p className="text-muted-foreground text-xs">Sin dirección ni notas.</p>
            )}
          </div>
        </div>
      </CollapsibleSection>

      {/* ── Section 2: Contactos ── */}
      <CollapsibleSection
        icon={<Users className="h-4 w-4" />}
        title="Contactos"
        count={account.contacts.length}
        defaultOpen={account.contacts.length > 0}
        action={
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setNewContactOpen(true)}>
            <Plus className="h-3 w-3 mr-1" />
            Agregar
          </Button>
        }
      >
        {account.contacts.length === 0 ? (
          <EmptyState icon={<Users className="h-8 w-8" />} title="Sin contactos" description="Esta cuenta no tiene contactos registrados." compact />
        ) : (
          <div className="space-y-2">
            {account.contacts.map((contact) => (
              <div
                key={contact.id}
                className="flex flex-col gap-2 rounded-lg border p-3 sm:p-4 sm:flex-row sm:items-center sm:justify-between group"
              >
                <Link href={`/crm/contacts/${contact.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm hover:text-primary transition-colors">{`${contact.firstName} ${contact.lastName}`.trim()}</p>
                    {contact.isPrimary && (
                      <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">Principal</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {contact.roleTitle || "Sin cargo"}
                    {contact.email ? ` · ${contact.email}` : ""}
                    {contact.phone ? ` · ${contact.phone}` : ""}
                  </p>
                </Link>
                <Link href={`/crm/contacts/${contact.id}`} className="shrink-0">
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>

      {/* ── Section 3: Instalaciones ── */}
      <CollapsibleSection
        icon={<Warehouse className="h-4 w-4" />}
        title="Instalaciones"
        count={account.installations.length}
        defaultOpen={account.installations.length > 0}
      >
        <CrmInstallationsClient accountId={account.id} initialInstallations={account.installations} />
      </CollapsibleSection>

      {/* ── Section 4: Negocios ── */}
      <CollapsibleSection
        icon={<TrendingUp className="h-4 w-4" />}
        title="Negocios"
        count={account.deals.length}
        defaultOpen={account.deals.length > 0}
      >
        {account.deals.length === 0 ? (
          <EmptyState icon={<TrendingUp className="h-8 w-8" />} title="Sin negocios" description="No hay negocios vinculados a esta cuenta." compact />
        ) : (
          <div className="space-y-2">
            {account.deals.map((deal) => (
              <Link
                key={deal.id}
                href={`/crm/deals/${deal.id}`}
                className="flex items-center justify-between rounded-lg border p-3 sm:p-4 transition-colors hover:bg-accent/30 group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{deal.title}</p>
                    <Badge variant="outline">{deal.stage?.name}</Badge>
                    {deal.status === "won" && (
                      <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">Ganado</Badge>
                    )}
                    {deal.status === "lost" && (
                      <Badge variant="outline" className="border-red-500/30 text-red-400">Perdido</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    ${Number(deal.amount).toLocaleString("es-CL")}
                    {deal.primaryContact ? ` · ${deal.primaryContact.firstName} ${deal.primaryContact.lastName}`.trim() : ""}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:translate-x-0.5 transition-transform shrink-0 hidden sm:block" />
              </Link>
            ))}
          </div>
        )}
      </CollapsibleSection>

      {/* ── Section 5: Comunicación ── */}
      <CollapsibleSection
        icon={<Mail className="h-4 w-4" />}
        title="Comunicación"
        defaultOpen={false}
      >
        <EmailHistoryList accountId={account.id} compact />
      </CollapsibleSection>

      {/* ── Account Edit Modal ── */}
      <Dialog open={editAccountOpen} onOpenChange={setEditAccountOpen}>
        <DialogContent className="sm:max-w-lg">
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
              <Label className="text-xs">Industria</Label>
              <Input value={accountForm.industry} onChange={(e) => setAccountForm((p) => ({ ...p, industry: e.target.value }))} className={inputCn} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Segmento</Label>
              <Input value={accountForm.segment} onChange={(e) => setAccountForm((p) => ({ ...p, segment: e.target.value }))} className={inputCn} placeholder="Corporativo, PYME..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tamaño</Label>
              <Input value={accountForm.size} onChange={(e) => setAccountForm((p) => ({ ...p, size: e.target.value }))} className={inputCn} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Sitio web</Label>
              <Input value={accountForm.website} onChange={(e) => setAccountForm((p) => ({ ...p, website: e.target.value }))} className={inputCn} placeholder="https://..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Dirección</Label>
              <Input value={accountForm.address} onChange={(e) => setAccountForm((p) => ({ ...p, address: e.target.value }))} className={inputCn} />
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
        <DialogContent className="sm:max-w-md">
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
        <DialogContent className="sm:max-w-md">
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
        onConfirm={deleteAccount}
      />
      <ConfirmDialog
        open={deleteContactConfirm.open}
        onOpenChange={(v) => setDeleteContactConfirm({ ...deleteContactConfirm, open: v })}
        title="Eliminar contacto"
        description="El contacto será eliminado permanentemente. Esta acción no se puede deshacer."
        onConfirm={() => deleteContact(deleteContactConfirm.id)}
      />
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}
