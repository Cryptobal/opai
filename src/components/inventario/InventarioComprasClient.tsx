"use client";

import { useEffect, useRef, useState } from "react";
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
import { Plus, Upload, X, FileSpreadsheet, AlertTriangle, Check } from "lucide-react";
import { SearchableSelect } from "@/components/ui/SearchableSelect";

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

type ImportLine = {
  producto: string;
  talla: string;
  cantidad: number;
  costoUnitario: number;
  bodega: string;
  // resolved
  variantId: string;
  warehouseId: string;
  matched: boolean;
  error?: string;
};

function normalizeStr(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function matchVariant(
  producto: string,
  talla: string,
  variants: Variant[]
): Variant | undefined {
  const normProd = normalizeStr(producto);
  const normTalla = normalizeStr(talla);

  // Exact match first
  const exact = variants.find((v) => {
    const vName = normalizeStr(v.product.name);
    const vSize = v.size ? normalizeStr(v.size.sizeCode) : "";
    return vName === normProd && vSize === normTalla;
  });
  if (exact) return exact;

  // Fuzzy: product contains or starts with
  const fuzzy = variants.find((v) => {
    const vName = normalizeStr(v.product.name);
    const vSize = v.size ? normalizeStr(v.size.sizeCode) : "";
    return (
      (vName.includes(normProd) || normProd.includes(vName)) &&
      vSize === normTalla
    );
  });
  if (fuzzy) return fuzzy;

  // If no talla, match product only (for assets)
  if (!normTalla) {
    return variants.find((v) => {
      const vName = normalizeStr(v.product.name);
      return (vName === normProd || vName.includes(normProd) || normProd.includes(vName)) && !v.size;
    });
  }

  return undefined;
}

function matchWarehouse(
  bodega: string,
  warehouses: Warehouse[]
): Warehouse | undefined {
  const norm = normalizeStr(bodega);
  return (
    warehouses.find((w) => normalizeStr(w.name) === norm) ||
    warehouses.find((w) => normalizeStr(w.name).includes(norm) || norm.includes(normalizeStr(w.name)))
  );
}

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

  // Excel import state
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importLines, setImportLines] = useState<ImportLine[]>([]);
  const [importDate, setImportDate] = useState(new Date().toISOString().slice(0, 10));
  const [importNotes, setImportNotes] = useState("");
  const [importDefaultWarehouseId, setImportDefaultWarehouseId] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // ── Excel import handlers ──

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const XLSX = await import("xlsx");
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

      if (rows.length === 0) {
        alert("El archivo está vacío");
        return;
      }

      // Map columns flexibly
      const lines: ImportLine[] = rows.map((row) => {
        const keys = Object.keys(row);
        const findCol = (patterns: string[]) =>
          keys.find((k) =>
            patterns.some((p) => normalizeStr(k).includes(p))
          ) || "";

        const prodCol = findCol(["producto", "product", "nombre", "item", "descripcion"]);
        const tallaCol = findCol(["talla", "size", "tamano", "medida"]);
        const cantCol = findCol(["cant", "quantity", "qty", "unidades"]);
        const costoCol = findCol(["costo", "cost", "precio", "price", "valor", "unit"]);
        const bodegaCol = findCol(["bodega", "warehouse", "almacen", "destino"]);

        const producto = String(row[prodCol] || "").trim();
        const talla = String(row[tallaCol] || "").trim();
        const cantidad = parseInt(String(row[cantCol] || "0")) || 0;
        const costoUnitario = parseFloat(String(row[costoCol] || "0")) || 0;
        const bodega = String(row[bodegaCol] || "").trim();

        // Try to match
        const matchedVariant = matchVariant(producto, talla, variants);
        const matchedWarehouse = bodega
          ? matchWarehouse(bodega, warehouses)
          : undefined;

        const errors: string[] = [];
        if (!matchedVariant) errors.push("Producto no encontrado");
        if (cantidad <= 0) errors.push("Cantidad inválida");

        return {
          producto,
          talla,
          cantidad,
          costoUnitario,
          bodega,
          variantId: matchedVariant?.id || "",
          warehouseId: matchedWarehouse?.id || "",
          matched: !!matchedVariant && cantidad > 0,
          error: errors.length > 0 ? errors.join(", ") : undefined,
        };
      });

      setImportLines(lines.filter((l) => l.producto)); // skip empty rows
      setImportResult(null);
    } catch (err) {
      console.error(err);
      alert("Error al leer el archivo. Verifica que sea un Excel válido (.xlsx/.csv).");
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleImportSubmit = async () => {
    const validLines = importLines.filter(
      (l) => l.variantId && l.cantidad > 0 && (l.warehouseId || importDefaultWarehouseId)
    );

    if (validLines.length === 0) {
      alert("No hay líneas válidas para importar. Verifica los matches de productos.");
      return;
    }

    setImporting(true);
    try {
      const res = await fetch("/api/ops/inventario/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: importDate,
          notes: importNotes || undefined,
          lines: validLines.map((l) => ({
            variantId: l.variantId,
            quantity: l.cantidad,
            unitCost: l.costoUnitario,
            warehouseId: l.warehouseId || importDefaultWarehouseId,
          })),
        }),
      });
      const data = await res.json();
      if (data.id) {
        setImportResult(
          `Compra registrada: ${validLines.length} líneas importadas exitosamente.`
        );
        setImportLines([]);
        fetchData();
      } else {
        alert(data.error || "Error al registrar compra importada");
      }
    } catch (err) {
      console.error(err);
      alert("Error al enviar la compra");
    } finally {
      setImporting(false);
    }
  };

  const removeImportLine = (idx: number) => {
    setImportLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const matchedCount = importLines.filter((l) => l.matched).length;
  const unmatchedCount = importLines.filter((l) => !l.matched).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Ingresos</CardTitle>
          <CardDescription>
            Registra compras de uniformes. El stock se actualiza automáticamente.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          {/* Import Excel Dialog */}
          <Dialog open={importDialogOpen} onOpenChange={(open) => {
            setImportDialogOpen(open);
            if (!open) {
              setImportLines([]);
              setImportResult(null);
            }
          }}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Upload className="h-4 w-4 mr-2" />
                Importar Excel
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Importar compra desde Excel</DialogTitle>
                <DialogDescription>
                  Sube un archivo Excel (.xlsx) o CSV con las columnas: Producto, Talla, Cantidad, Costo Unitario, Bodega (opcional).
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                {/* File upload */}
                <div className="flex items-center gap-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Seleccionar archivo
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Columnas esperadas: Producto, Talla, Cantidad, Costo Unitario, Bodega
                  </span>
                </div>

                {/* Date, notes, default warehouse */}
                {importLines.length > 0 && (
                  <>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label>Fecha</Label>
                        <Input
                          type="date"
                          value={importDate}
                          onChange={(e) => setImportDate(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Notas</Label>
                        <Input
                          value={importNotes}
                          onChange={(e) => setImportNotes(e.target.value)}
                          placeholder="Ej: Factura #12345"
                        />
                      </div>
                      <div>
                        <Label>Bodega por defecto</Label>
                        <select
                          className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                          value={importDefaultWarehouseId}
                          onChange={(e) => setImportDefaultWarehouseId(e.target.value)}
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

                    {/* Summary badges */}
                    <div className="flex gap-3">
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                        <Check className="h-3 w-3" />
                        {matchedCount} matcheados
                      </span>
                      {unmatchedCount > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="h-3 w-3" />
                          {unmatchedCount} sin match
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground self-center">
                        Total: {importLines.length} líneas
                      </span>
                    </div>

                    {/* Preview table */}
                    <div className="rounded-lg border overflow-hidden">
                      <div className="max-h-64 overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50 sticky top-0">
                            <tr>
                              <th className="text-left p-2 font-medium">Producto</th>
                              <th className="text-left p-2 font-medium">Talla</th>
                              <th className="text-right p-2 font-medium">Cant.</th>
                              <th className="text-right p-2 font-medium">Costo U.</th>
                              <th className="text-left p-2 font-medium">Bodega</th>
                              <th className="text-center p-2 font-medium">Match</th>
                              <th className="p-2"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {importLines.map((line, idx) => (
                              <tr
                                key={idx}
                                className={
                                  line.matched
                                    ? ""
                                    : "bg-amber-500/5"
                                }
                              >
                                <td className="p-2">
                                  {line.producto}
                                  {!line.matched && line.variantId === "" && (
                                    <div className="mt-1">
                                      <SearchableSelect
                                        value={line.variantId}
                                        options={variants.map((v) => ({
                                          id: v.id,
                                          label: variantLabel(v),
                                        }))}
                                        placeholder="Match manual..."
                                        emptyText="Sin match"
                                        onChange={(id) =>
                                          setImportLines((prev) => {
                                            const next = [...prev];
                                            next[idx] = { ...next[idx], variantId: id, matched: true, error: undefined };
                                            return next;
                                          })
                                        }
                                      />
                                    </div>
                                  )}
                                </td>
                                <td className="p-2">{line.talla}</td>
                                <td className="p-2 text-right">{line.cantidad}</td>
                                <td className="p-2 text-right">
                                  {line.costoUnitario > 0
                                    ? `$${line.costoUnitario.toLocaleString("es-CL")}`
                                    : "-"}
                                </td>
                                <td className="p-2">{line.bodega || "(defecto)"}</td>
                                <td className="p-2 text-center">
                                  {line.matched ? (
                                    <Check className="h-4 w-4 text-emerald-500 mx-auto" />
                                  ) : (
                                    <AlertTriangle className="h-4 w-4 text-amber-500 mx-auto" />
                                  )}
                                </td>
                                <td className="p-2">
                                  <button
                                    type="button"
                                    onClick={() => removeImportLine(idx)}
                                    className="text-muted-foreground hover:text-foreground"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}

                {importResult && (
                  <div className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">
                    {importResult}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setImportDialogOpen(false);
                    setImportLines([]);
                    setImportResult(null);
                  }}
                >
                  Cancelar
                </Button>
                {importLines.length > 0 && !importResult && (
                  <Button
                    type="button"
                    onClick={handleImportSubmit}
                    disabled={importing || matchedCount === 0 || (!importDefaultWarehouseId && importLines.some((l) => !l.warehouseId))}
                  >
                    {importing ? "Importando..." : `Registrar ${matchedCount} líneas`}
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Manual purchase dialog */}
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
                            <SearchableSelect
                              value={line.variantId}
                              options={variants.map((v) => ({
                                id: v.id,
                                label: variantLabel(v),
                              }))}
                              placeholder="Seleccionar"
                              emptyText="Sin productos"
                              onChange={(id) =>
                                setForm((f) => {
                                  const next = [...f.lines];
                                  next[i] = { ...next[i], variantId: id };
                                  return { ...f, lines: next };
                                })
                              }
                            />
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
                              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
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
        </div>
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
