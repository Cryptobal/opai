/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Plus, Loader2, ChevronRight, Mail, MessageSquare } from "lucide-react";
import { CRM_MODULES } from "./CrmModuleIcons";
import { EmptyState, Spinner } from "@/components/opai-ds";
import { CrmEntityCard, type EntityCardChip } from "./cards/CrmEntityCard";
import { CrmDates } from "@/components/crm/CrmDates";
import { CrmToolbar } from "./CrmToolbar";
import type { ViewMode } from "@/components/shared/ViewToggle";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { toast } from "sonner";
import Link from "next/link";
import { useUnreadNoteIds } from "@/lib/hooks";
import { CONTACT_LIST_DEFAULT_PAGE_SIZE } from "@/lib/crm/list-page-sizes";

type ContactRow = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  roleTitle?: string | null;
  isPrimary?: boolean;
  recibeCesion?: boolean;
  portalPinVisible?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  account?: {
    id: string;
    name: string;
    status?: string | null;
  } | null;
  companyPresentations?: Array<{ id: string; status: string }>;
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
  recibeCesion: boolean;
};

type ContactFilter = "active" | "all" | "with_account" | "without_account";

type ContactCounts = {
  active: number;
  all: number;
  withAccount: number;
  withoutAccount: number;
};

const DEFAULT_FORM: ContactFormState = {
  accountId: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  roleTitle: "",
  isPrimary: false,
  recibeCesion: false,
};

function contactMatchesFilter(contact: ContactRow, filter: ContactFilter): boolean {
  if (filter === "all") return true;
  if (filter === "active") return contact.account?.status === "client_active";
  if (filter === "with_account") return !!contact.account;
  return !contact.account;
}

type CrmContactsClientProps = {
  initialContacts: ContactRow[];
  initialCounts: ContactCounts;
  initialHasMore: boolean;
  initialTotal: number;
};

