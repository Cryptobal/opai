"use client";

import { useEffect, useMemo, useState } from "react";
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
import { SearchableSelect, type SearchableOption } from "@/components/ui/SearchableSelect";
import { GuardiaSearchInput } from "@/components/ops/GuardiaSearchInput";
import { Plus } from "lucide-react";

type Variant = {
  id: string;
  product: { name: string };
  size: { sizeCode: string } | null;
};

type Warehouse = { id: string; name: string };

type Movement = {
  id: string;
  date: string;
  guardia: { persona: { firstName: string; lastName: string } };
  fromWarehouse: { name: string };
  installation: { name: string } | null;
  lines: { variant: { product: { name: string }; size: { sizeCode: string } | null }; quantity: number }[];
};

export function InventarioEntregasClient() {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [installations, setInstallations] = useState<
    { id: string; name: string; accountName?: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    fromWarehouseId: "",
    guardiaId: "",
    guardiaNombre: "",
    installationId: "",
    notes: "",
    lines: [{ variantId: "", quantity: 1 }],
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [mRes, pRes, wRes, iRes] = await Promise.all([
        fetch("/api/ops/inventario/movements?type=delivery"),
        fetch("/api/ops/inventario/products").then((r) => r.json()),
        fetch("/api/ops/inventario/warehouses"),
        fetch("/api/crm/installations").then((r) => r.json()),
      ]);
      const mData = await mRes.json();
      const wData = await wRes.json();

      if (Array.isArray(mData)) setMovements(mData);
      if (Array.isArray(wData)) setWarehouses(wData);

      const products = Array.isArray(pRes) ? pRes : [];
      const allVariants: Variant[] = [];
      for (const p of products) {
        if (p.category !== "uniform") continue;
        for (const v of p.variants || []) {
          allVariants.push({ id: v.id, product: p, size: v.size });
        }
      }
      setVariants(allVariants);

      const rawInst = iRes?.data ?? (Array.isArray(iRes) ? iRes : []);
      const instList = rawInst
        .filter((i: { isActive?: boolean }) => i.isActive !== false)
        .map(
          (i: { id: string; name: string; account?: { name: string } }) => ({
            id: i.id,
            name: i.name,
            accountName: i.account?.name ?? "",
          })
        );
      setInstallations(instList);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validLines = form.lines.filter((l) => l.variantId && l.quantity > 0);
    if (validLines.length === 0 || !form.fromWarehouseId || !form.guardiaId) {
      alert("Completa bodega, guardia y al menos una línea");
      return;
    }

    try {
      const res = await fetch("/api/ops/inventario/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: form.date,
          fromWarehouseId: form.fromWarehouseId,
          guardiaId: form.guardiaId,
          installationId: form.installationId || undefined,
          notes: form.notes || undefined,
          lines: validLines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        }),
      });
      const data = await res.json();
      if (data.id) {
        setDialogOpen(false);
        setForm({
          date: new Date().toISOString().slice(0, 10),
          fromWarehouseId: "",
          guardiaId: "",
          guardiaNombre: "",
          installationId: "",
          notes: "",
          lines: [{ variantId: "", quantity: 1 }],
        });
        fetchData();
      } else {
        alert(data.error || "Error al registrar entrega");
      }
    } catch (e) {
      console.error(e);
      alert("Error al registrar entrega");
    }
  };

  const variantLabel = (v: Variant) =>
    v.size ? `${v.product.name} ${v.size.sizeCode}` : v.product.name;

  const installationOptions: SearchableOption[] = useMemo(() => {
    const base: SearchableOption[] = [
      { id: "", label: "Ninguna", searchText: "ninguna" },
    ];
    const instOpts = installations.map((i) => ({
      id: i.id,
      label: i.name,
      description: i.accountName || undefined,
      searchText: `${i.name} ${i.accountName ?? ""}`.trim(),
    }));
    return [...base, ...instOpts];
  }, [installations]);

  const addLine = () => {
    setForm((f) => ({
      ...f,
      lines: [...f.lines, { variantId: "", quantity: 1 }],
    }));
  };

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
                      className="w-full h-9 rounded-md border px-3 text-sm"
                      value={form.fromWarehouseId}
                      onChange={(e) => setForm((f) => ({ ...f, fromWarehouseId: e.target.value }))}
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
                <div>
                  <Label>Guardia *</Label>
                  <GuardiaSearchInput
                    value={form.guardiaNombre}
                    onChange={({ guardiaNombre, guardiaId }) =>
                      setForm((f) => ({
                        ...f,
                        guardiaNombre,
                        guardiaId: guardiaId ?? "",
                      }))
                    }
                    placeholder="Buscar por nombre, RUT o código..."
                  />
                </div>
                <div>
                  <Label>Instalación (opcional)</Label>
                  <SearchableSelect
                    value={form.installationId}
                    options={installationOptions}
                    placeholder="Buscar por instalación o cliente..."
                    emptyText="Ninguna"
                    onChange={(id) =>
                      setForm((f) => ({ ...f, installationId: id }))
                    }
                  />
                  {form.installationId && (
                    <button
                      type="button"
                      onClick={() =>
                        setForm((f) => ({ ...f, installationId: "" }))
                      }
                      className="mt-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Limpiar
                    </button>
                  )}
                </div>
                <div>
                  <Label>Notas</Label>
                  <Input
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Opcional"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <Label>Líneas</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addLine}>
                      + Línea
                    </Button>
                  </div>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {form.lines.map((line, i) => (
                      <div key={i} className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-8">
                          <Label className="text-xs">Producto / Talla</Label>
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
                        <div className="col-span-4">
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
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">Registrar entrega</Button>
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
            {movements.map((m) => (
              <div key={m.id} className="rounded-lg border p-3">
                <div className="flex justify-between">
                  <span className="font-medium">
                    {new Date(m.date).toLocaleDateString("es-CL")} ·{" "}
                    {m.guardia.persona.firstName} {m.guardia.persona.lastName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {m.fromWarehouse.name}
                    {m.installation && ` · ${m.installation.name}`}
                  </span>
                </div>
                <ul className="mt-2 text-sm text-muted-foreground">
                  {m.lines.map((l) => (
                    <li key={l.variant.product.name + (l.variant.size?.sizeCode ?? "")}>
                      {l.quantity} x {l.variant.product.name}
                      {l.variant.size && ` ${l.variant.size.sizeCode}`}
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
