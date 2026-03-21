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
import { Plus, Trash2 } from "lucide-react";
import { parseSizesInput } from "@/lib/inventory-product-catalog";

type Size = {
  id: string;
  sizeCode: string;
  sizeLabel: string | null;
  sortOrder: number;
};

export function InventarioProductoSizesClient({
  productId,
  productName,
  category,
  sizes: initialSizes,
}: {
  productId: string;
  productName: string;
  category: string;
  sizes: Size[];
}) {
  const [sizes, setSizes] = useState<Size[]>(initialSizes);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sizesText, setSizesText] = useState("");

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
          <div className="flex flex-wrap gap-2">
            {sizes.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2 rounded-lg border px-3 py-2"
              >
                <span className="font-medium">{s.sizeCode}</span>
                {s.sizeLabel && (
                  <span className="text-xs text-muted-foreground">({s.sizeLabel})</span>
                )}
                <button
                  type="button"
                  onClick={() => handleDeleteSize(s)}
                  className="text-muted-foreground hover:text-destructive"
                  title="Eliminar talla"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
