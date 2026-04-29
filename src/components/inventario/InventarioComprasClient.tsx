"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Surface, Tag, IconBubble, EmptyState, Spinner } from "@/components/opai-ds";
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
import { Plus, Upload, X, FileSpreadsheet, AlertTriangle, Check, Download, Trash2, Pencil, ShoppingCart } from "lucide-react";
import { SearchableSelect } from "@/components/ui/SearchableSelect";

type Purchase = {
  id: string;
  date: string;
  notes: string | null;
  lines: {
    id: string;
    quantity: number;
    unitCost: number;
    variantId: string;
    warehouseId: string;
    variant: { product: { id: string; name: string }; size: { sizeCode: string } | null };
    warehouse: { id: string; name: string };
  }[];
};

type Product = {
  id: string;
  name: string;
  category: string;
  variants: { id: string; size: { id: string; sizeCode: string } | null }[];
};

type Variant = {
  id: string;
  product: { name: string };
  size: { sizeCode: string } | null;
};

type Warehouse = { id: string; name: string };

type CompraFormLine = {
  productId: string;
  variantId: string;
  quantity: number;
  unitCost: number;
  warehouseId: string;
};

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

// Minimal RFC-4180-ish CSV parser: handles quoted fields, doubled quotes,
// embedded newlines, and both \n and \r\n line endings.
function parseCsvRows(text: string): Record<string, unknown>[] {
  const rows: string[][] = [];
  let current: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cell += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      current.push(cell);
      cell = "";
    } else if (c === "\n") {
      current.push(cell);
      rows.push(current);
      current = [];
      cell = "";
    } else if (c !== "\r") {
      cell += c;
    }
  }
  if (cell.length > 0 || current.length > 0) {
    current.push(cell);
    rows.push(current);
  }
  const nonEmpty = rows.filter((r) => r.some((v) => v.trim() !== ""));
  if (nonEmpty.length === 0) return [];
  const headers = nonEmpty[0].map((h) => h.trim());
  return nonEmpty.slice(1).map((row) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      if (!h) return;
      obj[h] = row[idx] ?? "";
    });
    return obj;
  });
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
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    notes: "",
    lines: [{ productId: "", variantId: "", quantity: 1, unitCost: 0, warehouseId: "" }] as CompraFormLine[],
  });

  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [editForm, setEditForm] = useState({
    date: "",
    notes: "",
    lines: [] as CompraFormLine[],
  });
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

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

      const prods = Array.isArray(vRes) ? vRes : [];
      setProducts(prods);
      const allVariants: Variant[] = [];
      for (const p of prods) {
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
          lines: [{ productId: "", variantId: "", quantity: 1, unitCost: 0, warehouseId: "" }],
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
      lines: [...f.lines, { productId: "", variantId: "", quantity: 1, unitCost: 0, warehouseId: "" }],
    }));
  };

  const removeCompraLine = (index: number) => {
    setForm((f) => ({
      ...f,
      lines: f.lines.length > 1 ? f.lines.filter((_, i) => i !== index) : f.lines,
    }));
  };

  const updateCompraLine = (index: number, patch: Partial<CompraFormLine>) => {
    setForm((f) => {
      const next = [...f.lines];
      next[index] = { ...next[index], ...patch };
      if (patch.productId !== undefined) {
        next[index].variantId = "";
      }
      return { ...f, lines: next };
    });
  };

  const getSizesForCompraProduct = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return [];
    return product.variants.map((v) => ({
      variantId: v.id,
      sizeCode: v.size?.sizeCode ?? "Única",
    }));
  };

  // ── Edit / Delete handlers ──

  const startEdit = (p: Purchase) => {
    setEditingPurchase(p);
    setEditForm({
      date: new Date(p.date).toISOString().slice(0, 10),
      notes: p.notes ?? "",
      lines: p.lines.map((l) => ({
        productId: l.variant.product.id,
        variantId: l.variantId,
        quantity: l.quantity,
        unitCost: Number(l.unitCost),
        warehouseId: l.warehouseId,
      })),
    });
    setEditDialogOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPurchase) return;
    const validLines = editForm.lines.filter(
      (l) => l.variantId && l.quantity > 0 && l.warehouseId
    );
    if (validLines.length === 0) {
      alert("Agrega al menos una línea válida");
      return;
    }
    try {
      const res = await fetch(`/api/ops/inventario/purchases/${editingPurchase.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: editForm.date,
          notes: editForm.notes || undefined,
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
        setEditDialogOpen(false);
        setEditingPurchase(null);
        fetchData();
      } else {
        alert(data.error || "Error al actualizar compra");
      }
    } catch (err) {
      console.error(err);
      alert("Error al actualizar compra");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta compra? Se revertirá el stock asociado.")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/ops/inventario/purchases/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        fetchData();
      } else {
        alert(data.error || "Error al eliminar compra");
      }
    } catch (err) {
      console.error(err);
      alert("Error al eliminar compra");
    } finally {
      setDeleting(null);
    }
  };

  const addEditLine = () => {
    setEditForm((f) => ({
      ...f,
      lines: [...f.lines, { productId: "", variantId: "", quantity: 1, unitCost: 0, warehouseId: "" }],
    }));
  };

  const removeEditLine = (index: number) => {
    setEditForm((f) => ({
      ...f,
      lines: f.lines.length > 1 ? f.lines.filter((_, i) => i !== index) : f.lines,
    }));
  };

  const updateEditLine = (index: number, patch: Partial<CompraFormLine>) => {
    setEditForm((f) => {
      const next = [...f.lines];
      next[index] = { ...next[index], ...patch };
      if (patch.productId !== undefined) {
        next[index].variantId = "";
      }
      return { ...f, lines: next };
    });
  };

  const variantLabel = (v: Variant) =>
    v.size ? `${v.product.name} ${v.size.sizeCode}` : v.product.name;

  // ── Excel import handlers ──

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      let rows: Record<string, unknown>[];

      if (ext === "csv") {
        rows = parseCsvRows(await file.text());
      } else {
        const ExcelJS = (await import("exceljs")).default;
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(await file.arrayBuffer());
        const ws = wb.worksheets[0];
        if (!ws) {
          alert("El archivo no contiene hojas de cálculo");
          return;
        }
        const headerRow = ws.getRow(1);
        const headers: string[] = [];
        headerRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
          headers[colNum - 1] = String(cell.value ?? "").trim();
        });
        rows = [];
        ws.eachRow({ includeEmpty: false }, (row, rowIdx) => {
          if (rowIdx === 1) return;
          const values = row.values as unknown[];
          const obj: Record<string, unknown> = {};
          headers.forEach((h, i) => {
            if (!h) return;
            const v = values[i + 1];
            obj[h] = v ?? "";
          });
          rows.push(obj);
        });
      }

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
    <div className="space-y-4 ds-page-enter">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-2 ml-auto">
          {/* Import Excel Dialog */}
          <Dialog open={importDialogOpen} onOpenChange={(open) => {
            setImportDialogOpen(open);
            if (!open) {
              setImportLines([]);
              setImportResult(null);
            }
          }}>
            <DialogTrigger asChild>
              <Button variant="outline" className="h-10 sm:h-9">
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
                {/* File upload + template download */}
                <div className="flex items-center gap-3 flex-wrap">
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      const res = await fetch("/api/ops/inventario/purchases/template");
                      if (!res.ok) { alert("Error al descargar plantilla"); return; }
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "plantilla-compra-inventario.xlsx";
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    <Download className="h-4 w-4 mr-1.5" />
                    Descargar Plantilla
                  </Button>
                  <span className="text-[12px] text-ds-text-3">
                    Columnas: Producto, Talla, Cantidad, Costo Unitario, Bodega
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
                          className="w-full h-10 sm:h-9 rounded-ds-md border border-ds-border-default bg-ds-surface-2 px-3 text-sm text-ds-text-1"
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
                      <Tag variant="ok" size="md" icon={Check}>
                        {matchedCount} matcheados
                      </Tag>
                      {unmatchedCount > 0 && (
                        <Tag variant="warn" size="md" icon={AlertTriangle}>
                          {unmatchedCount} sin match
                        </Tag>
                      )}
                      <span className="text-[12px] text-ds-text-3 self-center">
                        Total: {importLines.length} líneas
                      </span>
                    </div>

                    {/* Preview table */}
                    <div className="rounded-ds-md border border-ds-border-default overflow-hidden">
                      <div className="max-h-64 overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-ds-surface-3 sticky top-0">
                            <tr>
                              <th className="text-left p-2 text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4">Producto</th>
                              <th className="text-left p-2 text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4">Talla</th>
                              <th className="text-right p-2 text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4">Cant.</th>
                              <th className="text-right p-2 text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4">Costo U.</th>
                              <th className="text-left p-2 text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4">Bodega</th>
                              <th className="text-center p-2 text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4">Match</th>
                              <th className="p-2"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-ds-border-subtle">
                            {importLines.map((line, idx) => (
                              <tr
                                key={idx}
                                className={
                                  line.matched
                                    ? ""
                                    : "bg-status-warn-soft/40"
                                }
                              >
                                <td className="p-2 text-ds-text-1">
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
                                <td className="p-2 text-ds-text-2">{line.talla}</td>
                                <td className="p-2 text-right ds-num text-ds-text-1">{line.cantidad}</td>
                                <td className="p-2 text-right ds-num text-ds-text-2">
                                  {line.costoUnitario > 0
                                    ? `$${line.costoUnitario.toLocaleString("es-CL")}`
                                    : "-"}
                                </td>
                                <td className="p-2 text-ds-text-2">{line.bodega || "(defecto)"}</td>
                                <td className="p-2 text-center">
                                  {line.matched ? (
                                    <Check className="h-4 w-4 text-status-ok-fg mx-auto" />
                                  ) : (
                                    <AlertTriangle className="h-4 w-4 text-status-warn-fg mx-auto" />
                                  )}
                                </td>
                                <td className="p-2">
                                  <button
                                    type="button"
                                    onClick={() => removeImportLine(idx)}
                                    className="text-ds-text-3 hover:text-ds-text-1"
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
                  <div className="rounded-ds-md border border-status-ok-border bg-status-ok-soft p-3 text-sm text-status-ok-fg">
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
                    <div className="space-y-3 max-h-60 overflow-y-auto">
                      {form.lines.map((line, i) => {
                        const sizes = line.productId ? getSizesForCompraProduct(line.productId) : [];
                        return (
                          <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[12px] font-medium text-ds-text-3">Línea {i + 1}</span>
                              {form.lines.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeCompraLine(i)}
                                  className="text-ds-text-3 hover:text-status-danger-fg transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>

                            {/* Product selector */}
                            <div>
                              <Label className="text-xs">Producto</Label>
                              <select
                                className="w-full h-10 sm:h-9 rounded-ds-md border border-ds-border-default bg-ds-surface-2 px-3 text-sm text-ds-text-1"
                                value={line.productId}
                                onChange={(e) => updateCompraLine(i, { productId: e.target.value })}
                              >
                                <option value="">Seleccionar producto</option>
                                {products.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Size + Quantity + Cost + Warehouse */}
                            {line.productId && (
                              <div className="grid grid-cols-12 gap-2">
                                <div className="col-span-3">
                                  <Label className="text-xs">Talla</Label>
                                  <select
                                    className="w-full h-10 sm:h-9 rounded-ds-md border border-ds-border-default bg-ds-surface-2 px-3 text-sm text-ds-text-1"
                                    value={line.variantId}
                                    onChange={(e) => updateCompraLine(i, { variantId: e.target.value })}
                                  >
                                    <option value="">Talla</option>
                                    {sizes.map((s) => (
                                      <option key={s.variantId} value={s.variantId}>
                                        {s.sizeCode}
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
                                      updateCompraLine(i, { quantity: parseInt(e.target.value) || 0 })
                                    }
                                    disabled={!line.variantId}
                                  />
                                </div>
                                <div className="col-span-3">
                                  <Label className="text-xs">Costo unit.</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    value={line.unitCost || ""}
                                    onChange={(e) =>
                                      updateCompraLine(i, { unitCost: parseFloat(e.target.value) || 0 })
                                    }
                                    disabled={!line.variantId}
                                  />
                                </div>
                                <div className="col-span-4">
                                  <Label className="text-xs">Bodega</Label>
                                  <select
                                    className="w-full h-10 sm:h-9 rounded-ds-md border border-ds-border-default bg-ds-surface-2 px-3 text-sm text-ds-text-1"
                                    value={line.warehouseId}
                                    onChange={(e) =>
                                      updateCompraLine(i, { warehouseId: e.target.value })
                                    }
                                    disabled={!line.variantId}
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
                            )}
                          </div>
                        );
                      })}
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
      </div>
      <div>
        {loading ? (
          <Spinner block label="Cargando…" />
        ) : error ? (
          <Surface elevation={1} padding="md" className="border-status-warn-border bg-status-warn-soft">
            <p className="text-sm text-status-warn-fg">{error}</p>
          </Surface>
        ) : purchases.length === 0 ? (
          <Surface elevation={1} padding="none">
            <EmptyState
              icon={ShoppingCart}
              title="Sin compras registradas"
              description="Crea productos, bodegas y registra tu primera compra."
            />
          </Surface>
        ) : (
          <ul className="space-y-2 ds-list-cascade">
            {purchases.map((p) => (
              <li key={p.id}>
              <Surface elevation={1} padding="sm" hoverable>
                <div className="flex justify-between items-start gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <IconBubble icon={ShoppingCart} variant="info" size="md" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-[14px] font-semibold ds-num text-ds-text-1">
                          {new Date(p.date).toLocaleDateString("es-CL")}
                        </span>
                        {p.notes && (
                          <span className="text-[12px] text-ds-text-3 truncate">{p.notes}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(p)}
                      className="p-2 rounded-ds-sm text-ds-text-3 hover:text-ds-text-1 hover:bg-ds-surface-3 transition-colors"
                      title="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(p.id)}
                      disabled={deleting === p.id}
                      className="p-2 rounded-ds-sm text-ds-text-3 hover:text-status-danger-fg hover:bg-status-danger-soft transition-colors disabled:opacity-50"
                      title="Eliminar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <ul className="mt-2 space-y-0.5 text-[12px] text-ds-text-3 font-mono">
                  {p.lines.map((l) => (
                    <li key={l.id} className="truncate">
                      {l.quantity} × {l.variant.product.name}
                      {l.variant.size && ` ${l.variant.size.sizeCode}`} → {l.warehouse.name}{" "}
                      <span className="text-ds-text-4 ds-num">
                        (${Number(l.unitCost).toLocaleString("es-CL")}/u)
                      </span>
                    </li>
                  ))}
                </ul>
              </Surface>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Edit purchase dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => {
        setEditDialogOpen(open);
        if (!open) setEditingPurchase(null);
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleEditSubmit}>
            <DialogHeader>
              <DialogTitle>Editar compra</DialogTitle>
              <DialogDescription>
                Modifica las líneas de la compra. El stock se ajustará automáticamente.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Fecha</Label>
                  <Input
                    type="date"
                    value={editForm.date}
                    onChange={(e) => setEditForm((f) => ({ ...f, date: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label>Notas</Label>
                  <Input
                    value={editForm.notes}
                    onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Opcional"
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label>Líneas</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addEditLine}>
                    + Línea
                  </Button>
                </div>
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {editForm.lines.map((line, i) => {
                    const sizes = line.productId ? getSizesForCompraProduct(line.productId) : [];
                    return (
                      <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[12px] font-medium text-ds-text-3">Línea {i + 1}</span>
                          {editForm.lines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeEditLine(i)}
                              className="text-ds-text-3 hover:text-status-danger-fg transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <div>
                          <Label className="text-xs">Producto</Label>
                          <select
                            className="w-full h-10 sm:h-9 rounded-ds-md border border-ds-border-default bg-ds-surface-2 px-3 text-sm text-ds-text-1"
                            value={line.productId}
                            onChange={(e) => updateEditLine(i, { productId: e.target.value })}
                          >
                            <option value="">Seleccionar producto</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        {line.productId && (
                          <div className="grid grid-cols-12 gap-2">
                            <div className="col-span-3">
                              <Label className="text-xs">Talla</Label>
                              <select
                                className="w-full h-10 sm:h-9 rounded-ds-md border border-ds-border-default bg-ds-surface-2 px-3 text-sm text-ds-text-1"
                                value={line.variantId}
                                onChange={(e) => updateEditLine(i, { variantId: e.target.value })}
                              >
                                <option value="">Talla</option>
                                {sizes.map((s) => (
                                  <option key={s.variantId} value={s.variantId}>
                                    {s.sizeCode}
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
                                  updateEditLine(i, { quantity: parseInt(e.target.value) || 0 })
                                }
                                disabled={!line.variantId}
                              />
                            </div>
                            <div className="col-span-3">
                              <Label className="text-xs">Costo unit.</Label>
                              <Input
                                type="number"
                                min={0}
                                step={0.01}
                                value={line.unitCost || ""}
                                onChange={(e) =>
                                  updateEditLine(i, { unitCost: parseFloat(e.target.value) || 0 })
                                }
                                disabled={!line.variantId}
                              />
                            </div>
                            <div className="col-span-4">
                              <Label className="text-xs">Bodega</Label>
                              <select
                                className="w-full h-10 sm:h-9 rounded-ds-md border border-ds-border-default bg-ds-surface-2 px-3 text-sm text-ds-text-1"
                                value={line.warehouseId}
                                onChange={(e) =>
                                  updateEditLine(i, { warehouseId: e.target.value })
                                }
                                disabled={!line.variantId}
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
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="h-10 sm:h-9">Guardar cambios</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
