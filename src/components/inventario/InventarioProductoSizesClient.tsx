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
  const [newSize, setNewSize] = useState({ sizeCode: "", sizeLabel: "" });

  const handleAddSize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSize.sizeCode.trim()) return;
    try {
      const res = await fetch(`/api/ops/inventario/products/${productId}/sizes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sizeCode: newSize.sizeCode.trim(),
          sizeLabel: newSize.sizeLabel.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.id) {
        setSizes((prev) => [...prev, { ...data, sizeLabel: data.sizeLabel ?? null }]);
        setDialogOpen(false);
        setNewSize({ sizeCode: "", sizeLabel: "" });
      } else {
        alert(data.error || "Error al agregar talla");
      }
    } catch (e) {
      console.error(e);
      alert("Error al agregar talla");
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
                  Agrega una talla para {productName}. Se creará automáticamente la variante.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div>
                  <Label htmlFor="sizeCode">Código</Label>
                  <Input
                    id="sizeCode"
                    value={newSize.sizeCode}
                    onChange={(e) => setNewSize((s) => ({ ...s, sizeCode: e.target.value }))}
                    placeholder="Ej: M, 42, XL"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="sizeLabel">Etiqueta (opcional)</Label>
                  <Input
                    id="sizeLabel"
                    value={newSize.sizeLabel}
                    onChange={(e) => setNewSize((s) => ({ ...s, sizeLabel: e.target.value }))}
                    placeholder="Ej: Mediano, 42 EU"
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
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