export function CrmContactsClient({
  initialContacts,
  initialCounts,
  initialHasMore,
  initialTotal,
}: CrmContactsClientProps) {
  const [contacts, setContacts] = useState<ContactRow[]>(initialContacts);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [form, setForm] = useState<ContactFormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const unreadNoteIds = useUnreadNoteIds("CONTACT");
  const [editOpen, setEditOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [view, setView] = useState<ViewMode>("cards");
  const [sort, setSort] = useState("newest");
  const [contactFilter, setContactFilter] = useState<ContactFilter>("active");
  const [counts, setCounts] = useState<ContactCounts>(initialCounts);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [listTotal, setListTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const initialLoadDone = useRef(false);
  // Evita refetch al montar con los mismos filtros del SSR.
  const skipFirstFetch = useRef(true);
  const accountsFetchStarted = useRef(false);

  const inputClassName =
    "bg-background text-foreground placeholder:text-muted-foreground border-input focus-visible:ring-ring";

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const ensureAccountsLoaded = useCallback(() => {
    if (accounts.length > 0 || accountsFetchStarted.current) return;
    accountsFetchStarted.current = true;
    fetch("/api/crm/accounts?limit=100&sort=az")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setAccounts(res.data || []);
      })
      .catch(() => {
        accountsFetchStarted.current = false;
      });
  }, [accounts.length]);

  useEffect(() => {
    if (open || editOpen) ensureAccountsLoaded();
  }, [open, editOpen, ensureAccountsLoaded]);

  const filterKey = useMemo(
    () => JSON.stringify({ contactFilter, debouncedSearch, sort }),
    [contactFilter, debouncedSearch, sort],
  );

  const fetchContacts = useCallback(
    async (pageNum: number, replace: boolean) => {
      if (replace) setLoading(true);
      else setLoadingMore(true);
      try {
        const params = new URLSearchParams({
          page: String(pageNum),
          limit: String(CONTACT_LIST_DEFAULT_PAGE_SIZE),
          sort,
          filter: contactFilter,
          includeCounts: "true",
        });
        if (debouncedSearch) params.set("search", debouncedSearch);

        const res = await fetch(`/api/crm/contacts?${params}`);
        const payload = await res.json();
        if (!payload.success) throw new Error(payload.error || "Error al cargar contactos");

        const incoming: ContactRow[] = payload.data ?? [];
        setContacts((prev) => (replace ? incoming : [...prev, ...incoming]));
        setPage(pageNum);
        setHasMore(Boolean(payload.meta?.hasMore));
        setListTotal(payload.meta?.total ?? incoming.length);
        if (payload.meta?.counts) setCounts(payload.meta.counts);
      } catch (error) {
        console.error(error);
        toast.error("No se pudieron cargar los contactos.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
        initialLoadDone.current = true;
      }
    },
    [contactFilter, debouncedSearch, sort],
  );

  useEffect(() => {
    if (skipFirstFetch.current) {
      skipFirstFetch.current = false;
      // Si el SSR ya trajo el filtro default sin búsqueda, no refetch.
      if (
        contactFilter === "active" &&
        !debouncedSearch &&
        sort === "newest"
      ) {
        initialLoadDone.current = true;
        return;
      }
    }
    void fetchContacts(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  const handleLoadMore = useCallback(() => {
    if (loadingMore || !hasMore || loading) return;
    void fetchContacts(page + 1, false);
  }, [fetchContacts, page, loadingMore, hasMore, loading]);

  const contactFilterOptions = useMemo(
    () => [
      { key: "active", label: "Activos", count: counts.active },
      { key: "all", label: "Todos", count: counts.all },
      { key: "with_account", label: "Con cuenta", count: counts.withAccount },
      { key: "without_account", label: "Sin cuenta", count: counts.withoutAccount },
    ],
    [counts],
  );

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
    setSaving(true);
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
      const created: ContactRow = payload.data;
      if (contactMatchesFilter(created, contactFilter)) {
        setContacts((prev) => [created, ...prev]);
        setListTotal((n) => n + 1);
      }
      setCounts((prev) => ({
        ...prev,
        all: prev.all + 1,
        withAccount: prev.withAccount + (created.account ? 1 : 0),
        withoutAccount: prev.withoutAccount + (!created.account ? 1 : 0),
        active: prev.active + (created.account?.status === "client_active" ? 1 : 0),
      }));
      setForm(DEFAULT_FORM);
      setOpen(false);
      toast.success("Contacto creado");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo crear el contacto.");
    } finally {
      setSaving(false);
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
      recibeCesion: contact.recibeCesion || false,
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
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
          recibeCesion: form.recibeCesion,
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
      setSaving(false);
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
        onFilterChange={(k) => setContactFilter(k as ContactFilter)}
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
                <div className="flex items-start md:col-span-2">
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={form.recibeCesion}
                      onChange={(event) => updateForm("recibeCesion", event.target.checked)}
                    />
                    <span>
                      Notificación DTE (cesión)
                      <span className="block text-xs text-muted-foreground">
                        Se le notifica cuando se cede una factura de este cliente a un factoring.
                      </span>
                    </span>
                  </label>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={createContact} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
            <div className="flex items-start md:col-span-2">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={form.recibeCesion}
                  onChange={(e) => updateForm("recibeCesion", e.target.checked)}
                />
                <span>
                  Notificación DTE (cesión)
                  <span className="block text-xs text-muted-foreground">
                    Se le notifica cuando se cede una factura de este cliente a un factoring.
                  </span>
                </span>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Contact list ── */}
      <Card>
        <CardContent className="pt-5">
          {loading && contacts.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Spinner />
            </div>
          ) : contacts.length === 0 ? (
            <EmptyState
              icon={CRM_MODULES.contacts.icon}
              title="Sin contactos"
              description={
                search || contactFilter !== "all"
                  ? "No hay contactos para los filtros seleccionados."
                  : "No hay contactos registrados todavía."
              }
              compact
            />
          ) : view === "list" ? (
            <div className={`space-y-2 ${loading ? "opacity-60" : ""}`}>
              {contacts.map((contact) => (
                <div
                  key={contact.id}
                  className="flex items-center gap-2 rounded-lg border p-3 sm:p-4 transition-colors group hover:bg-accent/30"
                >
                  <Link href={`/crm/contacts/${contact.id}`} className="flex flex-1 items-center justify-between min-w-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
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
                        {contact.portalPinVisible && (
                          <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums bg-status-ok-soft text-status-ok-fg">
                            PIN: {contact.portalPinVisible}
                          </span>
                        )}
                        {(contact.companyPresentations?.length ?? 0) > 0 && (
                          <span title="Presentación de empresa enviada" className="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: 'rgba(45,212,191,0.12)', color: '#2dd4bf', border: '1px solid rgba(45,212,191,0.2)' }}>
                            📋 Presentación
                          </span>
                        )}
                        {contact.account?.status === 'prospect' && (
                          <span className="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>
                            Prospecto
                          </span>
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
            <div className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-3 min-w-0 ${loading ? "opacity-60" : ""}`}>
              {contacts.map((contact) => {
                const chips: EntityCardChip[] = [];
                if (contact.isPrimary) chips.push({ label: "Principal", variant: "info", dot: true });
                if (contact.account?.status === "prospect") chips.push({ label: "Prospecto", variant: "warn", dot: true });
                if (contact.portalPinVisible) chips.push({ label: `PIN ${contact.portalPinVisible}`, variant: "ok" });
                if ((contact.companyPresentations?.length ?? 0) > 0) {
                  chips.push({ label: "Presentación", variant: "info", icon: Mail });
                }
                return (
                  <CrmEntityCard
                    key={contact.id}
                    href={`/crm/contacts/${contact.id}`}
                    entityId={contact.id}
                    title={contactName(contact)}
                    titleAdornment={
                      unreadNoteIds.has(contact.id) ? (
                        <span className="relative shrink-0" title="Notas no leídas">
                          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-destructive" />
                        </span>
                      ) : null
                    }
                    meta={`${contact.roleTitle || "Sin cargo"} · ${contact.account?.name || "Sin cuenta"}`}
                    avatar={{
                      initials: `${contact.firstName?.[0] ?? ""}${contact.lastName?.[0] ?? ""}` || undefined,
                    }}
                    chips={chips}
                    metrics={[
                      { label: "Email", value: contact.email || "—" },
                      { label: "Teléfono", value: contact.phone || "—" },
                    ]}
                  />
                );
              })}
            </div>
          )}
          {(hasMore || loadingMore) && (
            <div className="mt-4 flex flex-col items-center gap-2">
              <p className="text-ds-caption text-ds-text-3">
                Mostrando {contacts.length} de {listTotal}
              </p>
              <Button
                variant="outline"
                className="h-10 sm:h-9 min-w-[160px]"
                disabled={loadingMore || loading}
                onClick={handleLoadMore}
              >
                {loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Cargar más
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
