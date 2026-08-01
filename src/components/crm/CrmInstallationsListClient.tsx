/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Search, ChevronRight, Plus, Loader2, Moon, ShieldAlert, Users, MessageSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Avatar, EmptyState, EntityRow, Spinner, Tag, tintFromId, tintClasses } from "@/components/opai-ds";
import { CrmEntityCard, type EntityCardChip } from "./cards/CrmEntityCard";
import { cn } from "@/lib/utils";
import { AddressAutocomplete, type AddressResult } from "@/components/ui/AddressAutocomplete";
import { MapsUrlPasteInput } from "@/components/ui/MapsUrlPasteInput";
import { ViewToggle, type ViewMode } from "@/components/shared/ViewToggle";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { toast } from "sonner";
import { useUnreadNoteIds } from "@/lib/hooks";
import { INSTALLATION_LIST_DEFAULT_PAGE_SIZE } from "@/lib/crm/list-page-sizes";

export type InstallationRow = {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  commune?: string | null;
  lat?: number | null;
  lng?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  status?: "prospect" | "active" | "inactive";
  nocturnoEnabled?: boolean;
  totalSlots?: number;
  assignedGuards?: number;
  account?: { id: string; name: string; type?: "prospect" | "client"; status?: string; isActive?: boolean } | null;
};

type AccountOption = { id: string; name: string };

type InstallationCounts = {
  all: number;
  active: number;
  inactive: number;
};

type StatusFilter = "all" | "active" | "inactive";

type FormState = {
  accountId: string;
  name: string;
  address: string;
  city: string;
  commune: string;
  lat: number | null;
  lng: number | null;
  notes: string;
};

const DEFAULT_FORM: FormState = {
  accountId: "",
  name: "",
  address: "",
  city: "",
  commune: "",
  lat: null,
  lng: null,
  notes: "",
};

type CrmInstallationsListClientProps = {
  initialInstallations: InstallationRow[];
  initialCounts: InstallationCounts;
  initialHasMore: boolean;
  initialTotal: number;
  /** Opcional; si no viene, se lazy-load al abrir el diálogo de crear. */
  accounts?: AccountOption[];
};

