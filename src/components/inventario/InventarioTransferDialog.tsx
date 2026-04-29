"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
import { ArrowLeftRight, Loader2, Plus, Trash2, Warehouse as WarehouseIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Warehouse = { id: string; name: string; type: string };

type StockItem = {
  warehouseId: string;
  variantId: string;
  quantity: number;
  variant: {
    product: { id: string; name: string; category: string };
    size: { sizeCode: string } | null;
  };
};

type LineDraft = {
  variantId: string;
  quantity: number;
};

interface Props {
  trigger?: React.ReactNode;
  onCompleted?: () => void;
}

export function InventarioTransferDialog({ trigger, onCompleted }: Props) {
  const [open, setOpen] = useState(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [loadingStock, setLoadingStock] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([{ variantId: "", quantity: 1 }]);

  // Carga inicial de bodegas
  useEffect(() => {
    if (!open) return;
    fetch("/api/ops/inventario/warehouses", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setWarehouses(data);
      })
      .catch(console.error);
  }, [open]);

  // Recarga stock al cambiar bodega origen
  useEffect(() => {
    if (!open || !fromWarehouseId) {
      setStock([]);
      return;
    }
    setLoadingStock(true);
    fetch(`/api/ops/inventario/stock?warehouseId=${fromWarehouseId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setStock(data.filter((s: StockItem) => s.quantity > 0));
        } else {
          setStock([]);
        }
      })
      .catch(() => setStock([]))
      .finally(() => setLoadingStock(false));
  }, [open, fromWarehouseId]);

  const variantOptions = useMemo(() => {
    return stock
      .map((s) => ({
        variantId: s.variantId,
        label: s.variant.size
          ? `${s.variant.product.name} ${s.variant.size.sizeCode}`
          : s.variant.product.name,
        available: s.quantity,
      }))
      .filter((v) => v.available > 0);
  }, [stock]);

  const totalQty = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
  const fromWarehouse = warehouses.find((w) => w.id === fromWarehouseId);
  const toWarehouse = warehouses.find((w) => w.id === toWarehouseId);

  const reset = () => {
    setDate(new Date().toISOString().slice(0, 10));
    setFromWarehouseId("");
    setToWarehouseId("");
    setNotes("");
    setLines([{ variantId: "", quantity: 1 }]);
  };

  const handleAddLine = () => setLines((prev) => [...prev, { variantId: "", quantity: 1 }]);
  const handleRemoveLine = (idx: number) =>
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  const handleLineChange = (idx: number, patch: Partial<LineDraft>) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const handleSubmit = useCallback(async () => {
    if (!fromWarehouseId) {
      toast.error("Selecciona la bodega de origen");
      return;
    }
    if (!toWarehouseId) {
      toast.error("Selecciona la bodega de destino");
      return;
    }
    if (fromWarehouseId === toWarehouseId) {
      toast.error("La bodega de origen y destino deben ser distintas");
      return;
    }
    const validLines = lines.filter((l) => l.variantId && l.quantity > 0);
    if (validLines.length === 0) {
      toast.error("Agrega al menos una línea con producto y cantidad");
      return;
    }
    // Validar que no exceda stock disponible
    for (const l of validLines) {
      const stockItem = stock.find((s) => s.variantId === l.variantId);
      if (!stockItem) continue;
      if (l.quantity > stockItem.quantity) {
        toast.error(
          `Stock insuficiente: ${stockItem.variant.product.name}${
            stockItem.variant.size ? ` ${stockItem.variant.size.sizeCode}` : ""
          } tiene ${stockItem.quantity} disponibles.`,
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/ops/inventario/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "transfer",
          date,
          fromWarehouseId,
          toWarehouseId,
          notes: notes.trim() || undefined,
          lines: validLines,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "No se pudo mover el stock");
      }
      toast.success("Stock movido entre bodegas");
      reset();
      setOpen(false);
      onCompleted?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al mover stock");
    } finally {
      setSubmitting(false);
    }
  }, [date, fromWarehouseId, toWarehouseId, notes, lines, stock, onCompleted]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" className="gap-2">
            <ArrowLeftRight className="h-4 w-4" />
            <span className="hidden sm:inline">Mover stock</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4" />
            Mover stock entre bodegas
          </DialogTitle>
          <DialogDescription>
            Transfiere unidades de una bodega a otra. Se registra como movimiento auditable y mantiene
            el costo promedio ponderado en la bodega destino.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="transfer-date">Fecha</Label>
              <Input
                id="transfer-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Origen</Label>
              <Select value={fromWarehouseId} onValueChange={setFromWarehouseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona bodega" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id} disabled={w.id === toWarehouseId}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Destino</Label>
              <Select value={toWarehouseId} onValueChange={setToWarehouseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona bodega" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id} disabled={w.id === fromWarehouseId}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {fromWarehouse && toWarehouse && (
            <div className="flex items-center gap-2 rounded-md bg-muted/40 p-2 text-xs">
              <span className="flex items-center gap-1">
                <WarehouseIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <strong className="font-semibold">{fromWarehouse.name}</strong>
              </span>
              <ArrowLeftRight className="h-3 w-3 text-muted-foreground" />
              <span className="flex items-center gap-1">
                <WarehouseIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <strong className="font-semibold">{toWarehouse.name}</strong>
              </span>
              <Badge variant="outline" className="ml-auto text-[10px]">
                {totalQty} unidad{totalQty === 1 ? "" : "es"} a mover
              </Badge>
            </div>
          )}

          {/* Líneas */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Productos</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-xs"
                onClick={handleAddLine}
                disabled={!fromWarehouseId}
              >
                <Plus className="h-3 w-3" /> Agregar producto
              </Button>
            </div>

            {!fromWarehouseId ? (
              <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                Selecciona la bodega de origen para ver el stock disponible.
              </p>
            ) : loadingStock ? (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando stock…
              </div>
            ) : variantOptions.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                Esta bodega no tiene stock disponible para mover.
              </p>
            ) : (
              <div className="space-y-2">
                {lines.map((line, idx) => {
                  const selected = stock.find((s) => s.variantId === line.variantId);
                  const available = selected?.quantity ?? 0;
                  const overflow = line.quantity > available && line.variantId !== "";
                  return (
                    <div key={idx} className="grid grid-cols-[minmax(0,1fr)_90px_auto] items-end gap-2">
                      <div className="space-y-1">
                        {idx === 0 && (
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Producto
                          </span>
                        )}
                        <Select
                          value={line.variantId}
                          onValueChange={(v) => handleLineChange(idx, { variantId: v })}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Selecciona producto" />
                          </SelectTrigger>
                          <SelectContent>
                            {variantOptions.map((v) => {
                              const used = lines.some((l, i) => i !== idx && l.variantId === v.variantId);
                              return (
                                <SelectItem key={v.variantId} value={v.variantId} disabled={used}>
                                  {v.label}{" "}
                                  <span className="text-muted-foreground">· {v.available} disp.</span>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        {idx === 0 && (
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Cantidad
                          </span>
                        )}
                        <Input
                          type="number"
                          min={1}
                          max={available || undefined}
                          value={line.quantity}
                          onChange={(e) =>
                            handleLineChange(idx, {
                              quantity: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                          className={cn("h-9", overflow && "border-red-500 text-red-600")}
                        />
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemoveLine(idx)}
                        disabled={lines.length === 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="transfer-notes">Notas (opcional)</Label>
            <textarea
              id="transfer-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Comentario interno sobre la transferencia"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting} className="gap-2">
            {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
            <ArrowLeftRight className="h-4 w-4" />
            Mover stock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
