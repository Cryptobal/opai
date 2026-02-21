"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, StatusBadge } from "@/components/opai";
import { Clock3, FileDown, Pencil, Plus, Search, Trash2 } from "lucide-react";

type RefuerzoItem = {
  id: string;
  installationId: string;
  accountId?: string | null;
  guardiaId: string;
  puestoId?: string | null;
  requestedByName?: string | null;
  requestChannel?: string | null;
  startAt: string;
  endAt: string;
  guardsCount: number;
  shiftType?: string | null;
  paymentCondition?: string | null;
  notes?: string | null;
  rateClp?: number | null;
  guardPaymentClp: number;
  estimatedTotalClp: number;
  status: "pendiente_aprobacion" | "rechazado" | "solicitado" | "en_curso" | "realizado" | "facturado";
  invoiceNumber?: string | null;
  installation: { id: string; name: string };
  account?: { id: string; name: string } | null;
  puesto?: { id: string; name: string } | null;
  guardia: {
    id: string;
    code?: string | null;
    persona: { firstName: string; lastName: string; rut?: string | null };
  };
  turnoExtra?: { id: string; status: string; amountClp: number; paidAt?: string | null } | null;
  ticket?: { id: string; code: string; status: string; approvalStatus?: string | null } | null;
};

type InstallationOption = {
  id: string;
  name: string;
  account?: { id: string; name: string } | null;
};

type GuardiaOption = {
  id: string;
  code?: string | null;
  lifecycleStatus?: string | null;
  persona: { firstName: string; lastName: string; rut?: string | null };
};

interface OpsRefuerzosClientProps {
  initialItems: RefuerzoItem[];
  defaultInstallationId?: string;
  canManageRefuerzos?: boolean;
  canDeleteRefuerzos?: boolean;
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDateTimeInputValue(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString("es-CL")}`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function sanitizeClpInput(value: string): string {
  return value.replace(/\D/g, "");
}

function formatClpInput(value: string): string {
  if (!value) return "";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  return numeric.toLocaleString("es-CL");
}

function sanitizeUfInput(value: string): string {
  const normalized = value.replace(",", ".").replace(/[^\d.]/g, "");
  const [intPart = "", ...decimals] = normalized.split(".");
  if (decimals.length === 0) return intPart;
  return `${intPart}.${decimals.join("").slice(0, 4)}`;
}

type SearchableOption = {
  id: string;
  label: string;
  description?: string;
  searchText?: string;
};

interface SearchableSelectProps {
  value: string;
  options: SearchableOption[];
  placeholder: string;
  emptyText?: string;
  disabled?: boolean;
  onChange: (id: string) => void;
}

function SearchableSelect({
  value,
  options,
  placeholder,
  emptyText = "Sin resultados",
  disabled,
  onChange,
}: SearchableSelectProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(() => options.find((opt) => opt.id === value) ?? null, [options, value]);

  useEffect(() => {
    if (!open) {
      setQuery(selected?.label ?? "");
    }
  }, [open, selected]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const filtered = useMemo(() => {
    const q = normalizeText(query);
    const ordered = [...options].sort((a, b) => a.label.localeCompare(b.label, "es"));
    if (!q) return ordered.slice(0, 60);

    const startsWith: SearchableOption[] = [];
    const includes: SearchableOption[] = [];
    for (const opt of ordered) {
      const search = normalizeText(opt.searchText ?? `${opt.label} ${opt.description ?? ""}`);
      if (search.startsWith(q)) startsWith.push(opt);
      else if (search.includes(q)) includes.push(opt);
    }
    return [...startsWith, ...includes].slice(0, 60);
  }, [options, query]);

  return (
    <div ref={boxRef} className="relative">
      <Input
        value={open ? query : (selected?.label ?? "")}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          setOpen(true);
          if (value) onChange("");
        }}
      />

      {open && !disabled && (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-md">
          {filtered.length === 0 ? (
            <div className="px-2 py-2 text-sm text-muted-foreground">{emptyText}</div>
          ) : (
            filtered.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className="w-full rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(opt.id);
                  setQuery(opt.label);
                  setOpen(false);
                }}
              >
                <div className="font-medium">{opt.label}</div>
                {opt.description ? (
                  <div className="text-xs text-muted-foreground">{opt.description}</div>
                ) : null}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function OpsRefuerzosClient({
  initialItems,
  defaultInstallationId,
  canManageRefuerzos = false,
  canDeleteRefuerzos = false,
}: OpsRefuerzosClientProps) {
  const [items, setItems] = useState<RefuerzoItem[]>(initialItems);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [pendingBillingOnly, setPendingBillingOnly] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailEditMode, setDetailEditMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [installations, setInstallations] = useState<InstallationOption[]>([]);
  const [puestos, setPuestos] = useState<Array<{ id: string; name: string }>>([]);
  const [guardias, setGuardias] = useState<GuardiaOption[]>([]);
  const [puestosLoading, setPuestosLoading] = useState(false);
  const [ufValue, setUfValue] = useState<number | null>(null);

  const [createForm, setCreateForm] = useState({
    installationId: defaultInstallationId ?? "",
    puestoId: "",
    guardiaId: "",
    requestedByName: "",
    requestChannel: "whatsapp",
    startAt: toDateTimeInputValue(),
    endAt: toDateTimeInputValue(new Date(Date.now() + 8 * 3_600_000)),
    guardsCount: "1",
    shiftType: "diurno",
    paymentCondition: "incluido_factura_mensual",
    guardPaymentClp: "",
    rateMode: "turno" as "turno" | "hora",
    rateCurrency: "clp" as "clp" | "uf",
    rateClp: "",
    rateUf: "",
    notes: "",
  });
  const [editForm, setEditForm] = useState({
    guardiaId: "",
    puestoId: "",
    startAt: toDateTimeInputValue(),
    endAt: toDateTimeInputValue(new Date(Date.now() + 8 * 3_600_000)),
    requestedByName: "",
    requestChannel: "whatsapp",
    guardPaymentClp: "",
    rateCurrency: "clp" as "clp" | "uf",
    rateClp: "",
    rateUf: "",
    notes: "",
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (pendingBillingOnly && row.status === "facturado") return false;
      if (q) {
        const haystack =
          `${row.installation.name} ${row.account?.name ?? ""} ${row.guardia.persona.firstName} ${row.guardia.persona.lastName} ${row.guardia.persona.rut ?? ""} ${row.requestedByName ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [items, pendingBillingOnly, search, statusFilter]);

