"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { OpaiSurface } from "@/components/opai";
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
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { SearchableSelect } from "@/components/ui/SearchableSelect";

type Asset = {
  id: string;
  serialNumber: string | null;
  status: string;
  phoneNumber: string | null;
  phoneCarrier: string | null;
  variant: { product: { name: string } } | null;
  assignments: { installation: { name: string } }[];
};

export function InventarioActivosClient() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [variants, setVariants] = useState<{ id: string; product: { name: string } }[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    variantId: "" as string | "",
    serialNumber: "",
    phoneNumber: "",
    phoneCarrier: "",
    notes: "",
  });

  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [aRes, pRes] = await Promise.all([
        fetch("/api/ops/inventario/assets"),
        fetch("/api/ops/inventario/products?category=asset").then((r) => r.json()),
      ]);
      const aData = await aRes.json();
      if (Array.isArray(aData)) setAssets(aData);
      else setError(aData?.error || "Error al cargar activos.");

      const products = Array.isArray(pRes) ? pRes : [];
      const vars: { id: string; product: { name: string } }[] = [];
      for (const p of products) {
        for (const v of p.variants || []) {
          vars.push({ id: v.id, product: p });
        }
      }
      setVariants(vars);
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
    try {
      const res = await fetch("/api/ops/inventario/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variantId: form.variantId || null,
          serialNumber: form.serialNumber || undefined,
          phoneNumber: form.phoneNumber || undefined,
          phoneCarrier: form.phoneCarrier || undefined,
          notes: form.notes || undefined,
        }),
      });
      const data = await res.json();
      if (data.id) {
        setDialogOpen(false);
        setForm({
          variantId: "",
          serialNumber: "",
          phoneNumber: "",
          phoneCarrier: "",
          notes: "",
        });
        fetchData();
      } else {
        alert(data.error || "Error al crear activo");
      }
    } catch (e) {
      console.error(e);
      alert("Error al crear activo");
    }
  };

  const statusLabels: Record<string, string> = {
    available: "Disponible",
    assigned: "Asignado",
    maintenance: "Mantenimiento",
    broken: "Roto",
    retired: "Dado de baja",
  };

  return (
    <OpaiSurface className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" onClick={() => setForm({ variantId: "", serialNumber: "", phoneNumber: "", phoneCarrier: "", notes: "" })}>
              <Plus className="h-4 w-4 mr-2" />
              Nuevo activo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Nuevo activo</DialogTitle>
                <DialogDescription>
                  Registra un celular, radio u otro equipo. Puedes asociar número de teléfono.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div>
                  <Label>Tipo (opcional)</Label>
                  <div className="mt-1">
                    <SearchableSelect
                      value={form.variantId}
                      options={variants.map((v) => ({
                        id: v.id,
                        label: v.product.name,
                      }))}
                      placeholder="Sin tipo"
                      emptyText="Sin tipos disponibles"
                      onChange={(id) => setForm((f) => ({ ...f, variantId: id }))}
                    />
                  </div>
                </div>
                <div>
                  <Label>Número de serie / IMEI</Label>
                  <Input
                    value={form.serialNumber}
                    onChange={(e) => setForm((f) => ({ ...f, serialNumber: e.target.value }))}
                    placeholder="Opcional"
                  />
                </div>
                <div>
                  <Label>Número de teléfono</Label>
                  <Input
                    value={form.phoneNumber}
                    onChange={(e) => setForm((f) => ({ ...f, phoneNumber: e.target.value }))}
                    placeholder="+56912345678"
                  />
                </div>
                <div>
                  <Label>Operador</Label>
                  <Input
                    value={form.phoneCarrier}
                    onChange={(e) => setForm((f) => ({ ...f, phoneCarrier: e.target.value }))}
                    placeholder="Entel, Movistar, etc."
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
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">Crear</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : error ? (
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-400">
            {error}
          </div>
        ) : assets.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No hay activos. Crea productos tipo &quot;activo&quot; (ej. Celular) y regístralos aquí.
          </p>
        ) : (
          <div className="space-y-2">
            {assets.map((a) => (
              <OpaiSurface
                key={a.id}
                variant="tight"
                hoverable
                className="flex items-center justify-between"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-sm">
                    {a.variant?.product.name ?? "Activo"}{" "}
                    {a.serialNumber && (
                      <span className="text-muted-foreground/70 font-mono text-xs">({a.serialNumber})</span>
                    )}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <Badge
                      variant="outline"
                      className="text-[10px] font-mono uppercase tracking-wider border-foreground/10 bg-foreground/5 text-muted-foreground"
                    >
                      {statusLabels[a.status] ?? a.status}
                    </Badge>
                    {a.phoneNumber && (
                      <span className="text-xs font-mono text-muted-foreground">{a.phoneNumber}</span>
                    )}
                    {a.assignments[0] && (
                      <span className="text-xs text-muted-foreground/80">
                        → {a.assignments[0].installation.name}
                      </span>
                    )}
                  </div>
                </div>
              </OpaiSurface>
            ))}
          </div>
        )}
      </div>
    </OpaiSurface>
  );
}
