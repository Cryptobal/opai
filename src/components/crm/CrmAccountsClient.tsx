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
import { Loader2, Plus, Building2, Users, ChevronRight, Trash2, Search, TrendingUp, Mail, Globe } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/opai/EmptyState";
import { CrmDates } from "@/components/crm/CrmDates";
import { ViewToggle, type ViewMode } from "./ViewToggle";
import { toast } from "sonner";

type AccountFormState = {
  name: string;
  rut: string;
  segment: string;
  industry: string;
  website: string;
  type: "prospect" | "client";
};

type AccountRow = {
  id: string;
  name: string;
  rut?: string | null;
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
    return accounts.filter((a) => {
      if (typeFilter !== "all" && a.type !== typeFilter) return false;
      if (q && !`${a.name} ${a.rut || ""} ${a.industry || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [accounts, typeFilter, search]);

  const counts = useMemo(() => {
    const prospects = accounts.filter((a) => a.type === "prospect").length;
    const clients = accounts.filter((a) => a.type === "client").length;
    return { prospects, clients, total: accounts.length };
  }, [accounts]);

  const updateForm = (key: keyof AccountFormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: "" });

  const deleteAccount = async (id: string) => {
    try {
      const res = await fetch(`/api/crm/accounts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setAccounts((prev) => prev.filter((a) => a.id !== id));
      setDeleteConfirm({ open: false, id: "" });
      toast.success("Cuenta eliminada");
    } catch {
      toast.error("No se pudo eliminar");
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
    { key: "prospect" as const, label: "Prospectos", count: counts.prospects, icon: Users },
    { key: "client" as const, label: "Clientes", count: counts.clients, icon: Building2 },
  ];

  return (
    <div className="space-y-4">
      {/* ── Search + Filters + Create ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, RUT o industria..."
            className="pl-9 h-9 bg-background text-foreground border-input"
          />
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle view={view} onChange={setView} />
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
            {typeFilters.map((opt) => {
              const Icon = opt.icon;
              const isActive = typeFilter === opt.key;
              // Color-coded pills for type
              let activeClass = "bg-primary/15 text-primary border border-primary/30";
              if (opt.key === "prospect" && isActive) activeClass = "bg-amber-500/15 text-amber-400 border border-amber-500/30";
              if (opt.key === "client" && isActive) activeClass = "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30";

              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setTypeFilter(opt.key)}
                  className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors shrink-0 ${
                    isActive
                      ? activeClass
                      : "text-muted-foreground hover:text-foreground border border-transparent"
                  }`}
                >
                  <span className="flex items-center gap-1">
                    {Icon && <Icon className="h-3 w-3" />}
                    {opt.label} ({opt.count})
                  </span>
                </button>
              );
            })}
          </div>
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
        </div>
      </div>

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
              {filteredAccounts.map((account) => (
                <Link
                  key={account.id}
                  href={`/crm/accounts/${account.id}`}
                  className="flex flex-col gap-2 rounded-lg border p-3 sm:p-4 transition-colors hover:bg-accent/30 sm:flex-row sm:items-center sm:justify-between group"
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
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredAccounts.map((account) => (
                <Link
                  key={account.id}
                  href={`/crm/accounts/${account.id}`}
                  className="rounded-lg border p-4 transition-colors hover:bg-accent/30 hover:border-primary/30 group space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${account.type === "client" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
                        {account.type === "client" ? <Building2 className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm group-hover:text-primary transition-colors">{account.name}</p>
                        <p className="text-[11px] text-muted-foreground">{account.industry || "Sin industria"}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${account.type === "client" ? "border-emerald-500/30 text-emerald-400" : "border-amber-500/30 text-amber-400"}`}>
                      {account.type === "client" ? "Cliente" : "Prospecto"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
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
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
