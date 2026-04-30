"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Surface, Tag, EmptyState, Spinner } from "@/components/opai-ds";
import { Plus, Pencil, Ruler, Package, Trash2, PowerOff, UploadCloud } from "lucide-react";
import { ListToolbar } from "@/components/shared/ListToolbar";
import type { ViewMode } from "@/components/shared/ViewToggle";
import {
  DEFAULT_INVENTORY_UNIFORM_CATALOG,
  parseBulkCatalogText,
  parseSizesInput,
} from "@/lib/inventory-product-catalog";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  category: string;
  active: boolean;
  notes?: string | null;
  sizes: { id: string; sizeCode: string; sizeLabel: string | null }[];
  variants: { id: string; size: { sizeCode: string } | null }[];
};

export function InventarioProductosClient() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    sku: "",
    category: "uniform" as "uniform" | "asset",
    notes: "",
    active: true,
    sizesText: "",
  });
  const [bulkText, setBulkText] = useState(
    DEFAULT_INVENTORY_UNIFORM_CATALOG.map((p) => `${p.name}|${(p.sizes ?? []).join(",")}`).join("\n")
  );
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState("active");
  const [displayView, setDisplayView] = useState<ViewMode>("cards");

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

  const filteredProducts = useMemo(() => {
    let result = products;
    if (activeFilter === "active") {
      result = result.filter((p) => p.active);
    } else if (activeFilter === "inactive") {
      result = result.filter((p) => !p.active);
    }
    if (catFilter !== "all") {
      result = result.filter((p) => p.category === catFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.sku || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [products, catFilter, search, activeFilter]);

  const catFilters = useMemo(() => [
    { key: "all", label: "Todos", count: products.length },
    { key: "uniform", label: "Uniformes", count: products.filter((p) => p.category === "uniform").length },
    { key: "asset", label: "Activos", count: products.filter((p) => p.category === "asset").length },
  ], [products]);

  const statusFilters = useMemo(
    () => [
      { key: "active", label: "Vigentes", count: products.filter((p) => p.active).length },
      { key: "inactive", label: "Inactivos", count: products.filter((p) => !p.active).length },
      { key: "all", label: "Todos", count: products.length },
    ],
    [products]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = "/api/ops/inventario/products";
    const parsedSizes = parseSizesInput(form.sizesText);
    const createBody = {
      name: form.name,
      sku: form.sku || undefined,
      category: form.category,
      notes: form.notes || undefined,
      active: form.active,
      sizes: form.category === "uniform" ? parsedSizes : [],
    };
    const updateBody = {
      name: form.name,
      sku: form.sku || null,
      category: form.category,
      notes: form.notes || null,
      active: form.active,
    };

    try {
      const res = editingId
        ? await fetch(`${url}/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updateBody) })
        : await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(createBody) });
      const data = await res.json();
      if (data.id || data.name) {
        setDialogOpen(false);
        setEditingId(null);
        setForm({ name: "", sku: "", category: "uniform", notes: "", active: true, sizesText: "" });
        fetchProducts();
      } else {
        alert(data.error || "Error al guardar");
      }
    } catch (e) {
      console.error(e);
      alert("Error al guardar");
    }
  };

  const handleBulkCreate = async () => {
    const parsed = parseBulkCatalogText(bulkText);
    if (parsed.length === 0) {
      alert("Ingresa al menos una linea en formato Producto|Talla1,Talla2");
      return;
    }

    try {
      const res = await fetch("/api/ops/inventario/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: parsed }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "No se pudo crear el catalogo en lote");
        return;
      }
      alert(
        `Catalogo procesado. Nuevos: ${data.createdProducts ?? 0}, actualizados: ${data.updatedProducts ?? 0}, tallas nuevas: ${data.createdSizes ?? 0}.`
      );
      setBulkDialogOpen(false);
      fetchProducts();
    } catch (e) {
      console.error(e);
      alert("Error al crear catalogo en lote");
    }
  };

  const handleDeleteProduct = async (p: Product) => {
    if (!confirm(`¿Eliminar "${p.name}"?`)) return;
    try {
      const res = await fetch(`/api/ops/inventario/products/${p.id}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        fetchProducts();
        return;
      }
      const shouldArchive = confirm(`${data.error || "No se pudo eliminar."}\n\n¿Deseas desactivarlo en su lugar?`);
      if (!shouldArchive) return;
      await toggleActive(p, false);
    } catch (e) {
      console.error(e);
      alert("Error al eliminar producto");
    }
  };

  const toggleActive = async (p: Product, nextActive: boolean) => {
    try {
      const res = await fetch(`/api/ops/inventario/products/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: nextActive }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "No se pudo actualizar estado");
        return;
      }
      fetchProducts();
    } catch (e) {
      console.error(e);
      alert("Error al actualizar estado");
    }
  };

  const openEdit = (p: Product) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      sku: p.sku ?? "",
      category: p.category as "uniform" | "asset",
      notes: p.notes ?? "",
      active: p.active,
      sizesText: "",
    });
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: "", sku: "", category: "uniform", notes: "", active: true, sizesText: "" });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-5 ds-page-enter">
      {/* Toolbar */}
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar producto o SKU..."
        filters={catFilters}
        activeFilter={catFilter}
        onFilterChange={setCatFilter}
        viewModes={["list", "cards"]}
        activeView={displayView}
        onViewChange={setDisplayView}
        actionSlot={
          <div className="flex items-center gap-2">
            <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
              <DialogTrigger asChild>
                <Button size="icon" variant="outline" className="h-9 w-9 shrink-0" title="Carga masiva">
                  <UploadCloud className="h-4 w-4" />
                  <span className="sr-only">Carga masiva</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Carga masiva de productos</DialogTitle>
                  <DialogDescription>
                    Una linea por producto en formato: <code>Producto|Talla1,Talla2,...</code>.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <Label htmlFor="bulk-catalog">Catalogo</Label>
                  <textarea
                    id="bulk-catalog"
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    className="min-h-[260px] w-full rounded-ds-md border border-ds-border-default bg-ds-surface-2 px-3 py-2 text-sm text-ds-text-1 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="Ej: Calzado|35,36,37"
                  />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setBulkDialogOpen(false)} className="h-10 sm:h-9">
                    Cancelar
                  </Button>
                  <Button type="button" onClick={handleBulkCreate} className="h-10 sm:h-9">
                    Procesar lote
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="icon" variant="secondary" className="h-9 w-9 shrink-0" onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  <span className="sr-only">Nuevo producto</span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={handleSubmit}>
                  <DialogHeader>
                    <DialogTitle>{editingId ? "Editar producto" : "Nuevo producto"}</DialogTitle>
                    <DialogDescription>
                      {editingId
                        ? "Modifica nombre, categoria, SKU y estado."
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
                        className="h-10 sm:h-9"
                      />
                    </div>
                    <div>
                      <Label htmlFor="sku">SKU (opcional)</Label>
                      <Input
                        id="sku"
                        value={form.sku}
                        onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                        placeholder="Código interno"
                        className="h-10 sm:h-9"
                      />
                    </div>
                    <div>
                      <Label>Categoría</Label>
                      <Select
                        value={form.category}
                        onValueChange={(v) => setForm((f) => ({ ...f, category: v as "uniform" | "asset" }))}
                      >
                        <SelectTrigger className="h-10 sm:h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="uniform">Uniforme (con tallas)</SelectItem>
                          <SelectItem value="asset">Activo (sin tallas)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Estado</Label>
                      <Select
                        value={form.active ? "active" : "inactive"}
                        onValueChange={(v) => setForm((f) => ({ ...f, active: v === "active" }))}
                      >
                        <SelectTrigger className="h-10 sm:h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Vigente</SelectItem>
                          <SelectItem value="inactive">Inactivo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="notes">Notas (opcional)</Label>
                      <Input
                        id="notes"
                        value={form.notes}
                        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                        placeholder="Observaciones del producto"
                        className="h-10 sm:h-9"
                      />
                    </div>
                    {!editingId && form.category === "uniform" && (
                      <div>
                        <Label htmlFor="sizesText">Tallas (opcional)</Label>
                        <Input
                          id="sizesText"
                          value={form.sizesText}
                          onChange={(e) => setForm((f) => ({ ...f, sizesText: e.target.value }))}
                          placeholder="Ej: XS,S,M,L,XL"
                          className="h-10 sm:h-9"
                        />
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="h-10 sm:h-9">
                      Cancelar
                    </Button>
                    <Button type="submit" className="h-10 sm:h-9">Guardar</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-ds-text-3">Estado:</span>
        <Select value={activeFilter} onValueChange={setActiveFilter}>
          <SelectTrigger className="h-9 w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusFilters.map((s) => (
              <SelectItem key={s.key} value={s.key}>
                {s.label} ({s.count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {loading ? (
        <Spinner block label="Cargando…" />
      ) : error ? (
        <Surface elevation={1} padding="md" className="border-status-warn-border bg-status-warn-soft">
          <p className="text-sm text-status-warn-fg">{error}</p>
          <p className="mt-2 text-[12px] opacity-80 text-status-warn-fg">
            Ejecuta <code className="rounded bg-ds-surface-3 px-1 font-mono text-[12px]">npm run db:migrate</code> después de configurar DATABASE_URL en .env.local
          </p>
        </Surface>
      ) : filteredProducts.length === 0 ? (
        <Surface elevation={1} padding="none">
          <EmptyState
            icon={Package}
            title={products.length === 0 ? "No hay productos" : "Sin coincidencias"}
            description={
              products.length === 0
                ? "Crea uno para comenzar."
                : "No hay productos para los filtros seleccionados."
            }
          />
        </Surface>
      ) : displayView === "cards" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 ds-list-cascade">
          {filteredProducts.map((p) => (
            <Surface key={p.id} elevation={1} padding="md" hoverable>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-ds-text-1 truncate">{p.name}</p>
                  {p.sku && (
                    <p className="text-[12px] text-ds-text-4 mt-0.5 font-mono">SKU: {p.sku}</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => openEdit(p)} title="Editar">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() => toggleActive(p, !p.active)}
                    title={p.active ? "Desactivar" : "Activar"}
                  >
                    <PowerOff className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-status-danger-fg hover:text-status-danger-fg"
                    onClick={() => handleDeleteProduct(p)}
                    title="Eliminar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-1 mt-2 flex-wrap">
                <Tag variant="neutral" size="sm">
                  {p.category === "uniform" ? "Uniforme" : "Activo"}
                </Tag>
                <Tag variant={p.active ? "ok" : "neutral"} size="sm">
                  {p.active ? "Vigente" : "Inactivo"}
                </Tag>
                {p.sizes.length > 0 && (
                  <span className="text-[12px] text-ds-text-3 flex items-center gap-1 font-mono">
                    <Ruler className="h-3 w-3" />
                    {p.sizes.map((s) => s.sizeCode).join(", ")}
                  </span>
                )}
              </div>
              <div className="mt-3">
                <Link href={`/ops/inventario/productos/${p.id}`}>
                  <Button variant="outline" size="sm" className="h-9 text-xs w-full">
                    Tallas y variantes
                  </Button>
                </Link>
              </div>
            </Surface>
          ))}
        </div>
      ) : (
        <div className="space-y-2 ds-list-cascade">
          {filteredProducts.map((p) => (
            <Surface
              key={p.id}
              elevation={1}
              padding="sm"
              hoverable
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-ds-text-1 truncate">{p.name}</p>
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    <Tag variant="neutral" size="sm">
                      {p.category === "uniform" ? "Uniforme" : "Activo"}
                    </Tag>
                    <Tag variant={p.active ? "ok" : "neutral"} size="sm">
                      {p.active ? "Vigente" : "Inactivo"}
                    </Tag>
                    {p.sizes.length > 0 && (
                      <span className="text-[12px] text-ds-text-3 flex items-center gap-1 font-mono">
                        <Ruler className="h-3 w-3" />
                        {p.sizes.map((s) => s.sizeCode).join(", ")}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => openEdit(p)} title="Editar">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => toggleActive(p, !p.active)}
                  title={p.active ? "Desactivar" : "Activar"}
                >
                  <PowerOff className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-status-danger-fg hover:text-status-danger-fg"
                  onClick={() => handleDeleteProduct(p)}
                  title="Eliminar"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Link href={`/ops/inventario/productos/${p.id}`}>
                  <Button variant="ghost" size="sm" className="h-9">
                    Tallas
                  </Button>
                </Link>
              </div>
            </Surface>
          ))}
        </div>
      )}
    </div>
  );
}
