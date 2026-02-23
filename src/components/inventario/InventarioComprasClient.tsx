"use client";

import { useEffect, useState } from "react";
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
import { Plus } from "lucide-react";

type Purchase = {
  id: string;
  date: string;
  notes: string | null;
  lines: {
    id: string;
    quantity: number;
    unitCost: number;
    variant: { product: { name: string }; size: { sizeCode: string } | null };
    warehouse: { name: string };
  }[];
};

type Variant = {
  id: string;
  product: { name: string };
  size: { sizeCode: string } | null;
};

type Warehouse = { id: string; name: string };

export function InventarioComprasClient() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    notes: "",
    lines: [{ variantId: "", quantity: 1, unitCost: 0, warehouseId: "" }],
  });

  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [pRes, vRes, wRes] = await Promise.all([
        fetch("/api/ops/inventario/purchases"),
        fetch("/api/ops/inventario/products").then((r) => r.json()),
        fetch("/api/ops/inventario/warehouses"),
      ]);
      const pData = await pRes.json();
      const wData = await wRes.json();

      if (Array.isArray(pData)) setPurchases(pData);
      else setError(pData?.error || "Error al cargar. Verifica la base de datos.");
      if (Array.isArray(wData)) setWarehouses(wData);

      const products = Array.isArray(vRes) ? vRes : [];
      const allVariants: Variant[] = [];
      for (const p of products) {
        for (const v of p.variants || []) {
          allVariants.push({
            id: v.id,
            product: p,
            size: v.size,
          });
        }
      }
      setVariants(allVariants);
    } catch (e) {
      console.error(e);
      setError("No se pudo conectar al servidor.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validLines = form.lines.filter(
      (l) => l.variantId && l.quantity > 0 && l.warehouseId
    );
    if (validLines.length === 0) {
      alert("Agrega al menos una línea válida");
      return;
    }

    try {
      const res = await fetch("/api/ops/inventario/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: form.date,
          notes: form.notes || undefined,
          lines: validLines.map((l) => ({
            variantId: l.variantId,
            quantity: l.quantity,
            unitCost: Number(l.unitCost),
            warehouseId: l.warehouseId,
          })),
        }),
      });
      const data = await res.json();
      if (data.id) {
        setDialogOpen(false);
        setForm({
          date: new Date().toISOString().slice(0, 10),
          notes: "",
          lines: [{ variantId: "", quantity: 1, unitCost: 0, warehouseId: "" }],
        });
        fetchData();
      } else {
        alert(data.error || "Error al registrar compra");
      }
    } catch (e) {
      console.error(e);
      alert("Error al registrar compra");
    }
  };

  const addLine = () => {
    setForm((f) => ({
      ...f,
      lines: [...f.lines, { variantId: "", quantity: 1, unitCost: 0, warehouseId: "" }],
    }));
  };

  const variantLabel = (v: Variant) =>
    v.size ? `${v.product.name} ${v.size.sizeCode}` : v.product.name;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Ingresos</CardTitle>
          <CardDescription>
            Registra compras de uniformes. El stock se actualiza automáticamente.
          </CardDescription>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nueva compra
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Registrar compra</DialogTitle>
                <DialogDescription>
                  Ingresa las líneas de la compra. Cada línea suma stock a una bodega.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
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
                    <Label>Notas</Label>
                    <Input
                      value={form.notes}
                      onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                      placeholder="Opcional"
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <Label>Líneas</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addLine}>
                      + Línea
                    </Button>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {form.lines.map((line, i) => (
                      <div key={i} className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-5">
                          <Label className="text-xs">Producto/Talla</Label>
                          <select
                            className="w-full h-9 rounded-md border px-3 text-sm"
                            value={line.variantId}
                            onChange={(e) =>
                              setForm((f) => {
                                const next = [...f.lines];
                                next[i] = { ...next[i], variantId: e.target.value };
                                return { ...f, lines: next };
                              })
                            }
                          >
                            <option value="">Seleccionar</option>
                            {variants.map((v) => (
                              <option key={v.id} value={v.id}>
                                {variantLabel(v)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <Label className="text-xs">Cant.</Label>
                          <Input
                            type="number"
                            min={1}
                            value={line.quantity}
                            onChange={(e) =>
                              setForm((f) => {
                                const next = [...f.lines];
                                next[i] = { ...next[i], quantity: parseInt(e.target.value) || 0 };
                                return { ...f, lines: next };
                              })
                            }
                          />
                        </div>
                        <div className="col-span-2">
                          <Label className="text-xs">Costo unit.</Label>
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            value={line.unitCost || ""}
                            onChange={(e) =>
                              setForm((f) => {
                                const next = [...f.lines];
                                next[i] = { ...next[i], unitCost: parseFloat(e.target.value) || 0 };
                                return { ...f, lines: next };
                              })
                            }
                          />
                        </div>
                        <div className="col-span-3">
                          <Label className="text-xs">Bodega</Label>
                          <select
                            className="w-full h-9 rounded-md border px-3 text-sm"
                            value={line.warehouseId}
                            onChange={(e) =>
                              setForm((f) => {
                                const next = [...f.lines];
                                next[i] = { ...next[i], warehouseId: e.target.value };
                                return { ...f, lines: next };
                              })
                            }
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
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">Registrar</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : error ? (
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-400">
            {error}
          </div>
        ) : purchases.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay compras registradas. Crea productos, bodegas y registra tu primera compra.
          </p>
        ) : (
          <div className="space-y-2">
            {purchases.map((p) => (
              <div key={p.id} className="rounded-lg border p-3">
                <div className="flex justify-between">
                  <span className="font-medium">
                    {new Date(p.date).toLocaleDateString("es-CL")}
                  </span>
                  {p.notes && (
                    <span className="text-xs text-muted-foreground">{p.notes}</span>
                  )}
                </div>
                <ul className="mt-2 text-sm text-muted-foreground">
                  {p.lines.map((l) => (
                    <li key={l.id}>
                      {l.quantity} x {l.variant.product.name}
                      {l.variant.size && ` ${l.variant.size.sizeCode}`} → {l.warehouse.name} (
                      ${Number(l.unitCost).toLocaleString("es-CL")}/u)
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
