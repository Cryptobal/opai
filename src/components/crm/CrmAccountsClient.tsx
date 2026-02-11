/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useEffect, useMemo, useState } from "react";
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
import Link from "next/link";
import { Loader2, Plus, Building2, Users, ChevronRight, Trash2, TrendingUp, Mail, Globe, CheckSquare, Square } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/opai/EmptyState";
import { CrmDates } from "@/components/crm/CrmDates";
import { CrmToolbar } from "./CrmToolbar";
import type { ViewMode } from "./ViewToggle";
import { toast } from "sonner";

type AccountFormState = {
  name: string;
  rut: string;
  legalName: string;
  legalRepresentativeName: string;
  legalRepresentativeRut: string;
  segment: string;
  industry: string;
  website: string;
  type: "prospect" | "client";
};

type AccountRow = {
  id: string;
  name: string;
  rut?: string | null;
  legalName?: string | null;
  legalRepresentativeName?: string | null;
  legalRepresentativeRut?: string | null;
  segment?: string | null;
  industry?: string | null;
  website?: string | null;
  type: "prospect" | "client";
  status: string;
  createdAt: string;
  updatedAt?: string | null;
  _count?: {
    contacts: number;
    deals: number;
  };
};

const DEFAULT_FORM: AccountFormState = {
  name: "",
  rut: "",
  legalName: "",
  legalRepresentativeName: "",
  legalRepresentativeRut: "",
  segment: "",
  industry: "",
  website: "",
  type: "prospect",
};

