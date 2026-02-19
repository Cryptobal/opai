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
import { Loader2, Plus, ChevronRight, Globe } from "lucide-react";
import { CRM_MODULES } from "./CrmModuleIcons";
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

const ACCOUNT_LOGO_PREFIX = "[[ACCOUNT_LOGO_URL:";
const ACCOUNT_LOGO_SUFFIX = "]]";

function extractAccountLogoUrl(notes?: string | null): string | null {
  if (!notes) return null;
  const start = notes.indexOf(ACCOUNT_LOGO_PREFIX);
  if (start === -1) return null;
  const end = notes.indexOf(ACCOUNT_LOGO_SUFFIX, start);
  if (end === -1) return null;
  const raw = notes.slice(start + ACCOUNT_LOGO_PREFIX.length, end).trim();
  return raw || null;
}

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
  notes?: string | null;
  type: "prospect" | "client";
  status: "prospect" | "client_active" | "client_inactive" | string;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string | null;
  _count?: {
    contacts: number;
    deals: number;
  };
};

function getLifecycle(account: Pick<AccountRow, "status" | "type" | "isActive">) {
  if (account.status === "prospect") return "prospect";
  if (account.status === "client_active") return "client_active";
  if (account.status === "client_inactive") return "client_inactive";
  if (account.type === "prospect") return "prospect";
  return account.isActive ? "client_active" : "client_inactive";
}

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
  const [view, setView] = useState<ViewMode>("cards");
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
      const lifecycle = getLifecycle(a);
      if (typeFilter === "prospect" && lifecycle !== "prospect") return false;
      if (typeFilter === "client" && lifecycle === "prospect") return false;
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
    const prospects = accounts.filter((a) => getLifecycle(a) === "prospect").length;
    const clients = accounts.filter((a) => getLifecycle(a) !== "prospect").length;
    return { prospects, clients, total: accounts.length };
  }, [accounts]);

  const updateForm = (key: keyof AccountFormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
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
          : "Cliente creado como inactivo"
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
    <div className="space-y-4">
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
              icon={<CRM_MODULES.accounts.icon className="h-8 w-8" />}
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
                const lifecycle = getLifecycle(account);
                const statusLabel = lifecycle === "prospect" ? "Prospecto" : lifecycle === "client_active" ? "Cliente" : "Cliente inactivo";
                return (
                  <div
                    key={account.id}
                    className="rounded-lg border transition-colors group hover:bg-accent/30"
                  >
                    <div className="flex items-center gap-2 p-3 sm:p-4">
                      <Link
                        href={`/crm/accounts/${account.id}`}
                        className="flex flex-1 flex-col gap-2 min-w-0 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex flex-1 items-start gap-3 min-w-0">
                          {extractAccountLogoUrl(account.notes) ? (
                            <img
                              src={extractAccountLogoUrl(account.notes)!}
                              alt=""
                              className="mt-0.5 h-8 w-8 shrink-0 rounded-lg border border-border bg-background object-contain"
                            />
                          ) : (
                            <div
                              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${CRM_MODULES.accounts.color}`}
                            >
                              <CRM_MODULES.accounts.icon className="h-4 w-4" />
                            </div>
                          )}
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
                          <Badge
                            variant="outline"
                            className={
                              lifecycle === "prospect"
                                ? "border-amber-500/30 text-amber-400"
                                : lifecycle === "client_active"
                                ? "border-emerald-500/30 text-emerald-400"
                                : "border-rose-500/30 text-rose-400"
                            }
                          >
                            {statusLabel}
                          </Badge>
                          <Badge variant="outline">{account._count?.contacts ?? 0} contactos</Badge>
                          <Badge variant="outline">{account._count?.deals ?? 0} negocios</Badge>
                          <ChevronRight className="h-4 w-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 hidden sm:block" />
                        </div>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 min-w-0">
              {filteredAccounts.map((account) => {
                const lifecycle = getLifecycle(account);
                const statusLabel = lifecycle === "prospect" ? "Prospecto" : lifecycle === "client_active" ? "Cliente" : "Cliente inactivo";
                return (
                  <div
                    key={account.id}
                    className="rounded-lg border transition-colors hover:border-primary/30 group hover:bg-accent/30 min-w-0 overflow-hidden"
                  >
                    <div className="flex items-start justify-between gap-2 p-4">
                      <Link href={`/crm/accounts/${account.id}`} className="flex flex-1 min-w-0">
                        <div className="flex items-center gap-2.5">
                          {extractAccountLogoUrl(account.notes) ? (
                            <img
                              src={extractAccountLogoUrl(account.notes)!}
                              alt=""
                              className="h-9 w-9 shrink-0 rounded-lg border border-border bg-background object-contain"
                            />
                          ) : (
                            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${CRM_MODULES.accounts.color}`}>
                              <CRM_MODULES.accounts.icon className="h-4 w-4" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-sm group-hover:text-primary transition-colors">{account.name}</p>
                            <p className="text-[11px] text-muted-foreground">{account.industry || "Sin industria"}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap mt-2">
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              lifecycle === "prospect"
                                ? "border-amber-500/30 text-amber-400"
                                : lifecycle === "client_active"
                                ? "border-emerald-500/30 text-emerald-400"
                                : "border-rose-500/30 text-rose-400"
                            }`}
                          >
                            {statusLabel}
                          </Badge>
                          <span className="flex items-center gap-1"><CRM_MODULES.contacts.icon className="h-3 w-3" />{account._count?.contacts ?? 0}</span>
                          <span className="flex items-center gap-1"><CRM_MODULES.deals.icon className="h-3 w-3" />{account._count?.deals ?? 0}</span>
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
    </div>
  );
}
