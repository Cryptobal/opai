"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GuardiaSearchInput } from "@/components/ops/GuardiaSearchInput";
import { formatPersonName } from "@/lib/personas";
import {
  InventoryReceptionBadge,
  receptionStatusFromMovement,
} from "@/components/inventario/InventoryReceptionBadge";
import {
  Building2,
  Loader2,
  Plus,
  Search,
  Trash2,
  Truck,
  Undo2,
  User,
  UserRoundCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Product = {
  id: string;
  name: string;
  category: string;
  variants: { id: string; size: { id: string; sizeCode: string } | null }[];
};

type Warehouse = { id: string; name: string };

type StockRecord = {
  warehouseId: string;
  variantId: string;
  quantity: number;
  variant: {
    product: { id: string; name: string; category: string };
    size: { id: string; sizeCode: string } | null;
  };
};

type FormLine = {
  productId: string;
  variantId: string;
  quantity: number;
};

type Movement = {
  id: string;
  date: string;
  guardia: { persona: { firstName: string; lastName: string } };
  fromWarehouse: { name: string };
  installation: { name: string } | null;
  lines: { variant: { product: { name: string }; size: { sizeCode: string } | null }; quantity: number }[];
  confirmationStatus?: string;
  confirmedAt?: string | null;
  confirmedMethod?: string | null;
  createdBy?: string | null;
  createdByUser?: { id: string; name: string | null; email: string | null } | null;
};

interface Props {
  currentUserId?: string;
  canEdit: boolean;
}

export function InventarioEntregasClient({ currentUserId, canEdit }: Props) {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [stockRecords, setStockRecords] = useState<StockRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [confirmedFilter, setConfirmedFilter] = useState<"all" | "pending" | "confirmed">("all");

  const initialForm = {
    date: new Date().toISOString().slice(0, 10),
    fromWarehouseId: "",
    guardiaId: "",
    guardiaNombre: "",
    installationId: "",
    installationName: "",
    notes: "",
    lines: [{ productId: "", variantId: "", quantity: 1 }] as FormLine[],
  };
  const [form, setForm] = useState(initialForm);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, pRes, wRes] = await Promise.all([
        fetch("/api/ops/inventario/movements?type=delivery"),
        fetch("/api/ops/inventario/products").then((r) => r.json()),
        fetch("/api/ops/inventario/warehouses"),
      ]);
      const mData = await mRes.json();
      const wData = await wRes.json();
      if (Array.isArray(mData)) setMovements(mData);
      if (Array.isArray(wData)) setWarehouses(wData);
      const prods = Array.isArray(pRes) ? pRes : [];
      setProducts(prods.filter((p: Product) => p.category === "uniform"));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (warehouses.length !== 1) return;
    const id = warehouses[0].id;
    setForm((f) => (f.fromWarehouseId ? f : { ...f, fromWarehouseId: id }));
  }, [warehouses]);

  const fetchStock = useCallback(async (warehouseId: string) => {
    if (!warehouseId) {
      setStockRecords([]);
      return;
    }
    try {
      const res = await fetch(`/api/ops/inventario/stock?warehouseId=${warehouseId}`);
      const data = await res.json();
      if (Array.isArray(data)) setStockRecords(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    void fetchStock(form.fromWarehouseId);
  }, [form.fromWarehouseId, fetchStock]);

  const stockByVariant = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of stockRecords) {
      map.set(s.variantId, s.quantity);
    }
    return map;
  }, [stockRecords]);

  const getSizesForProduct = useCallback(
    (productId: string) => {
      const product = products.find((p) => p.id === productId);
      if (!product) return [];
      return product.variants.map((v) => ({
        variantId: v.id,
        sizeCode: v.size?.sizeCode ?? "Única",
        stock: stockByVariant.get(v.id) ?? 0,
      }));
    },
    [products, stockByVariant],
  );

  const getAvailableStock = useCallback(
    (variantId: string, currentLineIndex: number) => {
      const total = stockByVariant.get(variantId) ?? 0;
      let otherAllocated = 0;
      for (let i = 0; i < form.lines.length; i++) {
        if (i === currentLineIndex) continue;
        if (form.lines[i].variantId === variantId) {
          otherAllocated += form.lines[i].quantity;
        }
      }
      return total - otherAllocated;
    },
    [stockByVariant, form.lines],
  );

  const handleGuardiaChange = useCallback(
    (patch: {
      guardiaNombre: string;
      guardiaId?: string | null;
      currentInstallationId?: string | null;
      currentInstallationName?: string | null;
    }) => {
      setForm((f) => ({
        ...f,
        guardiaNombre: patch.guardiaNombre,
        guardiaId: patch.guardiaId ?? "",
        installationId: patch.currentInstallationId ?? "",
        installationName: patch.currentInstallationName ?? "",
      }));
    },
    [],
  );

  const addLine = () => {
    setForm((f) => ({
      ...f,
      lines: [...f.lines, { productId: "", variantId: "", quantity: 1 }],
    }));
  };

  const removeLine = (index: number) => {
    setForm((f) => ({
      ...f,
      lines: f.lines.length > 1 ? f.lines.filter((_, i) => i !== index) : f.lines,
    }));
  };

  const updateLine = (index: number, patch: Partial<FormLine>) => {
    setForm((f) => {
      const next = [...f.lines];
      next[index] = { ...next[index], ...patch };
      if (patch.productId !== undefined) {
        next[index].variantId = "";
        next[index].quantity = 1;
      }
      return { ...f, lines: next };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validLines = form.lines.filter((l) => l.variantId && l.quantity > 0);
    if (validLines.length === 0 || !form.fromWarehouseId || !form.guardiaId || !form.installationId) {
      toast.error("Completa bodega, guardia, instalación y al menos una línea");
      return;
    }
    for (const line of validLines) {
      const available = stockByVariant.get(line.variantId) ?? 0;
      if (line.quantity > available) {
        const product = products.find((p) => p.variants.some((v) => v.id === line.variantId));
        const variant = product?.variants.find((v) => v.id === line.variantId);
        const name = `${product?.name ?? "Producto"} ${variant?.size?.sizeCode ?? ""}`.trim();
        toast.error(`Stock insuficiente para ${name}. Disponible: ${available}, solicitado: ${line.quantity}`);
        return;
      }
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/ops/inventario/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: form.date,
          fromWarehouseId: form.fromWarehouseId,
          guardiaId: form.guardiaId,
          installationId: form.installationId,
          notes: form.notes || undefined,
          lines: validLines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        }),
      });
      const data = await res.json();
      if (data.id) {
        toast.success("Entrega registrada");
        setSheetOpen(false);
        setForm({ ...initialForm, lines: [{ productId: "", variantId: "", quantity: 1 }] });
        await fetchData();
      } else {
        toast.error(data.error || "Error al registrar entrega");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error al registrar entrega");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUndo = async (m: Movement) => {
    const isOwnReversion = m.createdBy && currentUserId && m.createdBy === currentUserId;
    const message = isOwnReversion
      ? "¿Deshacer tu propia entrega? El stock volverá a la bodega de origen."
      : "¿Deshacer esta entrega? El stock volverá a la bodega de origen y se quitará la asignación al guardia.";
    if (!window.confirm(message)) return;
    setUndoingId(m.id);
    try {
      const res = await fetch(`/api/ops/inventario/movements/${m.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data?.success) {
        toast.success("Entrega revertida");
        await fetchData();
      } else {
        toast.error(data?.error || "No se pudo deshacer");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setUndoingId(null);
    }
  };

  const filtered = useMemo(() => {
    let result = movements;
    if (confirmedFilter !== "all") {
      result = result.filter((m) =>
        confirmedFilter === "confirmed"
          ? m.confirmationStatus === "confirmed"
          : m.confirmationStatus !== "confirmed",
      );
    }
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter((m) => {
        const guardia = formatPersonName(m.guardia.persona.firstName, m.guardia.persona.lastName);
        const installation = m.installation?.name ?? "";
        const creator = m.createdByUser?.name ?? "";
        return (
          guardia.toLowerCase().includes(q) ||
          installation.toLowerCase().includes(q) ||
          creator.toLowerCase().includes(q)
        );
      });
    }
    return result;
  }, [movements, confirmedFilter, search]);

  const summary = useMemo(() => {
    const total = movements.length;
    const confirmed = movements.filter((m) => m.confirmationStatus === "confirmed").length;
    const pending = total - confirmed;
    return { total, confirmed, pending };
  }, [movements]);

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-muted-foreground" />
              Entregas a guardias
            </CardTitle>
            <CardDescription className="mt-1">
              Registra la entrega de uniformes. El stock se descuenta de la bodega seleccionada.
            </CardDescription>
          </div>
          {canEdit && (
            <Button size="sm" className="gap-2 shrink-0" onClick={() => setSheetOpen(true)}>
              <Plus className="h-4 w-4" />
              Nueva entrega
            </Button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border bg-muted/30 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p>
            <p className="mt-0.5 text-base font-semibold tabular-nums">{summary.total}</p>
          </div>
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Confirmadas</p>
            <p className="mt-0.5 text-base font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              {summary.confirmed}
            </p>
          </div>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Pendientes</p>
            <p className="mt-0.5 text-base font-semibold tabular-nums text-amber-600 dark:text-amber-400">
              {summary.pending}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar guardia, instalación o autor…"
              className="pl-8 h-9"
            />
          </div>
          <Select value={confirmedFilter} onValueChange={(v) => setConfirmedFilter(v as typeof confirmedFilter)}>
            <SelectTrigger className="h-9 w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="pending">Pendientes</SelectItem>
              <SelectItem value="confirmed">Confirmadas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando entregas…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center">
            <Truck className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">
              {search || confirmedFilter !== "all" ? "Sin resultados" : "Sin entregas registradas"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {canEdit
                ? "Usa Nueva entrega para registrar la primera."
                : "Aún no hay entregas en el sistema."}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((m) => {
              const confirmed = m.confirmationStatus === "confirmed" && m.confirmedAt;
              const isOwn = currentUserId && m.createdBy === currentUserId;
              const methodLabel =
                m.confirmedMethod === "face_id"
                  ? "Face ID"
                  : m.confirmedMethod === "pin"
                    ? "PIN"
                    : m.confirmedMethod ?? null;
              const totalUnits = m.lines.reduce((s, l) => s + l.quantity, 0);
              const guardiaName = formatPersonName(m.guardia.persona.firstName, m.guardia.persona.lastName);
              const creatorName = m.createdByUser?.name ?? m.createdByUser?.email ?? null;

              return (
                <li key={m.id} className="rounded-xl border bg-card p-3">
                  <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <UserRoundCheck className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-sm font-semibold truncate">{guardiaName}</p>
                        <Badge variant="outline" className="text-[10px]">
                          {totalUnits} unid.
                        </Badge>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        <span>{new Date(m.date).toLocaleDateString("es-CL")}</span>
                        <span aria-hidden>·</span>
                        <span className="inline-flex items-center gap-1 truncate">
                          <Building2 className="h-3 w-3 shrink-0" />
                          {m.fromWarehouse.name}
                        </span>
                        {m.installation && (
                          <>
                            <span aria-hidden>→</span>
                            <span className="truncate">{m.installation.name}</span>
                          </>
                        )}
                      </div>
                      {(creatorName || isOwn) && (
                        <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <User className="h-2.5 w-2.5" />
                          Por {isOwn ? "ti" : creatorName}
                        </p>
                      )}
                    </div>
                    <InventoryReceptionBadge status={receptionStatusFromMovement(m.confirmationStatus)} />
                  </div>

                  <ul className="mt-2 space-y-0.5 rounded-md bg-muted/30 p-2 text-xs text-muted-foreground">
                    {m.lines.map((l, i) => (
                      <li key={i} className="flex items-center justify-between">
                        <span className="truncate">
                          {l.variant.product.name}
                          {l.variant.size && ` ${l.variant.size.sizeCode}`}
                        </span>
                        <span className="ml-2 shrink-0 tabular-nums font-mono">×{l.quantity}</span>
                      </li>
                    ))}
                  </ul>

                  {confirmed && (
                    <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
                      Recepcionado{" "}
                      {new Date(m.confirmedAt!).toLocaleString("es-CL", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                      {methodLabel ? ` · ${methodLabel}` : ""}
                    </p>
                  )}

                  {canEdit && m.confirmationStatus !== "confirmed" && (
                    <div className="mt-2 flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 text-xs text-destructive border-destructive/40 hover:bg-destructive/10"
                        disabled={undoingId === m.id}
                        onClick={() => handleUndo(m)}
                      >
                        {undoingId === m.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Undo2 className="h-3 w-3" />
                        )}
                        Deshacer entrega
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      {/* Sheet de nueva entrega */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-lg overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>Entregar uniformes</SheetTitle>
            <SheetDescription>
              Selecciona bodega, guardia y los ítems a entregar.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="entrega-date">Fecha</Label>
                <Input
                  id="entrega-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Bodega origen *</Label>
                <Select
                  value={form.fromWarehouseId}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      fromWarehouseId: v,
                      lines: [{ productId: "", variantId: "", quantity: 1 }],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar bodega" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Guardia *</Label>
              <GuardiaSearchInput
                value={form.guardiaNombre}
                onChange={handleGuardiaChange}
                placeholder="Buscar por nombre, RUT o código..."
              />
            </div>

            <div className="space-y-1.5">
              <Label>Instalación</Label>
              <Input
                value={form.installationName}
                readOnly
                disabled
                placeholder={form.guardiaId ? "Sin instalación asignada" : "Selecciona un guardia primero"}
                className="bg-muted"
              />
              {form.guardiaId && !form.installationId && (
                <p className="text-xs text-amber-500 mt-1">
                  Este guardia no tiene instalación asignada actualmente.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="entrega-notes">Notas (opcional)</Label>
              <Input
                id="entrega-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Comentario interno"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Líneas</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={addLine}
                  disabled={!form.fromWarehouseId}
                >
                  <Plus className="h-3 w-3" /> Agregar línea
                </Button>
              </div>
              {!form.fromWarehouseId ? (
                <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                  Selecciona una bodega para ver el stock disponible.
                </p>
              ) : (
                <div className="space-y-2">
                  {form.lines.map((line, i) => {
                    const sizes = line.productId ? getSizesForProduct(line.productId) : [];
                    const selectedSize = sizes.find((s) => s.variantId === line.variantId);
                    const maxQty = line.variantId ? getAvailableStock(line.variantId, i) : 1;

                    return (
                      <div key={i} className="rounded-lg border p-3 space-y-2 bg-muted/20">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground">Línea {i + 1}</span>
                          {form.lines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLine(i)}
                              className="text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs">Producto</Label>
                          <Select
                            value={line.productId}
                            onValueChange={(v) => updateLine(i, { productId: v })}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Seleccionar producto" />
                            </SelectTrigger>
                            <SelectContent>
                              {products.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {line.productId && (
                          <div className="grid grid-cols-[minmax(0,1fr)_90px] gap-2">
                            <div className="space-y-1.5">
                              <Label className="text-xs">Talla</Label>
                              <Select
                                value={line.variantId}
                                onValueChange={(v) => updateLine(i, { variantId: v })}
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue placeholder="Selecciona talla" />
                                </SelectTrigger>
                                <SelectContent>
                                  {sizes.map((s) => (
                                    <SelectItem
                                      key={s.variantId}
                                      value={s.variantId}
                                      disabled={s.stock <= 0}
                                    >
                                      {s.sizeCode} · {s.stock} disp.
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">Cantidad</Label>
                              <Input
                                type="number"
                                min={1}
                                max={maxQty}
                                value={line.quantity}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  updateLine(i, { quantity: Math.min(val, maxQty) });
                                }}
                                disabled={!line.variantId}
                                className="h-9"
                              />
                            </div>
                          </div>
                        )}

                        {line.variantId && selectedSize && (
                          <div className="flex items-center gap-2 text-xs">
                            <Badge
                              variant="outline"
                              className={cn(
                                selectedSize.stock > 5
                                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                  : selectedSize.stock > 0
                                    ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                    : "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
                              )}
                            >
                              Stock: {selectedSize.stock}
                            </Badge>
                            {line.quantity > 0 && (
                              <span className="text-muted-foreground">
                                Quedará: {selectedSize.stock - line.quantity}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <SheetFooter className="flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setSheetOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={
                  submitting ||
                  !form.fromWarehouseId ||
                  !form.guardiaId ||
                  !form.installationId ||
                  !form.lines.some((l) => l.variantId && l.quantity > 0)
                }
                className="gap-2"
              >
                {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
                Registrar entrega
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </Card>
  );
}