  const selectedItem = useMemo(
    () => (selectedId ? items.find((item) => item.id === selectedId) ?? null : null),
    [items, selectedId]
  );

  const totals = useMemo(() => {
    const pending = filtered.filter((x) => x.status !== "facturado");
    return {
      count: filtered.length,
      amount: filtered.reduce((acc, row) => acc + toNumber(row.estimatedTotalClp), 0),
      pendingAmount: pending.reduce((acc, row) => acc + toNumber(row.estimatedTotalClp), 0),
    };
  }, [filtered]);

  async function loadAuxData() {
    try {
      const [instRes, guardsRes] = await Promise.all([
        fetch("/api/ops/instalaciones", { cache: "no-store" }),
        fetch("/api/personas/guardias?blacklisted=false", { cache: "no-store" }),
      ]);
      const instPayload = await instRes.json();
      const guardsPayload = await guardsRes.json();
      if (instPayload.success) setInstallations(instPayload.data);
      if (guardsPayload.success) {
        setGuardias(
          guardsPayload.data
            .filter((g: { lifecycleStatus?: string; isBlacklisted?: boolean }) => !g.isBlacklisted)
            .map((g: GuardiaOption) => g)
            .sort((a: GuardiaOption, b: GuardiaOption) =>
              `${a.persona.firstName} ${a.persona.lastName}`.localeCompare(`${b.persona.firstName} ${b.persona.lastName}`, "es")
            )
        );
      }
      try {
        const ufRes = await fetch("/api/fx/uf", { cache: "no-store" });
        const ufPayload = await ufRes.json();
        if (ufPayload?.success && Number.isFinite(Number(ufPayload.value))) {
          setUfValue(Number(ufPayload.value));
        }
      } catch {
        setUfValue(null);
      }
    } catch {
      toast.error("No se pudieron cargar instalaciones/guardias");
    }
  }