export function CrmAccountsClient({ initialAccounts }: { initialAccounts: AccountRow[] }) {
  const [accounts, setAccounts] = useState<AccountRow[]>(initialAccounts);
  const [form, setForm] = useState<AccountFormState>(DEFAULT_FORM);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<"all" | "prospect" | "client">("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("list");
  const [sort, setSort] = useState("newest");
  const [industries, setIndustries] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetch("/api/crm/industries?active=true")
      .then((r) => r.json())
      .then((res) => res.success && setIndustries(res.data || []))
      .catch(() => {});
  }, []);

  const inputClassName =
    "bg-background text-foreground placeholder:text-muted-foreground border-input focus-visible:ring-ring";
  const selectClassName =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  const filteredAccounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = accounts.filter((a) => {
      if (typeFilter !== "all" && a.type !== typeFilter) return false;
      if (q && !`${a.name} ${a.rut || ""} ${a.industry || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });

    result = [...result].sort((a, b) => {
      switch (sort) {
        case "oldest":
          return (a.createdAt || "").localeCompare(b.createdAt || "");
        case "az":
          return a.name.localeCompare(b.name);
        case "za":
          return b.name.localeCompare(a.name);
        case "newest":
        default:
          return (b.createdAt || "").localeCompare(a.createdAt || "");
      }
    });

    return result;
  }, [accounts, typeFilter, search, sort]);

  const counts = useMemo(() => {
    const prospects = accounts.filter((a) => a.type === "prospect").length;
    const clients = accounts.filter((a) => a.type === "client").length;
    return { prospects, clients, total: accounts.length };
  }, [accounts]);

  const updateForm = (key: keyof AccountFormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: "" });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredAccounts.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredAccounts.map((a) => a.id)));
  };
  const clearSelection = () => setSelectedIds(new Set());

  const deleteAccount = async (id: string) => {
    try {
      const res = await fetch(`/api/crm/accounts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setAccounts((prev) => prev.filter((a) => a.id !== id));
      setDeleteConfirm({ open: false, id: "" });
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
      toast.success("Cuenta eliminada");
    } catch {
      toast.error("No se pudo eliminar");
    }
  };

  const bulkDeleteAccounts = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkDeleting(true);
    try {
      let ok = 0;
      for (const id of ids) {
        const res = await fetch(`/api/crm/accounts/${id}`, { method: "DELETE" });
        if (res.ok) ok++;
      }
      setAccounts((prev) => prev.filter((a) => !ids.includes(a.id)));
      setSelectedIds(new Set());
      setBulkDeleteConfirm(false);
      toast.success(ok === ids.length ? `${ok} cuenta${ok > 1 ? "s" : ""} eliminada${ok > 1 ? "s" : ""}` : `Eliminadas ${ok} de ${ids.length}`);
    } catch {
      toast.error("Error al eliminar");
    } finally {
      setBulkDeleting(false);
    }
  };

  const createAccount = async () => {
    if (!form.name.trim()) {
      toast.error("El nombre es obligatorio.");
      return;
    }
    setCreating(true);
    try {
      const response = await fetch("/api/crm/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Error creando cuenta");
      }
      setAccounts((prev) => [
        { ...payload.data, _count: { contacts: 0, deals: 0 } },
        ...prev,
      ]);
      setForm(DEFAULT_FORM);
      setOpen(false);
      toast.success(
        form.type === "prospect"
          ? "Prospecto creado exitosamente"
          : "Cliente creado exitosamente"
      );
    } catch (error) {
      console.error(error);
      toast.error("No se pudo crear la cuenta.");
    } finally {
      setCreating(false);
    }
  };

  const typeFilters = [
    { key: "all" as const, label: "Todos", count: counts.total },
    { key: "prospect" as const, label: "Prospectos", count: counts.prospects },
    { key: "client" as const, label: "Clientes", count: counts.clients },
  ];

  return (
    <div className={`space-y-4 ${selectedIds.size > 0 ? "pb-24" : ""}`}>
      {/* ── Toolbar ── */}
      <CrmToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por nombre, RUT o industria..."
        filters={typeFilters}
        activeFilter={typeFilter}
        onFilterChange={(k) => setTypeFilter(k as "all" | "prospect" | "client")}
        activeSort={sort}
        onSortChange={setSort}
        viewModes={["list", "cards"]}
        activeView={view}
        onViewChange={(v) => setView(v as ViewMode)}
        selectAll={{
          checked: filteredAccounts.length > 0 && selectedIds.size === filteredAccounts.length,
          onToggle: toggleSelectAll,
          show: filteredAccounts.length > 0,
        }}
        actionSlot={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="icon" variant="secondary" className="h-9 w-9 shrink-0">
                <Plus className="h-4 w-4" />
                <span className="sr-only">Nueva cuenta</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Nueva cuenta</DialogTitle>
                <DialogDescription>
                  Registra un prospecto o cliente.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label>Tipo</Label>
                  <select
                    className={selectClassName}
                    value={form.type}
                    onChange={(event) => updateForm("type", event.target.value)}
                  >
                    <option value="prospect">Prospecto (en negociación)</option>
                    <option value="client">Cliente (contrato vigente)</option>
                  </select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Nombre</Label>
                  <Input
                    value={form.name}
                    onChange={(event) => updateForm("name", event.target.value)}
                    placeholder="Nombre de la empresa"
                    className={inputClassName}
                  />
                </div>
                <div className="space-y-2">
                  <Label>RUT</Label>
                  <Input
                    value={form.rut}
                    onChange={(event) => updateForm("rut", event.target.value)}
                    placeholder="76.123.456-7"
                    className={inputClassName}
                  />
                </div>
                <div className="space-y-2">
                  <Label>RUT representante legal</Label>
                  <Input
                    value={form.legalRepresentativeRut}
                    onChange={(event) => updateForm("legalRepresentativeRut", event.target.value)}
                    placeholder="12.345.678-9"
                    className={inputClassName}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Razón social</Label>
                  <Input
                    value={form.legalName}
                    onChange={(event) => updateForm("legalName", event.target.value)}
                    placeholder="Empresa SpA / Ltda / S.A."
                    className={inputClassName}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Representante legal</Label>
                  <Input
                    value={form.legalRepresentativeName}
                    onChange={(event) => updateForm("legalRepresentativeName", event.target.value)}
                    placeholder="Nombre completo"
                    className={inputClassName}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Segmento</Label>
                  <Input
                    value={form.segment}
                    onChange={(event) => updateForm("segment", event.target.value)}
                    placeholder="Corporativo"
                    className={inputClassName}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Industria</Label>
                  <select
                    className={selectClassName}
                    value={form.industry}
                    onChange={(event) => updateForm("industry", event.target.value)}
                  >
                    <option value="">Seleccionar industria</option>
                    {industries.map((i) => (
                      <option key={i.id} value={i.name}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Página web</Label>
                  <Input
                    value={form.website}
                    onChange={(event) => updateForm("website", event.target.value)}
                    placeholder="https://www.empresa.cl"
                    className={inputClassName}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={createAccount} disabled={creating}>
                  {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Guardar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {/* ── Account list ── */}
      <Card>
        <CardContent className="pt-5">
          {filteredAccounts.length === 0 ? (
            <EmptyState
              icon={<Building2 className="h-8 w-8" />}
              title="Sin cuentas"
              description={
                search || typeFilter !== "all"
                  ? "No hay cuentas para los filtros seleccionados."
                  : "No hay cuentas registradas todavía."
              }
              compact
            />
          ) : view === "list" ? (
            <div className="space-y-2">
              {filteredAccounts.map((account) => {
                const selected = selectedIds.has(account.id);
                return (
                  <div
                    key={account.id}
                    className={`flex items-center gap-2 rounded-lg border p-3 sm:p-4 transition-colors sm:items-center sm:justify-between group ${selected ? "border-primary/50 bg-primary/5" : "hover:bg-accent/30"}`}
                  >
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSelection(account.id); }}
                      className="shrink-0 p-1 rounded text-muted-foreground hover:text-foreground"
                      aria-label={selected ? "Quitar de selección" : "Seleccionar"}
                    >
                      {selected ? <CheckSquare className="h-5 w-5 text-primary" /> : <Square className="h-5 w-5" />}
                    </button>
                    <Link
                      href={`/crm/accounts/${account.id}`}
                      className="flex flex-1 flex-col gap-2 min-w-0 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex flex-1 items-start gap-3 min-w-0">
                        <div
                          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                            account.type === "client"
                              ? "bg-emerald-500/10 text-emerald-400"
                              : "bg-amber-500/10 text-amber-400"
                          }`}
                        >
                          {account.type === "client" ? <Building2 className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm">{account.name}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {account.rut || "Sin RUT"} · {account.industry || "Sin industria"}
                          </p>
                          {account.legalRepresentativeName && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              Rep. legal: {account.legalRepresentativeName}
                              {account.legalRepresentativeRut ? ` (${account.legalRepresentativeRut})` : ""}
                            </p>
                          )}
                          {account.website && (
                            <a href={account.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 mt-1 text-xs text-primary hover:underline truncate max-w-[200px]" onClick={(e) => e.stopPropagation()}>
                              <Globe className="h-3 w-3 shrink-0" />
                              {account.website}
                            </a>
                          )}
                          <CrmDates createdAt={account.createdAt} updatedAt={account.updatedAt} className="mt-0.5" />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className={account.type === "client" ? "border-emerald-500/30 text-emerald-400" : "border-amber-500/30 text-amber-400"}>
                          {account.type === "client" ? "Cliente" : "Prospecto"}
                        </Badge>
                        <Badge variant="outline">{account._count?.contacts ?? 0} contactos</Badge>
                        <Badge variant="outline">{account._count?.deals ?? 0} negocios</Badge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 hidden sm:block" />
                      </div>
                    </Link>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredAccounts.map((account) => {
                const selected = selectedIds.has(account.id);
                return (
                  <div
                    key={account.id}
                    className={`rounded-lg border p-4 transition-colors hover:border-primary/30 group space-y-3 ${selected ? "border-primary/50 bg-primary/5" : "hover:bg-accent/30"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSelection(account.id); }}
                        className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground"
                        aria-label={selected ? "Quitar de selección" : "Seleccionar"}
                      >
                        {selected ? <CheckSquare className="h-5 w-5 text-primary" /> : <Square className="h-5 w-5" />}
                      </button>
                      <Link href={`/crm/accounts/${account.id}`} className="flex-1 min-w-0">
                        <div className="flex items-center gap-2.5">
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${account.type === "client" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
                            {account.type === "client" ? <Building2 className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm group-hover:text-primary transition-colors">{account.name}</p>
                            <p className="text-[11px] text-muted-foreground">{account.industry || "Sin industria"}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap mt-2">
                          <Badge variant="outline" className={`text-[10px] ${account.type === "client" ? "border-emerald-500/30 text-emerald-400" : "border-amber-500/30 text-amber-400"}`}>
                            {account.type === "client" ? "Cliente" : "Prospecto"}
                          </Badge>
                          <span className="flex items-center gap-1"><Users className="h-3 w-3" />{account._count?.contacts ?? 0}</span>
                          <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" />{account._count?.deals ?? 0}</span>
                          {account.rut && <span>{account.rut}</span>}
                          {account.website && (
                            <a href={account.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline truncate max-w-[140px]" onClick={(e) => e.stopPropagation()}>
                              <Globe className="h-3 w-3 shrink-0" />
                              Web
                            </a>
                          )}
                        </div>
                      </Link>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Barra eliminación masiva */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card px-4 py-3 shadow-lg sm:left-[var(--sidebar-width,280px)]">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
            <span className="text-sm font-medium">
              {selectedIds.size} cuenta{selectedIds.size !== 1 ? "s" : ""} seleccionada{selectedIds.size !== 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={clearSelection}>
                Deseleccionar
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setBulkDeleteConfirm(true)} disabled={bulkDeleting}>
                {bulkDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={bulkDeleteConfirm}
        onOpenChange={setBulkDeleteConfirm}
        title="Eliminar cuentas seleccionadas"
        description="Se eliminarán también contactos, negocios e instalaciones asociados. Esta acción no se puede deshacer."
        onConfirm={bulkDeleteAccounts}
      />

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(v) => setDeleteConfirm({ ...deleteConfirm, open: v })}
        title="Eliminar cuenta"
        description="Se eliminarán también contactos, negocios e instalaciones asociados. Esta acción no se puede deshacer."
        onConfirm={() => deleteAccount(deleteConfirm.id)}
      />
    </div>
  );
}
