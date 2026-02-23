"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Ruler } from "lucide-react";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  category: string;
  active: boolean;
  sizes: { id: string; sizeCode: string; sizeLabel: string | null }[];
  variants: { id: string; size: { sizeCode: string } | null }[];
};

export function InventarioProductosClient() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    sku: "",
    category: "uniform" as "uniform" | "asset",
    notes: "",
  });

  const [error, setError] = useState<string | null>(null);

  const fetchProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ops/inventario/products");
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setProducts(data);
      } else {
        setError(data?.error || "Error al cargar productos. Verifica que la base de datos esté configurada.");
      }
    } catch (e) {
      console.error(e);
      setError("No se pudo conectar. Verifica que el servidor y la base de datos estén disponibles.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = "/api/ops/inventario/products";
    const createBody = { name: form.name, sku: form.sku || undefined, category: form.category, notes: form.notes || undefined };
    const updateBody = { name: form.name };

    try {
      const res = editingId
        ? await fetch(`${url}/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updateBody) })
        : await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(createBody) });
      const data = await res.json();
      if (data.id || data.name) {
        setDialogOpen(false);
        setEditingId(null);
        setForm({ name: "", sku: "", category: "uniform", notes: "" });
        fetchProducts();
      } else {
        alert(data.error || "Error al guardar");
      }
    } catch (e) {
      console.error(e);
      alert("Error al guardar");
    }
  };

  const openEdit = (p: Product) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      sku: p.sku ?? "",
      category: p.category as "uniform" | "asset",
      notes: "",
    });
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: "", sku: "", category: "uniform", notes: "" });
    setDialogOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Catálogo</CardTitle>
          <CardDescription>
            Productos con tallas configurables por ítem (camisas S/M/L, zapatos 40-45, etc.)
          </CardDescription>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Nuevo producto
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar producto" : "Nuevo producto"}</DialogTitle>
                <DialogDescription>
                  {editingId
                    ? "Modifica los datos del producto."
                    : "Crea un producto de tipo uniforme (con tallas) o activo (sin tallas)."}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div>
                  <Label htmlFor="name">Nombre</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Ej: Camisa, Zapato, Celular"
                    required
                  />
                </div>
                {!editingId && (
                  <>
                    <div>
                      <Label htmlFor="sku">SKU (opcional)</Label>
                      <Input
                        id="sku"
                        value={form.sku}
                        onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                        placeholder="Código interno"
                      />
                    </div>
                    <div>
                      <Label>Categoría</Label>
                      <Select
                        value={form.category}
                        onValueChange={(v) => setForm((f) => ({ ...f, category: v as "uniform" | "asset" }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="uniform">Uniforme (con tallas)</SelectItem>
                          <SelectItem value="asset">Activo (sin tallas)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">Guardar</Button>
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
            <p className="mt-2 text-xs opacity-80">
              Ejecuta <code className="rounded bg-black/10 px-1">npm run db:migrate</code> después de configurar DATABASE_URL en .env.local
            </p>
          </div>
        ) : products.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay productos. Crea uno para comenzar.
          </p>
        ) : (
          <div className="space-y-2">
            {products.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-3">
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant={p.category === "uniform" ? "default" : "secondary"}>
                        {p.category === "uniform" ? "Uniforme" : "Activo"}
                      </Badge>
                      {p.sizes.length > 0 && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Ruler className="h-3 w-3" />
                          {p.sizes.map((s) => s.sizeCode).join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(p)}
                    title="Editar"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Link href={`/ops/inventario/productos/${p.id}`}>
                    <Button variant="ghost" size="sm">
                      Tallas
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