  useEffect(() => {
    if (!createOpen && !detailOpen) return;
    void loadAuxData();
  }, [createOpen, detailOpen]);

  useEffect(() => {
    if (!createForm.installationId) {
      setPuestos([]);
      return;
    }
    const run = async () => {
      setPuestosLoading(true);
      try {
        const res = await fetch(`/api/ops/puestos?installationId=${encodeURIComponent(createForm.installationId)}`, { cache: "no-store" });
        const payload = await res.json();
        if (payload.success) {
          setPuestos(payload.data.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
        } else {
          setPuestos([]);
        }
      } catch {
        setPuestos([]);
      } finally {
        setPuestosLoading(false);
      }
    };
    void run();
  }, [createForm.installationId]);

  const installationOptions = useMemo<SearchableOption[]>(
    () =>
      installations.map((inst) => ({
        id: inst.id,
        label: inst.name,
        description: inst.account?.name ?? "Sin cliente",
        searchText: `${inst.name} ${inst.account?.name ?? ""}`,
      })),
    [installations]
  );

  const puestoOptions = useMemo<SearchableOption[]>(
    () =>
      puestos.map((p) => ({
        id: p.id,
        label: p.name,
      })),
    [puestos]
  );

  const guardiaOptions = useMemo<SearchableOption[]>(
    () =>
      guardias.map((g) => ({
        id: g.id,
        label: `${g.persona.firstName} ${g.persona.lastName}`,
        description: [g.code ? `Cód. ${g.code}` : null, g.persona.rut ?? null, g.lifecycleStatus ?? null]
          .filter(Boolean)
          .join(" · "),
        searchText: `${g.persona.firstName} ${g.persona.lastName} ${g.persona.rut ?? ""} ${g.code ?? ""}`,
      })),
    [guardias]
  );

  const computedRateClp = useMemo(() => {
    if (createForm.rateCurrency === "uf") {
      const ufNumeric = Number(createForm.rateUf);
      if (!ufValue || !Number.isFinite(ufNumeric)) return "";
      return String(Math.round(ufNumeric * ufValue));
    }
    return createForm.rateClp;
  }, [createForm.rateCurrency, createForm.rateClp, createForm.rateUf, ufValue]);

  const displayedRateClp = useMemo(() => formatClpInput(computedRateClp), [computedRateClp]);
  const guardPaymentNumber = useMemo(() => Number(createForm.guardPaymentClp || 0), [createForm.guardPaymentClp]);
  const saleValueNumber = useMemo(() => Number(computedRateClp || 0), [computedRateClp]);
  const utilityAmount = useMemo(() => saleValueNumber - guardPaymentNumber, [saleValueNumber, guardPaymentNumber]);
  const utilityMargin = useMemo(
    () => (saleValueNumber > 0 ? (utilityAmount / saleValueNumber) * 100 : null),
    [saleValueNumber, utilityAmount]
  );

  const computedEditRateClp = useMemo(() => {
    if (editForm.rateCurrency === "uf") {
      const ufNumeric = Number(editForm.rateUf);
      if (!ufValue || !Number.isFinite(ufNumeric)) return "";
      return String(Math.round(ufNumeric * ufValue));
    }
    return editForm.rateClp;
  }, [editForm.rateCurrency, editForm.rateClp, editForm.rateUf, ufValue]);

  const editGuardPaymentNumber = useMemo(() => Number(editForm.guardPaymentClp || 0), [editForm.guardPaymentClp]);
  const editSaleValueNumber = useMemo(() => Number(computedEditRateClp || 0), [computedEditRateClp]);
  const editUtilityAmount = useMemo(
    () => editSaleValueNumber - editGuardPaymentNumber,
    [editSaleValueNumber, editGuardPaymentNumber]
  );
  const editUtilityMargin = useMemo(
    () => (editSaleValueNumber > 0 ? (editUtilityAmount / editSaleValueNumber) * 100 : null),
    [editSaleValueNumber, editUtilityAmount]
  );

  function applyShiftPreset(mode: "dia" | "noche") {
    setCreateForm((prev) => {
      const base = prev.startAt ? new Date(prev.startAt) : new Date();
      const date = Number.isFinite(base.getTime()) ? base : new Date();
      const start = new Date(date);
      const end = new Date(date);
      if (mode === "dia") {
        start.setHours(8, 0, 0, 0);
        end.setHours(20, 0, 0, 0);
      } else {
        start.setHours(20, 0, 0, 0);
        end.setDate(end.getDate() + 1);
        end.setHours(8, 0, 0, 0);
      }
      return {
        ...prev,
        startAt: toDateTimeInputValue(start),
        endAt: toDateTimeInputValue(end),
      };
    });
  }

  async function createRefuerzo() {
    if (!createForm.installationId || !createForm.guardiaId || !createForm.guardPaymentClp) {
      toast.error("Instalación, guardia y pago guardia son obligatorios");
      return;
    }
    setLoading(true);
    try {
      const body = {
        installationId: createForm.installationId,
        puestoId: createForm.puestoId || null,
        guardiaId: createForm.guardiaId,
        requestedByName: createForm.requestedByName || null,
        requestChannel: createForm.requestChannel,
        startAt: new Date(createForm.startAt).toISOString(),
        endAt: new Date(createForm.endAt).toISOString(),
        guardsCount: Number(createForm.guardsCount || 1),
        shiftType: createForm.shiftType || null,
        paymentCondition: createForm.paymentCondition || null,
        guardPaymentClp: Number(createForm.guardPaymentClp),
        rateMode: createForm.rateMode,
        rateClp: computedRateClp ? Number(computedRateClp) : null,
        notes: createForm.notes || null,
      };
      const res = await fetch("/api/ops/refuerzos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || "No se pudo crear");
      setItems((prev) => [payload.data, ...prev]);
      setCreateOpen(false);
      toast.success("Solicitud creada y enviada a Turnos Extra");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo crear");
    } finally {
      setLoading(false);
    }
  }

  function openDetail(item: RefuerzoItem) {
    setSelectedId(item.id);
    setDetailEditMode(false);
    setDetailOpen(true);
  }

  function startDetailEdit(item: RefuerzoItem) {
    setEditForm({
      guardiaId: item.guardiaId,
      puestoId: item.puestoId ?? "",
      startAt: toDateTimeInputValue(new Date(item.startAt)),
      endAt: toDateTimeInputValue(new Date(item.endAt)),
      requestedByName: item.requestedByName ?? "",
      requestChannel: item.requestChannel ?? "whatsapp",
      guardPaymentClp: String(Math.round(toNumber(item.guardPaymentClp))),
      rateCurrency: "clp",
      rateClp: String(Math.round(toNumber(item.rateClp ?? item.estimatedTotalClp))),
      rateUf: "",
      notes: item.notes ?? "",
    });
    setDetailEditMode(true);
  }

  async function saveDetailEdit() {
    if (!selectedItem) return;
    setLoading(true);
    try {
      const body = {
        guardiaId: editForm.guardiaId || selectedItem.guardiaId,
        startAt: new Date(editForm.startAt).toISOString(),
        endAt: new Date(editForm.endAt).toISOString(),
        requestedByName: editForm.requestedByName || null,
        requestChannel: editForm.requestChannel,
        guardPaymentClp: Number(editForm.guardPaymentClp || 0),
        rateClp: computedEditRateClp ? Number(computedEditRateClp) : null,
        notes: editForm.notes || null,
      };
      const res = await fetch(`/api/ops/refuerzos/${selectedItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || "No se pudo actualizar");
      setItems((prev) => prev.map((x) => (x.id === selectedItem.id ? payload.data : x)));
      setDetailEditMode(false);
      toast.success("Solicitud actualizada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar");
    } finally {
      setLoading(false);
    }
  }

  async function deleteRefuerzo(item: RefuerzoItem) {
    const ok = window.confirm("¿Eliminar esta solicitud de refuerzo? Esta acción no se puede deshacer.");
    if (!ok) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/ops/refuerzos/${item.id}`, { method: "DELETE" });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || "No se pudo eliminar");
      setItems((prev) => prev.filter((x) => x.id !== item.id));
      setDetailOpen(false);
      setSelectedId(null);
      toast.success("Solicitud eliminada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar");
    } finally {
      setLoading(false);
    }
  }

  async function patchStatus(item: RefuerzoItem, status: "en_curso" | "facturado") {
    setLoading(true);
    try {
      const body: Record<string, unknown> = { status };
      if (status === "facturado") {
        const invoiceNumber = window.prompt("Número de factura", item.invoiceNumber ?? "");
        if (!invoiceNumber) {
          setLoading(false);
          return;
        }
        body.invoiceNumber = invoiceNumber;
      }
      const res = await fetch(`/api/ops/refuerzos/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || "No se pudo actualizar estado");
      setItems((prev) => prev.map((x) => (x.id === item.id ? payload.data : x)));
      toast.success("Estado actualizado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar");
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (pendingBillingOnly) params.set("pendingBilling", "true");
    if (search.trim()) params.set("q", search.trim());
    window.location.href = `/api/ops/refuerzos/export?${params.toString()}`;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-5 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Nuevo turno de refuerzo
            </Button>
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <FileDown className="h-4 w-4 mr-1" />
              Exportar CSV
            </Button>
          </div>
          <div className="grid gap-2 md:grid-cols-4">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por instalación, cliente, guardia o solicitado por..."
              />
            </div>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">Todos</option>
              <option value="pendiente_aprobacion">Pendiente aprobación</option>
              <option value="rechazado">Rechazado</option>
              <option value="solicitado">Solicitado (aprobado)</option>
              <option value="en_curso">En curso</option>
              <option value="realizado">Realizado</option>
              <option value="facturado">Facturado</option>
            </select>
            <label className="h-9 rounded-md border border-input px-3 text-sm flex items-center gap-2">
              <input
                type="checkbox"
                checked={pendingBillingOnly}
                onChange={(e) => setPendingBillingOnly(e.target.checked)}
              />
              Pendientes de facturar
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded border p-2">Turnos: <strong>{totals.count}</strong></div>
            <div className="rounded border p-2">Monto total: <strong>{formatMoney(totals.amount)}</strong></div>
            <div className="rounded border p-2">Pendiente facturar: <strong>{formatMoney(totals.pendingAmount)}</strong></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Clock3 className="h-8 w-8" />}
              title="Sin turnos de refuerzo"
              description="No hay resultados para los filtros seleccionados."
              compact
            />
          ) : (
            <div className="space-y-2">
              {filtered.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border p-3 flex cursor-pointer flex-col gap-2 transition-colors hover:bg-accent/30 md:flex-row md:items-center md:justify-between"
                  onClick={() => openDetail(item)}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {item.installation.name} · {item.guardia.persona.firstName} {item.guardia.persona.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.account?.name ?? "Sin cliente"} · {formatDateTime(item.startAt)} - {formatDateTime(item.endAt)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Pago guardia: {formatMoney(toNumber(item.guardPaymentClp))} · Estimado facturable: {formatMoney(toNumber(item.estimatedTotalClp))}
                    </p>
                    {item.invoiceNumber && (
                      <p className="text-xs text-muted-foreground">Factura: {item.invoiceNumber}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={item.status} />
                    {item.status === "pendiente_aprobacion" && item.ticket && (
                      <span className="inline-flex items-center rounded-full border border-yellow-300 bg-yellow-50 px-2 py-0.5 text-xs font-medium text-yellow-700">
                        Pendiente aprobación
                      </span>
                    )}
                    {item.status === "rechazado" && (
                      <span className="inline-flex items-center rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                        Rechazado
                      </span>
                    )}
                    {canManageRefuerzos && item.status === "solicitado" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={loading}
                        onClick={(event) => {
                          event.stopPropagation();
                          void patchStatus(item, "en_curso");
                        }}
                      >
                        Marcar en curso
                      </Button>
                    )}
                    {canManageRefuerzos && !["facturado", "pendiente_aprobacion", "rechazado"].includes(item.status) && (
                      <Button
                        size="sm"
                        disabled={loading}
                        onClick={(event) => {
                          event.stopPropagation();
                          void patchStatus(item, "facturado");
                        }}
                      >
                        Marcar facturado
                      </Button>
                    )}
                    {canManageRefuerzos && !["pendiente_aprobacion", "rechazado"].includes(item.status) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(event) => {
                          event.stopPropagation();
                          openDetail(item);
                          startDetailEdit(item);
                        }}
                      >
                        <Pencil className="mr-1 h-3.5 w-3.5" />
                        Editar
                      </Button>
                    )}
                    {item.ticket && (
                      <a
                        href={`/ops/tickets/${item.ticket.id}`}
                        className="text-xs text-primary underline underline-offset-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {item.ticket.code}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) setDetailEditMode(false);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{detailEditMode ? "Editar solicitud de refuerzo" : "Detalle solicitud de refuerzo"}</DialogTitle>
          </DialogHeader>
          {selectedItem ? (
            detailEditMode ? (
              <div className="grid gap-3">
                <div>
                  <Label>Instalación</Label>
                  <p className="mt-1 text-sm text-muted-foreground">{selectedItem.installation.name}</p>
                </div>
                <div>
                  <Label>Guardia asignado</Label>
                  <div className="mt-1">
                    <SearchableSelect
                      value={editForm.guardiaId}
                      options={guardiaOptions}
                      placeholder="Buscar por nombre, RUT o código..."
                      emptyText="No se encontraron guardias"
                      onChange={(id) => setEditForm((f) => ({ ...f, guardiaId: id }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Inicio</Label>
                    <Input type="datetime-local" value={editForm.startAt} onChange={(e) => setEditForm((f) => ({ ...f, startAt: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Fin</Label>
                    <Input type="datetime-local" value={editForm.endAt} onChange={(e) => setEditForm((f) => ({ ...f, endAt: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Solicitado por</Label>
                    <Input value={editForm.requestedByName} onChange={(e) => setEditForm((f) => ({ ...f, requestedByName: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Canal</Label>
                    <select className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={editForm.requestChannel} onChange={(e) => setEditForm((f) => ({ ...f, requestChannel: e.target.value }))}>
                      <option value="telefono">Teléfono</option>
                      <option value="email">Email</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="presencial">Presencial</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Pago guardia (CLP)</Label>
                    <Input inputMode="numeric" value={formatClpInput(editForm.guardPaymentClp)} onChange={(e) => setEditForm((f) => ({ ...f, guardPaymentClp: sanitizeClpInput(e.target.value) }))} />
                  </div>
                  <div>
                    <Label>Valor ofertado</Label>
                    <div className="flex gap-2">
                      <select
                        className="h-9 w-24 rounded-md border border-input bg-background px-2 text-sm"
                        value={editForm.rateCurrency}
                        onChange={(e) => setEditForm((f) => ({ ...f, rateCurrency: e.target.value as "clp" | "uf" }))}
                      >
                        <option value="clp">CLP</option>
                        <option value="uf">UF</option>
                      </select>
                      <Input
                        inputMode="decimal"
                        value={editForm.rateCurrency === "uf" ? editForm.rateUf : formatClpInput(editForm.rateClp)}
                        onChange={(e) =>
                          setEditForm((f) =>
                            f.rateCurrency === "uf"
                              ? { ...f, rateUf: sanitizeUfInput(e.target.value) }
                              : { ...f, rateClp: sanitizeClpInput(e.target.value) }
                          )
                        }
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      CLP calculado: {computedEditRateClp ? formatMoney(Number(computedEditRateClp)) : "$0"}
                    </p>
                    <p className={`text-xs ${editUtilityAmount >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      Utilidad sobre venta: {formatMoney(editUtilityAmount)}
                      {editUtilityMargin !== null
                        ? ` (${editUtilityMargin.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)`
                        : ""}
                    </p>
                  </div>
                </div>
                <div>
                  <Label>Observaciones</Label>
                  <Input value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <p><strong>Instalación:</strong> {selectedItem.installation.name}</p>
                <p><strong>Guardia:</strong> {selectedItem.guardia.persona.firstName} {selectedItem.guardia.persona.lastName}</p>
                <p><strong>Puesto:</strong> {selectedItem.puesto?.name ?? "Sin puesto"}</p>
                <p><strong>Inicio:</strong> {formatDateTime(selectedItem.startAt)}</p>
                <p><strong>Fin:</strong> {formatDateTime(selectedItem.endAt)}</p>
                <p><strong>Solicitado por:</strong> {selectedItem.requestedByName ?? "-"}</p>
                <p><strong>Canal:</strong> {selectedItem.requestChannel ?? "-"}</p>
                <p><strong>Pago guardia:</strong> {formatMoney(toNumber(selectedItem.guardPaymentClp))}</p>
                <p><strong>Estimado facturable:</strong> {formatMoney(toNumber(selectedItem.estimatedTotalClp))}</p>
                <p><strong>Estado:</strong> {selectedItem.status}</p>
                <p><strong>Observaciones:</strong> {selectedItem.notes ?? "-"}</p>
                {selectedItem.ticket && (
                  <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
                    <p className="text-xs font-semibold mb-1">Ticket de aprobación</p>
                    <p className="text-xs">
                      <a href={`/ops/tickets/${selectedItem.ticket.id}`} className="text-primary underline underline-offset-2">
                        {selectedItem.ticket.code}
                      </a>
                      {" · "}
                      {selectedItem.ticket.approvalStatus === "approved" && (
                        <span className="text-emerald-600 font-medium">Aprobado</span>
                      )}
                      {selectedItem.ticket.approvalStatus === "rejected" && (
                        <span className="text-red-600 font-medium">Rechazado</span>
                      )}
                      {selectedItem.ticket.approvalStatus === "pending" && (
                        <span className="text-yellow-600 font-medium">Pendiente de aprobación</span>
                      )}
                      {!selectedItem.ticket.approvalStatus && (
                        <span className="text-muted-foreground">Estado: {selectedItem.ticket.status}</span>
                      )}
                    </p>
                  </div>
                )}
              </div>
            )
          ) : null}
          <DialogFooter>
            {selectedItem && canDeleteRefuerzos && (
              <Button
                variant="destructive"
                disabled={loading}
                onClick={() => void deleteRefuerzo(selectedItem)}
              >
                <Trash2 className="mr-1 h-4 w-4" />
                Eliminar
              </Button>
            )}
            {selectedItem && canManageRefuerzos && !detailEditMode && (
              <Button variant="outline" onClick={() => startDetailEdit(selectedItem)}>
                <Pencil className="mr-1 h-4 w-4" />
                Editar
              </Button>
            )}
            {detailEditMode ? (
              <>
                <Button variant="outline" onClick={() => setDetailEditMode(false)}>
                  Cancelar edición
                </Button>
                <Button disabled={loading} onClick={() => void saveDetailEdit()}>
                  Guardar cambios
                </Button>
              </>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg overflow-visible">
          <DialogHeader>
            <DialogTitle>Nueva solicitud de turno de refuerzo</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Instalación</Label>
              <div className="mt-1">
                <SearchableSelect
                  value={createForm.installationId}
                  options={installationOptions}
                  placeholder="Buscar instalación o cliente..."
                  emptyText="No se encontraron instalaciones"
                  disabled={Boolean(defaultInstallationId)}
                  onChange={(id) => setCreateForm((f) => ({ ...f, installationId: id, puestoId: "" }))}
                />
              </div>
            </div>
            <div>
              <Label>Puesto (opcional)</Label>
              <div className="mt-1 space-y-1">
                <SearchableSelect
                  value={createForm.puestoId}
                  options={puestoOptions}
                  placeholder={createForm.installationId ? "Buscar puesto..." : "Primero selecciona instalación"}
                  emptyText={createForm.installationId ? "No hay puestos para esta instalación" : "Selecciona instalación"}
                  disabled={!createForm.installationId || puestosLoading}
                  onChange={(id) => setCreateForm((f) => ({ ...f, puestoId: id }))}
                />
                {puestosLoading ? <p className="text-xs text-muted-foreground">Cargando puestos...</p> : null}
              </div>
            </div>
            <div>
              <Label>Guardia asignado</Label>
              <div className="mt-1">
                <SearchableSelect
                  value={createForm.guardiaId}
                  options={guardiaOptions}
                  placeholder="Buscar por nombre, RUT o código..."
                  emptyText="No se encontraron guardias"
                  onChange={(id) => setCreateForm((f) => ({ ...f, guardiaId: id }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Inicio</Label>
                <Input type="datetime-local" value={createForm.startAt} onChange={(e) => setCreateForm((f) => ({ ...f, startAt: e.target.value }))} />
              </div>
              <div>
                <Label>Fin</Label>
                <Input type="datetime-local" value={createForm.endAt} onChange={(e) => setCreateForm((f) => ({ ...f, endAt: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => applyShiftPreset("dia")}>
                Día 08:00 - 20:00
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => applyShiftPreset("noche")}>
                Noche 20:00 - 08:00
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Solicitado por</Label>
                <Input value={createForm.requestedByName} onChange={(e) => setCreateForm((f) => ({ ...f, requestedByName: e.target.value }))} />
              </div>
              <div>
                <Label>Canal</Label>
                <select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={createForm.requestChannel} onChange={(e) => setCreateForm((f) => ({ ...f, requestChannel: e.target.value }))}>
                  <option value="telefono">Teléfono</option>
                  <option value="email">Email</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="presencial">Presencial</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Pago guardia (CLP)</Label>
                <Input
                  inputMode="numeric"
                  value={formatClpInput(createForm.guardPaymentClp)}
                  placeholder="0"
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, guardPaymentClp: sanitizeClpInput(e.target.value) }))
                  }
                />
              </div>
              <div>
                <Label>Valor ofertado (CLP)</Label>
                <div className="space-y-1">
                  <div className="flex gap-2">
                    <select
                      className="h-9 w-24 rounded-md border border-input bg-background px-2 text-sm"
                      value={createForm.rateCurrency}
                      onChange={(e) => {
                        const nextCurrency = e.target.value as "clp" | "uf";
                        setCreateForm((f) => {
                          if (nextCurrency === f.rateCurrency) return f;
                          if (nextCurrency === "uf") {
                            const ufFromClp =
                              ufValue && f.rateClp ? (Number(f.rateClp) / ufValue).toFixed(4) : f.rateUf;
                            return { ...f, rateCurrency: "uf", rateUf: ufFromClp };
                          }
                          const clpFromUf =
                            ufValue && f.rateUf ? String(Math.round(Number(f.rateUf) * ufValue)) : f.rateClp;
                          return { ...f, rateCurrency: "clp", rateClp: clpFromUf };
                        });
                      }}
                    >
                      <option value="clp">CLP</option>
                      <option value="uf">UF</option>
                    </select>
                    <Input
                      inputMode="decimal"
                      value={
                        createForm.rateCurrency === "uf"
                          ? createForm.rateUf
                          : formatClpInput(createForm.rateClp)
                      }
                      placeholder={createForm.rateCurrency === "uf" ? "0.0000" : "0"}
                      onChange={(e) =>
                        setCreateForm((f) =>
                          f.rateCurrency === "uf"
                            ? { ...f, rateUf: sanitizeUfInput(e.target.value) }
                            : { ...f, rateClp: sanitizeClpInput(e.target.value) }
                        )
                      }
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    CLP calculado: {displayedRateClp ? `$${displayedRateClp}` : "$0"}
                    {ufValue ? ` · UF hoy: ${ufValue.toLocaleString("es-CL", { maximumFractionDigits: 2 })}` : ""}
                  </p>
                  <p className={`text-xs ${utilityAmount >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    Utilidad sobre venta: {formatMoney(utilityAmount)}
                    {utilityMargin !== null
                      ? ` (${utilityMargin.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)`
                      : ""}
                  </p>
                </div>
              </div>
            </div>
            <div>
              <Label>Observaciones</Label>
              <Input value={createForm.notes} onChange={(e) => setCreateForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button disabled={loading} onClick={() => void createRefuerzo()}>
              {loading ? "Guardando..." : "Crear solicitud"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
