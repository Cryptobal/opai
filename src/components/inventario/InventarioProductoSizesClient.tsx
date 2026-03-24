"use client";

import { useState } from "react";
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
import { Plus, Trash2, Check, Pencil } from "lucide-react";
import { parseSizesInput } from "@/lib/inventory-product-catalog";

type Size = {
  id: string;
  sizeCode: string;
  sizeLabel: string | null;
  sortOrder: number;
};

type VariantInfo = {
  id: string;
  sizeId: string | null;
  minStock: number;
};

export function InventarioProductoSizesClient({
  productId,
  productName,
  category,
  sizes: initialSizes,
  variants: initialVariants,
}: {
  productId: string;
  productName: string;
  category: string;
  sizes: Size[];
  variants: VariantInfo[];
}) {
  const [sizes, setSizes] = useState<Size[]>(initialSizes);
  const [variants, setVariants] = useState<VariantInfo[]>(initialVariants);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sizesText, setSizesText] = useState("");
  const [editingMinStockId, setEditingMinStockId] = useState<string | null>(null);
  const [editMinStockValue, setEditMinStockValue] = useState("");
  const [savingMinStock, setSavingMinStock] = useState(false);

  const handleAddSize = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedSizes = parseSizesInput(sizesText);
    if (parsedSizes.length === 0) return;
    try {
      const added: Size[] = [];
      for (const sizeCode of parsedSizes) {
        const res = await fetch(`/api/ops/inventario/products/${productId}/sizes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sizeCode }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (String(data.error || "").includes("Ya existe")) continue;
          alert(data.error || `Error al agregar talla ${sizeCode}`);
          return;
        }
        if (data.id) {
          added.push({ ...data, sizeLabel: data.sizeLabel ?? null });
        }
      }
      if (added.length > 0) {
        setSizes((prev) =>
          [...prev, ...added].sort((a, b) => a.sortOrder - b.sortOrder || a.sizeCode.localeCompare(b.sizeCode))
        );
      }
      setDialogOpen(false);
      setSizesText("");
    } catch (e) {
      console.error(e);
      alert("Error al agregar talla");
    }
  };

  const handleDeleteSize = async (size: Size) => {
    if (!confirm(`¿Eliminar talla ${size.sizeCode}?`)) return;
    try {
      const res = await fetch(`/api/ops/inventario/products/${productId}/sizes/${size.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "No se pudo eliminar la talla");
        return;
      }
      setSizes((prev) => prev.filter((s) => s.id !== size.id));
    } catch (e) {
      console.error(e);
      alert("No se pudo eliminar la talla");
    }
  };

  const getVariantForSize = (sizeId: string) =>
    variants.find((v) => v.sizeId === sizeId);

  const handleSaveMinStock = async (variantId: string) => {
    const val = parseInt(editMinStockValue);
    if (isNaN(val) || val < 0) return;
    setSavingMinStock(true);
    try {
      const res = await fetch(`/api/ops/inventario/products/${productId}/variants`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId, minStock: val }),
      });
      if (res.ok) {
        setVariants((prev) =>
          prev.map((v) => (v.id === variantId ? { ...v, minStock: val } : v))
        );
        setEditingMinStockId(null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingMinStock(false);
    }
  };

  if (category === "asset") {
    return (
      <Card>
        <CardContent className="pt-5">
          <p className="text-sm text-muted-foreground">
            Los activos no usan tallas. Este producto tiene una única variante para compras y stock.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Tallas</CardTitle>
          <CardDescription>
            Ej: S, M, L, XL para camisas; 40, 41, 42 para zapatos.
          </CardDescription>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Agregar talla
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleAddSize}>
              <DialogHeader>
                <DialogTitle>Nueva talla</DialogTitle>
                <DialogDescription>
                  Agrega una o varias tallas para {productName}. Se crea automáticamente la variante.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div>
                  <Label htmlFor="sizesText">Tallas</Label>
                  <Input
                    id="sizesText"
                    value={sizesText}
                    onChange={(e) => setSizesText(e.target.value)}
                    placeholder="Ej: S, M, L, XL o 40,41,42"
                    required
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">Agregar</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {sizes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay tallas. Agrega al menos una para poder comprar y llevar stock.
          </p>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <div className="grid grid-cols-12 gap-2 p-2 bg-muted/50 text-xs font-medium">
              <span className="col-span-3">Talla</span>
              <span className="col-span-4">Stock mínimo</span>
              <span className="col-span-5"></span>
            </div>
            {sizes.map((s) => {
              const variant = getVariantForSize(s.id);
              const isEditing = editingMinStockId === variant?.id;
              return (
                <div
                  key={s.id}
                  className="grid grid-cols-12 gap-2 p-2 border-t text-sm items-center"
                >
                  <span className="col-span-3 font-medium">
                    {s.sizeCode}
                    {s.sizeLabel && (
                      <span className="ml-1 text-xs text-muted-foreground">({s.sizeLabel})</span>
                    )}
                  </span>
                  <span className="col-span-4">
                    {variant && isEditing ? (
                      <span className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          value={editMinStockValue}
                          onChange={(e) => setEditMinStockValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveMinStock(variant.id);
                            if (e.key === "Escape") setEditingMinStockId(null);
                          }}
                          autoFocus
                          className="w-16 h-7 rounded border border-input bg-background px-2 text-sm"
                        />
                        <button
                          onClick={() => handleSaveMinStock(variant.id)}
                          disabled={savingMinStock}
                          className="text-emerald-600 hover:text-emerald-500"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ) : variant ? (
                      <button
                        onClick={() => {
                          setEditingMinStockId(variant.id);
                          setEditMinStockValue(String(variant.minStock));
                        }}
                        className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
                        title="Editar stock mínimo"
                      >
                        <span className="tabular-nums">{variant.minStock || "-"}</span>
                        <Pencil className="h-3 w-3" />
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </span>
                  <span className="col-span-5 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleDeleteSize(s)}
                      className="text-muted-foreground hover:text-destructive"
                      title="Eliminar talla"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