export function CrmInstallationsListClient({
  initialInstallations,
  initialCounts,
  initialHasMore,
  initialTotal,
  accounts = [],
}: CrmInstallationsListClientProps) {
  const [installations, setInstallations] = useState<InstallationRow[]>(initialInstallations);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [view, setView] = useState<ViewMode>("cards");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const unreadNoteIds = useUnreadNoteIds("INSTALLATION");

  const [counts, setCounts] = useState<InstallationCounts>(initialCounts);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [listTotal, setListTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const initialLoadDone = useRef(false);
  const skipFirstFetch = useRef(true);

  // Create form state
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [creating, setCreating] = useState(false);
  const [accountOptions, setAccountOptions] = useState<AccountOption[]>(accounts);
  const [accountsLoaded, setAccountsLoaded] = useState(accounts.length > 0);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  const inputCn = "bg-background text-foreground placeholder:text-muted-foreground border-input focus-visible:ring-ring";

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const filterKey = useMemo(
    () => JSON.stringify({ statusFilter, debouncedSearch }),
    [statusFilter, debouncedSearch],
  );

  const fetchInstallations = useCallback(
    async (pageNum: number, replace: boolean) => {
      if (replace) setLoading(true);
      else setLoadingMore(true);
      try {
        const params = new URLSearchParams({
          page: String(pageNum),
          limit: String(INSTALLATION_LIST_DEFAULT_PAGE_SIZE),
          status: statusFilter,
          sort: "az",
          includeCounts: "true",
        });
        if (debouncedSearch) params.set("search", debouncedSearch);

        const res = await fetch(`/api/crm/installations?${params}`);
        const payload = await res.json();
        if (!payload.success) throw new Error(payload.error || "Error al cargar instalaciones");

        const incoming: InstallationRow[] = payload.data ?? [];
        setInstallations((prev) => (replace ? incoming : [...prev, ...incoming]));
        setPage(pageNum);
        setHasMore(Boolean(payload.meta?.hasMore));
        setListTotal(payload.meta?.total ?? incoming.length);
        if (payload.meta?.counts) setCounts(payload.meta.counts);
      } catch (error) {
        console.error(error);
        toast.error("No se pudieron cargar las instalaciones.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
        initialLoadDone.current = true;
      }
    },
    [statusFilter, debouncedSearch],
  );

  useEffect(() => {
    if (skipFirstFetch.current) {
      skipFirstFetch.current = false;
      // SSR ya trajo status=active sin búsqueda.
      if (statusFilter === "active" && !debouncedSearch) {
        initialLoadDone.current = true;
        return;
      }
    }
    void fetchInstallations(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  const handleLoadMore = useCallback(() => {
    if (loadingMore || !hasMore || loading) return;
    void fetchInstallations(page + 1, false);
  }, [fetchInstallations, page, loadingMore, hasMore, loading]);

  useEffect(() => {
    if (!open) return;
    setForm(DEFAULT_FORM);
    if (accountsLoaded) return;

    let cancelled = false;
    setLoadingAccounts(true);
    fetch("/api/crm/accounts?limit=100&sort=az")
      .then((r) => r.json())
      .then((payload) => {
        if (cancelled || !payload.success) return;
        const rows = (payload.data ?? []) as Array<{ id: string; name: string }>;
        setAccountOptions(rows.map((a) => ({ id: a.id, name: a.name })));
        setAccountsLoaded(true);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingAccounts(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, accountsLoaded]);

  const handleAddressChange = (result: AddressResult) => {
    setForm((prev) => ({
      ...prev,
      address: result.address,
      city: result.city || prev.city,
      commune: result.commune || prev.commune,
      lat: result.lat,
      lng: result.lng,
    }));
  };

  const createInstallation = async () => {
    if (!form.name.trim()) {
      toast.error("El nombre es obligatorio.");
      return;
    }
    if (!form.accountId) {
      toast.error("Selecciona una cuenta.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/crm/installations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          lat: form.lat ?? undefined,
          lng: form.lng ?? undefined,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Error al crear instalación");
      toast.success("Instalación creada");
      setOpen(false);
      setForm(DEFAULT_FORM);
      await fetchInstallations(1, true);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "No se pudo crear la instalación.";
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  const statusFilters = [
    { key: "all" as const, label: "Todas", count: counts.all },
    { key: "active" as const, label: "Activas", count: counts.active },
    { key: "inactive" as const, label: "Inactivas", count: counts.inactive },
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
            placeholder="Buscar por nombre, dirección o cuenta..."
            className={`pl-9 h-9 ${inputCn}`}
          />
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle view={view} onChange={setView} />
          {/* Status filter */}
          <div className="flex gap-1 shrink-0">
            {statusFilters.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setStatusFilter(opt.key)}
                className={cn(
                  "whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors shrink-0",
                  statusFilter === opt.key
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "text-muted-foreground hover:text-foreground border border-border"
                )}
              >
                {opt.label}
                <span className="ml-1 tabular-nums opacity-70">{opt.count}</span>
              </button>
            ))}
          </div>
          {/* ── Botón + crear instalación ── */}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="icon" variant="secondary" className="h-9 w-9 shrink-0">
                <Plus className="h-4 w-4" />
                <span className="sr-only">Nueva instalación</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Nueva instalación</DialogTitle>
                <DialogDescription>
                  Crea una nueva sede o ubicación asociada a una cuenta.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Cuenta *</Label>
                  <SearchableSelect
                    value={form.accountId}
                    options={accountOptions.map((acc) => ({ id: acc.id, label: acc.name }))}
                    placeholder={loadingAccounts ? "Cargando cuentas..." : "Selecciona cuenta"}
                    disabled={creating || loadingAccounts}
                    onChange={(val) => setForm((p) => ({ ...p, accountId: val }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nombre *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Ej: Planta Norte, Bodega Central..."
                    className={inputCn}
                    disabled={creating}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Dirección</Label>
                  <AddressAutocomplete
                    value={form.address}
                    onChange={handleAddressChange}
                    placeholder="Buscar dirección en Google Maps..."
                    showMap={true}
                  />
                  <MapsUrlPasteInput onResolve={handleAddressChange} disabled={creating} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Ciudad</Label>
                    <Input
                      value={form.city}
                      onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                      placeholder="Santiago"
                      className={`${inputCn} text-sm`}
                      disabled={creating}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Comuna</Label>
                    <Input
                      value={form.commune}
                      onChange={(e) => setForm((p) => ({ ...p, commune: e.target.value }))}
                      placeholder="Providencia"
                      className={`${inputCn} text-sm`}
                      disabled={creating}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notas</Label>
                  <Input
                    value={form.notes}
                    onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                    placeholder="Observaciones..."
                    className={inputCn}
                    disabled={creating}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={creating}>
                  Cancelar
                </Button>
                <Button onClick={createInstallation} disabled={creating} className="bg-status-ok hover:brightness-110">
                  {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Crear
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* ── Installation list ── */}
      <Card>
        <CardContent className="pt-5">
          {loading && installations.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Spinner />
            </div>
          ) : installations.length === 0 ? (
            <EmptyState
              icon={MapPin}
              title="Sin instalaciones"
              description={
                search || statusFilter !== "all"
                  ? "No hay instalaciones para los filtros seleccionados."
                  : "No hay instalaciones registradas. Usa el botón + para crear una."
              }
              compact
            />
          ) : view === "list" ? (
            <div className={`space-y-1 ${loading ? "opacity-60" : ""}`}>
              {installations.map((inst) => {
                const tint = tintFromId(inst.account?.id ?? inst.id);
                const tc = tintClasses(tint);
                const statusLabel =
                  inst.status === "active" ? "Activa" :
                  inst.status === "inactive" ? "Inactiva" : "Prospecto";
                const statusVariant =
                  inst.status === "active" ? "ok" as const :
                  inst.status === "inactive" ? "warn" as const :
                  "neutral" as const;
                const addressLine = [
                  inst.address,
                  [inst.commune, inst.city].filter(Boolean).join(", ") || null,
                ].filter(Boolean).join(" · ");

                return (
                  <EntityRow
                    key={inst.id}
                    href={`/crm/installations/${inst.id}`}
                    tint={tint}
                    avatar={
                      <Avatar
                        variant="tint"
                        tint={tint}
                        shape="square"
                        size="sm"
                        name={inst.name}
                      />
                    }
                    title={inst.name}
                    titleAside={
                      <>
                        {inst.account && (
                          <span
                            className={cn(
                              "inline-flex items-center h-5 px-2 rounded-full text-ds-caption font-medium truncate max-w-[140px]",
                              tc.bg,
                              tc.fg,
                            )}
                            title={inst.account.name}
                          >
                            {inst.account.name}
                          </span>
                        )}
                        {unreadNoteIds.has(inst.id) && (
                          <span className="relative shrink-0" title="Notas no leídas">
                            <MessageSquare className="h-3.5 w-3.5 text-ds-text-3" />
                            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-destructive" />
                          </span>
                        )}
                        <Tag variant={statusVariant} size="sm" dot>
                          {statusLabel}
                        </Tag>
                        {inst.nocturnoEnabled !== false && (
                          <span title="Control nocturno activo">
                            <Moon className="h-3.5 w-3.5 text-status-info-fg" />
                          </span>
                        )}
                      </>
                    }
                    subtitle={
                      addressLine ? (
                        <span className="inline-flex items-center gap-1 min-w-0">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{addressLine}</span>
                        </span>
                      ) : undefined
                    }
                    meta={
                      <>
                        {inst.status === "active" && (inst.totalSlots ?? 0) > 0 ? (
                          <>
                            <span
                              className="inline-flex items-center gap-1 text-ds-caption tabular-nums text-ds-text-3"
                              title="Guardias asignados / Slots requeridos"
                            >
                              <Users className="h-3 w-3" />
                              {inst.assignedGuards ?? 0}/{inst.totalSlots}
                            </span>
                            {(inst.totalSlots! - (inst.assignedGuards ?? 0)) > 0 && (
                              <Tag variant="danger" size="sm">
                                {inst.totalSlots! - (inst.assignedGuards ?? 0)} PPC
                              </Tag>
                            )}
                          </>
                        ) : inst.status === "active" && (inst.totalSlots ?? 0) === 0 ? (
                          <Tag variant="warn" size="sm">Sin puestos</Tag>
                        ) : null}
                        <ChevronRight className="h-4 w-4 text-ds-text-4 transition-transform group-hover:translate-x-0.5" />
                      </>
                    }
                  />
                );
              })}
            </div>
          ) : (
            <div className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-3 min-w-0 ${loading ? "opacity-60" : ""}`}>
              {installations.map((inst) => {
                const ppc = Math.max(0, (inst.totalSlots ?? 0) - (inst.assignedGuards ?? 0));
                const chips: EntityCardChip[] = [
                  {
                    label: inst.status === "active" ? "Activa" : inst.status === "inactive" ? "Inactiva" : "Prospecto",
                    variant: inst.status === "active" ? "ok" : inst.status === "inactive" ? "warn" : "neutral",
                    dot: true,
                  },
                ];
                if (inst.status === "active" && (inst.totalSlots ?? 0) > 0) {
                  chips.push({
                    label: `${inst.assignedGuards ?? 0}/${inst.totalSlots} guardias`,
                    variant: ppc > 0 ? "warn" : "ok",
                    icon: Users,
                  });
                  if (ppc > 0) chips.push({ label: `${ppc} PPC`, variant: "danger", icon: ShieldAlert });
                } else if (inst.status === "active") {
                  chips.push({ label: "Sin puestos", variant: "warn" });
                }
                const addressLine = [
                  inst.address,
                  [inst.commune, inst.city].filter(Boolean).join(", ") || null,
                ].filter(Boolean).join(" · ");
                return (
                  <CrmEntityCard
                    key={inst.id}
                    href={`/crm/installations/${inst.id}`}
                    entityId={inst.account?.id ?? inst.id}
                    title={inst.name}
                    titleAdornment={
                      <>
                        {unreadNoteIds.has(inst.id) && (
                          <span className="relative shrink-0" title="Notas no leídas">
                            <MessageSquare className="h-3.5 w-3.5 text-ds-text-3" />
                            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-destructive" />
                          </span>
                        )}
                        {inst.nocturnoEnabled !== false && (
                          <span title="Control nocturno activo" className="shrink-0">
                            <Moon className="h-3.5 w-3.5 text-status-info-fg" />
                          </span>
                        )}
                      </>
                    }
                    meta={`${inst.account?.name ?? "Sin cuenta"}${addressLine ? ` · ${addressLine}` : ""}`}
                    avatar={{ icon: MapPin, shape: "square" }}
                    chips={chips}
                  />
                );
              })}
            </div>
          )}
          {(hasMore || loadingMore) && (
            <div className="mt-4 flex flex-col items-center gap-2">
              <p className="text-ds-caption text-ds-text-3">
                Mostrando {installations.length} de {listTotal}
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
