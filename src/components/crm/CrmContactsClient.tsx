/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Pencil, Loader2, ChevronRight, Mail, Phone, MessageSquare } from "lucide-react";
import { CRM_MODULES } from "./CrmModuleIcons";
import { EmptyState } from "@/components/opai/EmptyState";
import { CrmDates } from "@/components/crm/CrmDates";
import { CrmToolbar } from "./CrmToolbar";
import type { ViewMode } from "@/components/shared/ViewToggle";
import { SearchableSelect, type SearchableOption } from "@/components/ui/SearchableSelect";
import { toast } from "sonner";
import Link from "next/link";
import { useUnreadNoteIds } from "@/lib/hooks";

type ContactRow = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  roleTitle?: string | null;
  isPrimary?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  account?: {
    id: string;
    name: string;
  } | null;
};

type AccountRow = {
  id: string;
  name: string;
};

type ContactFormState = {
  accountId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  roleTitle: string;
  isPrimary: boolean;
};

const DEFAULT_FORM: ContactFormState = {
  accountId: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  roleTitle: "",
  isPrimary: false,
};

export function CrmContactsClient({
  initialContacts,
  accounts,
}: {
  initialContacts: ContactRow[];
  accounts: AccountRow[];
}) {
  const [contacts, setContacts] = useState<ContactRow[]>(initialContacts);
  const [form, setForm] = useState<ContactFormState>(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const unreadNoteIds = useUnreadNoteIds("CONTACT");
  const [editOpen, setEditOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("cards");
  const [sort, setSort] = useState("newest");
  const [contactFilter, setContactFilter] = useState("all");

  const inputClassName =
    "bg-background text-foreground placeholder:text-muted-foreground border-input focus-visible:ring-ring";
  const selectClassName =
    "flex h-9 min-h-[44px] w-full appearance-none rounded-md border border-input bg-background pl-3 pr-8 py-2 text-sm text-foreground bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236b7280%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[right_8px_center] bg-no-repeat focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = contacts;

    // Filter by type
    if (contactFilter === "with_account") {
      result = result.filter((c) => !!c.account);
    } else if (contactFilter === "without_account") {
      result = result.filter((c) => !c.account);
    }

    // Search
    if (q) {
      result = result.filter((c) => {
        const searchable = `${c.firstName} ${c.lastName} ${c.email || ""} ${c.phone || ""} ${c.account?.name || ""}`.toLowerCase();
        return searchable.includes(q);
      });
    }

    // Sort
    result = [...result].sort((a, b) => {
      switch (sort) {
        case "oldest":
          return (a.createdAt || "").localeCompare(b.createdAt || "");
        case "az":
          return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
        case "za":
          return `${b.firstName} ${b.lastName}`.localeCompare(`${a.firstName} ${a.lastName}`);
        case "newest":
        default:
          return (b.createdAt || "").localeCompare(a.createdAt || "");
      }
    });

    return result;
  }, [contacts, search, sort, contactFilter]);

  const contactFilterOptions = useMemo(() => [
    { key: "all", label: "Todos", count: contacts.length },
    { key: "with_account", label: "Con cuenta", count: contacts.filter((c) => !!c.account).length },
    { key: "without_account", label: "Sin cuenta", count: contacts.filter((c) => !c.account).length },
  ], [contacts]);

  const updateForm = (key: keyof ContactFormState, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const createContact = async () => {
    if (!form.accountId) {
      toast.error("Selecciona un cliente.");
      return;
    }
    if (!form.firstName.trim()) {
      toast.error("El nombre es obligatorio.");
      return;
    }
    if (!form.lastName.trim()) {
      toast.error("El apellido es obligatorio.");
      return;
    }
    if (!form.email.trim()) {
      toast.error("El email es obligatorio.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/crm/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Error creando contacto");
      }
      setContacts((prev) => [payload.data, ...prev]);
      setForm(DEFAULT_FORM);
      setOpen(false);
      toast.success("Contacto creado");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo crear el contacto.");
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (contact: ContactRow) => {
    setEditingId(contact.id);
    setForm({
      accountId: contact.account?.id || "",
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email || "",
      phone: contact.phone || "",
      roleTitle: contact.roleTitle || "",
      isPrimary: contact.isPrimary || false,
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/crm/contacts/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone || null,
          roleTitle: form.roleTitle || null,
          isPrimary: form.isPrimary,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Error actualizando contacto");
      }
      setContacts((prev) =>
        prev.map((c) => (c.id === editingId ? payload.data : c))
      );
      setEditOpen(false);
      setEditingId(null);
      setForm(DEFAULT_FORM);
      toast.success("Contacto actualizado");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo actualizar el contacto.");
    } finally {
      setLoading(false);
    }
  };

  const contactName = (c: ContactRow) =>
    [c.firstName, c.lastName].filter(Boolean).join(" ") || "Sin nombre";

  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      <CrmToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por nombre, email o teléfono..."
        filters={contactFilterOptions}
        activeFilter={contactFilter}
        onFilterChange={setContactFilter}
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
                <span className="sr-only">Nuevo contacto</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Nuevo contacto</DialogTitle>
                <DialogDescription>
                  Asócialo a un cliente existente.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label>Cliente *</Label>
                  <SearchableSelect
                    value={form.accountId}
                    options={accounts.map((account) => ({ id: account.id, label: account.name }))}
                    placeholder="Selecciona un cliente"
                    onChange={(val) => updateForm("accountId", val)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nombre *</Label>
                  <Input
                    value={form.firstName}
                    onChange={(event) => updateForm("firstName", event.target.value)}
                    placeholder="Nombre"
                    className={inputClassName}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Apellido *</Label>
                  <Input
                    value={form.lastName}
                    onChange={(event) => updateForm("lastName", event.target.value)}
                    placeholder="Apellido"
                    className={inputClassName}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email *</Label>
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
                <div className="space-y-2">
                  <Label>Cargo</Label>
                  <Input
                    value={form.roleTitle}
                    onChange={(event) => updateForm("roleTitle", event.target.value)}
                    placeholder="Gerente, jefe, etc."
                    className={inputClassName}
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.isPrimary}
                      onChange={(event) => updateForm("isPrimary", event.target.checked)}
                    />
                    Contacto principal
                  </label>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={createContact} disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Guardar contacto
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Edit modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar contacto</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input
                value={form.firstName}
                onChange={(e) => updateForm("firstName", e.target.value)}
                className={inputClassName}
              />
            </div>
            <div className="space-y-2">
              <Label>Apellido *</Label>
              <Input
                value={form.lastName}
                onChange={(e) => updateForm("lastName", e.target.value)}
                className={inputClassName}
              />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input
                value={form.email}
                onChange={(e) => updateForm("email", e.target.value)}
                className={inputClassName}
              />
            </div>
            <div className="space-y-2">
              <Label>Teléfono</Label>
              <Input
                value={form.phone}
                onChange={(e) => updateForm("phone", e.target.value)}
                className={inputClassName}
              />
            </div>
            <div className="space-y-2">
              <Label>Cargo</Label>
              <Input
                value={form.roleTitle}
                onChange={(e) => updateForm("roleTitle", e.target.value)}
                className={inputClassName}
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isPrimary}
                  onChange={(e) => updateForm("isPrimary", e.target.checked)}
                />
                Contacto principal
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Contact list ── */}
      <Card>
        <CardContent className="pt-5">
          {filteredContacts.length === 0 ? (
            <EmptyState
              icon={<CRM_MODULES.contacts.icon className="h-8 w-8" />}
              title="Sin contactos"
              description={
                search
                  ? "No hay contactos para la búsqueda."
                  : "No hay contactos registrados todavía."
              }
              compact
            />
          ) : view === "list" ? (
            <div className="space-y-2">
              {filteredContacts.map((contact) => (
                <div
                  key={contact.id}
                  className="flex items-center gap-2 rounded-lg border p-3 sm:p-4 transition-colors group hover:bg-accent/30"
                >
                  <Link href={`/crm/contacts/${contact.id}`} className="flex flex-1 items-center justify-between min-w-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm group-hover:text-primary transition-colors">{contactName(contact)}</p>
                        {unreadNoteIds.has(contact.id) && (
                          <span className="relative shrink-0" title="Notas no leídas">
                            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-destructive" />
                          </span>
                        )}
                        {contact.isPrimary && (
                          <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">Principal</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {contact.email || "Sin email"} · {contact.phone || "Sin teléfono"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {contact.account?.name || "Sin cliente asociado"}
                        {contact.roleTitle ? ` · ${contact.roleTitle}` : ""}
                      </p>
                      {contact.createdAt && (
                        <CrmDates createdAt={contact.createdAt} updatedAt={contact.updatedAt} className="mt-0.5" />
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 shrink-0 ml-2" />
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 min-w-0">
              {filteredContacts.map((contact) => (
                <div
                  key={contact.id}
                  className="rounded-lg border p-4 transition-colors hover:border-primary/30 group space-y-2.5 hover:bg-accent/30 min-w-0 overflow-hidden"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/crm/contacts/${contact.id}`} className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="font-medium text-sm group-hover:text-primary transition-colors">{contactName(contact)}</p>
                            {unreadNoteIds.has(contact.id) && (
                              <span className="relative shrink-0" title="Notas no leídas">
                                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-destructive" />
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground">{contact.roleTitle || "Sin cargo"}</p>
                        </div>
                        {contact.isPrimary && (
                          <Badge variant="outline" className="text-[10px] border-primary/30 text-primary shrink-0">Principal</Badge>
                        )}
                      </div>
                      <div className="space-y-1 text-xs text-muted-foreground mt-2">
                        {contact.email && <p className="flex items-center gap-1.5"><Mail className="h-3 w-3 shrink-0" />{contact.email}</p>}
                        {contact.phone && <p className="flex items-center gap-1.5"><Phone className="h-3 w-3 shrink-0" />{contact.phone}</p>}
                        {contact.account?.name && <p className="flex items-center gap-1.5"><CRM_MODULES.accounts.icon className="h-3 w-3 shrink-0" />{contact.account.name}</p>}
                      </div>
                    </Link>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
