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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GuardiaSearchInput } from "@/components/ops/GuardiaSearchInput";
import { formatPersonName } from "@/lib/personas";
import {
  InventoryReceptionBadge,
  receptionStatusFromMovement,
} from "@/components/inventario/InventoryReceptionBadge";
import { Plus, Trash2, Undo2 } from "lucide-react";

/* ── Types ── */

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
  /** Firma / confirmación de recepción (portal guardia — FES) */
  confirmationStatus?: string;
  confirmedAt?: string | null;
  confirmedMethod?: string | null;
};

/* ── Component ── */

export function InventarioEntregasClient() {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [stockRecords, setStockRecords] = useState<StockRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

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

  /* ── Data fetching ── */

  const fetchData = async () => {
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
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Si solo hay una bodega, usarla por defecto (el stock por talla depende de la bodega de origen).
  useEffect(() => {
    if (warehouses.length !== 1) return;
    const id = warehouses[0].id;
    setForm((f) => (f.fromWarehouseId ? f : { ...f, fromWarehouseId: id }));
  }, [warehouses]);

  // Fetch stock when warehouse changes
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
    fetchStock(form.fromWarehouseId);
  }, [form.fromWarehouseId, fetchStock]);

  /* ── Stock helpers ── */

  // Map variantId → stock quantity for the selected warehouse
  const stockByVariant = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of stockRecords) {
      map.set(s.variantId, s.quantity);
    }
    return map;
  }, [stockRecords]);

  // Get available sizes for a product, with stock info
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
    [products, stockByVariant]
  );

  // Calculate already-allocated quantities in form lines (to avoid over-allocating)
  const allocatedByVariant = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of form.lines) {
      if (!line.variantId) continue;
      map.set(line.variantId, (map.get(line.variantId) ?? 0) + line.quantity);
    }
    return map;
  }, [form.lines]);

  const getAvailableStock = useCallback(
    (variantId: string, currentLineIndex: number) => {
      const total = stockByVariant.get(variantId) ?? 0;
      // Subtract quantities allocated in OTHER lines
      let otherAllocated = 0;
      for (let i = 0; i < form.lines.length; i++) {
        if (i === currentLineIndex) continue;
        if (form.lines[i].variantId === variantId) {
          otherAllocated += form.lines[i].quantity;
        }
      }
      return total - otherAllocated;
    },
    [stockByVariant, form.lines]
  );

  /* ── Guard selection auto-sets installation ── */

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
    []
  );

  /* ── Line management ── */

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
      // If product changed, reset variant
      if (patch.productId !== undefined) {
        next[index].variantId = "";
        next[index].quantity = 1;
      }
      return { ...f, lines: next };
    });
  };

  /* ── Submit ── */

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validLines = form.lines.filter((l) => l.variantId && l.quantity > 0);
    if (validLines.length === 0 || !form.fromWarehouseId || !form.guardiaId || !form.installationId) {
      alert("Completa bodega, guardia, instalación y al menos una línea");
      return;
    }

    // Validate stock availability
    for (const line of validLines) {
      const available = stockByVariant.get(line.variantId) ?? 0;
      if (line.quantity > available) {
        const product = products.find((p) => p.variants.some((v) => v.id === line.variantId));
        const variant = product?.variants.find((v) => v.id === line.variantId);
        const name = `${product?.name ?? "Producto"} ${variant?.size?.sizeCode ?? ""}`.trim();
        alert(`Stock insuficiente para ${name}. Disponible: ${available}, solicitado: ${line.quantity}`);
        return;
      }
    }

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
        setDialogOpen(false);
        setForm({ ...initialForm, lines: [{ productId: "", variantId: "", quantity: 1 }] });
        fetchData();
      } else {
        alert(data.error || "Error al registrar entrega");
      }
    } catch (e) {
      console.error(e);
      alert("Error al registrar entrega");
    }
  };

  /* ── Render ── */

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Entregas a guardias</CardTitle>
          <CardDescription>
            Registra la entrega de uniformes. El stock se descuenta de la bodega seleccionada.
          </CardDescription>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nueva entrega
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Entregar uniformes a guardia</DialogTitle>
                <DialogDescription>
                  Selecciona bodega de origen, guardia e ítems a entregar.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                {/* Date + Warehouse */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Fecha</Label>
                    <Input
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <Label>Bodega origen *</Label>
                    <select
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                      value={form.fromWarehouseId}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          fromWarehouseId: e.target.value,
                          // Reset lines when warehouse changes (stock changes)
                          lines: [{ productId: "", variantId: "", quantity: 1 }],
                        }))
                      }
                      required
                    >
                      <option value="">Seleccionar</option>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Guard */}
                <div>
                  <Label>Guardia *</Label>
                  <GuardiaSearchInput
                    value={form.guardiaNombre}
                    onChange={handleGuardiaChange}
                    placeholder="Buscar por nombre, RUT o código..."
                  />
                </div>

                {/* Installation (auto-populated, read-only) */}
                <div>
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

                {/* Notes */}
                <div>
                  <Label>Notas</Label>
                  <Input
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Opcional"
                  />
                </div>

                {/* Product lines */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <Label>Líneas</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addLine}>
                      + Línea
                    </Button>
                  </div>
                  {!form.fromWarehouseId && (
                    <p className="text-xs text-muted-foreground mb-2">
                      Selecciona una bodega para ver el stock disponible.
                    </p>
                  )}
                  <div className="space-y-3 max-h-60 overflow-y-auto">
                    {form.lines.map((line, i) => {
                      const sizes = line.productId ? getSizesForProduct(line.productId) : [];
                      const selectedSize = sizes.find((s) => s.variantId === line.variantId);
                      const maxQty = line.variantId ? getAvailableStock(line.variantId, i) : 1;

                      return (
                        <div key={i} className="rounded-lg border border-border p-3 space-y-2">
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

                          {/* Product selector */}
                          <div>
                            <Label className="text-xs">Producto</Label>
                            <select
                              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                              value={line.productId}
                              onChange={(e) => updateLine(i, { productId: e.target.value })}
                            >
                              <option value="">Seleccionar producto</option>
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Size selector with stock */}
                          {line.productId && (
                            <div className="grid grid-cols-12 gap-2">
                              <div className="col-span-8">
                                <Label className="text-xs">Talla / Stock</Label>
                                <select
                                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                                  value={line.variantId}
                                  onChange={(e) => updateLine(i, { variantId: e.target.value })}
                                >
                                  <option value="">Seleccionar talla</option>
                                  {sizes.map((s) => (
                                    <option
                                      key={s.variantId}
                                      value={s.variantId}
                                      disabled={s.stock <= 0}
                                    >
                                      {s.sizeCode} — {s.stock > 0 ? `${s.stock} disponible${s.stock !== 1 ? "s" : ""}` : "Sin stock"}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="col-span-4">
                                <Label className="text-xs">Cant.</Label>
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
                                />
                              </div>
                            </div>
                          )}

                          {/* Stock badge */}
                          {line.variantId && selectedSize && (
                            <div className="flex items-center gap-2">
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                  selectedSize.stock > 5
                                    ? "bg-emerald-500/10 text-emerald-500"
                                    : selectedSize.stock > 0
                                    ? "bg-amber-500/10 text-amber-500"
                                    : "bg-red-500/10 text-red-500"
                                }`}
                              >
                                Stock: {selectedSize.stock}
                              </span>
                              {line.quantity > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  → Quedará: {selectedSize.stock - line.quantity}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={
                    !form.fromWarehouseId ||
                    !form.guardiaId ||
                    !form.installationId ||
                    !form.lines.some((l) => l.variantId && l.quantity > 0)
                  }
                >
                  Registrar entrega
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : movements.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay entregas registradas. Usa &quot;Nueva entrega&quot; para registrar la primera.
          </p>
        ) : (
          <div className="space-y-2">
            {movements.map((m) => {
              const confirmed = m.confirmationStatus === "confirmed" && m.confirmedAt;
              const methodLabel =
                m.confirmedMethod === "face_id"
                  ? "Face ID"
                  : m.confirmedMethod === "pin"
                    ? "PIN de marcación"
                    : m.confirmedMethod ?? null;
              return (
              <div key={m.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="font-medium min-w-0">
                    {new Date(m.date).toLocaleDateString("es-CL")} ·{" "}
                    {formatPersonName(m.guardia.persona.firstName, m.guardia.persona.lastName)}
                  </span>
                  <div className="flex flex-col items-stretch sm:items-end gap-2 w-full sm:w-auto">
                    <span className="text-xs text-muted-foreground sm:text-right">
                      {m.fromWarehouse.name}
                      {m.installation && ` · ${m.installation.name}`}
                    </span>
                    <div className="flex flex-wrap items-center gap-2 justify-end">
                      <InventoryReceptionBadge
                        status={receptionStatusFromMovement(m.confirmationStatus)}
                      />
                      {m.confirmationStatus !== "confirmed" && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-xs h-7 text-destructive border-destructive/40 hover:bg-destructive/10"
                          disabled={undoingId === m.id}
                          onClick={async () => {
                            if (
                              !confirm(
                                "¿Deshacer esta entrega? El stock volverá a la bodega de origen y se quitará la asignación al guardia. Solo es posible si el guardia aún no ha recepcionado en el portal."
                              )
                            ) {
                              return;
                            }
                            setUndoingId(m.id);
                            try {
                              const res = await fetch(`/api/ops/inventario/movements/${m.id}`, {
                                method: "DELETE",
                              });
                              const data = await res.json();
                              if (data.success) await fetchData();
                              else alert(data.error || "No se pudo deshacer");
                            } catch {
                              alert("Error de conexión");
                            } finally {
                              setUndoingId(null);
                            }
                          }}
                        >
                          <Undo2 className="h-3 w-3 mr-1 shrink-0" />
                          {undoingId === m.id ? "…" : "Deshacer entrega"}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                {confirmed && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Recepcionado{" "}
                    {new Date(m.confirmedAt!).toLocaleString("es-CL", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                    {methodLabel ? ` · ${methodLabel}` : ""}
                  </p>
                )}
                <ul className="mt-2 text-sm text-muted-foreground">
                  {m.lines.map((l) => (
                    <li key={l.variant.product.name + (l.variant.size?.sizeCode ?? "")}>
                      {l.quantity} x {l.variant.product.name}
                      {l.variant.size && ` ${l.variant.size.sizeCode}`}
                    </li>
                  ))}
                </ul>
              </div>
            );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
