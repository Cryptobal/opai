"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Loader2, Send, Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

/* ── Types ── */

interface AccountOption {
  id: string;
  code: string;
  name: string;
}

interface Props {
  availableTypes: number[];
  accounts: AccountOption[];
}

interface DteLine {
  itemName: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  discountPct: string;
  isExempt: boolean;
  accountId: string;
  refuerzoSolicitudId?: string;
}

interface PendingBillableItem {
  id: string;
  accountId: string;
  sourceType: string;
  sourceId: string;
  itemName: string;
  description: string | null;
  quantity: string;
  unit: string;
  unitPrice: string;
  netAmount: string;
  status: string;
  createdAt: string;
}

const DTE_TYPE_LABELS: Record<number, string> = {
  33: "Factura Electrónica",
  34: "Factura Exenta",
};

const EMPTY_LINE: DteLine = {
  itemName: "",
  description: "",
  quantity: "1",
  unit: "UN",
  unitPrice: "",
  discountPct: "0",
  isExempt: false,
  accountId: "",
};

const IVA_RATE = 0.19;

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

/* ── Component ── */

export function DteForm({ availableTypes, accounts }: Props) {
  const router = useRouter();

  const [dteType, setDteType] = useState(String(availableTypes[0] ?? 33));
  const [receiverRut, setReceiverRut] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverEmail, setReceiverEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [autoSendEmail, setAutoSendEmail] = useState(false);
  const [lines, setLines] = useState<DteLine[]>([{ ...EMPTY_LINE }]);
  const [saving, setSaving] = useState(false);

  const isExenta = dteType === "34";

  const updateLine = useCallback((index: number, field: keyof DteLine, value: string | boolean) => {
    setLines((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }, []);

  const addLine = useCallback(() => {
    setLines((prev) => [...prev, { ...EMPTY_LINE }]);
  }, []);

  const removeLine = useCallback((index: number) => {
    setLines((prev) => {
      if (prev.length <= 1) {
        toast.error("Se requiere al menos 1 línea");
        return prev;
      }
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const totals = useMemo(() => {
    let netAmount = 0;
    lines.forEach((l) => {
      const qty = parseFloat(l.quantity) || 0;
      const price = parseFloat(l.unitPrice) || 0;
      const discount = parseFloat(l.discountPct) || 0;
      const lineNet = qty * price * (1 - discount / 100);
      netAmount += lineNet;
    });
    const taxAmount = isExenta ? 0 : Math.round(netAmount * IVA_RATE);
    const totalAmount = Math.round(netAmount) + taxAmount;
    return { netAmount: Math.round(netAmount), taxAmount, totalAmount };
  }, [lines, isExenta]);

  const handleSubmit = async () => {
    if (!receiverRut.trim() || !receiverName.trim()) {
      toast.error("RUT y nombre del receptor son obligatorios");
      return;
    }
    const validLines = lines.filter((l) => l.itemName.trim() && parseFloat(l.unitPrice) > 0);
    if (validLines.length === 0) {
      toast.error("Debe incluir al menos una línea con nombre y precio");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        dteType: parseInt(dteType),
        receiverRut: receiverRut.trim(),
        receiverName: receiverName.trim(),
        receiverEmail: receiverEmail.trim() || null,
        notes: notes.trim() || null,
        autoSendEmail,
        lines: validLines.map((l) => ({
          itemName: l.itemName.trim(),
          description: l.description.trim() || null,
          quantity: parseFloat(l.quantity) || 1,
          unit: l.unit.trim() || null,
          unitPrice: parseFloat(l.unitPrice) || 0,
          discountPct: parseFloat(l.discountPct) || 0,
          isExempt: isExenta || l.isExempt,
          accountId: l.accountId || null,
          refuerzoSolicitudId: l.refuerzoSolicitudId || null,
        })),
      };

      const res = await fetch("/api/finance/billing/issued", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al emitir DTE");
      }
      toast.success("DTE emitido exitosamente");
      router.push("/finanzas/facturacion");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  };

  /* ── Pending billable items import ── */

  const [importOpen, setImportOpen] = useState(false);
  const [importAccountId, setImportAccountId] = useState("");
  const [pendingItems, setPendingItems] = useState<PendingBillableItem[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [loadingItems, setLoadingItems] = useState(false);

  const fetchPendingItems = useCallback(async (accountId: string) => {
    if (!accountId) return;
    setLoadingItems(true);
    try {
      const res = await fetch(
        `/api/finance/pending-billable-items?accountId=${accountId}&status=pending`,
      );
      if (!res.ok) throw new Error();
      const json = await res.json();
      setPendingItems(json.data?.items ?? []);
    } catch {
      toast.error("Error al cargar items pendientes");
      setPendingItems([]);
    } finally {
      setLoadingItems(false);
    }
  }, []);

  const handleImportOpen = useCallback(() => {
    setPendingItems([]);
    setSelectedItemIds(new Set());
    setImportAccountId("");
    setImportOpen(true);
  }, []);

  const toggleItem = useCallback((id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleImportSelected = useCallback(() => {
    const selected = pendingItems.filter((i) => selectedItemIds.has(i.id));
    if (selected.length === 0) {
      toast.error("Seleccione al menos un item");
      return;
    }
    const newLines: DteLine[] = selected.map((item) => ({
      itemName: item.itemName,
      description: item.description ?? "",
      quantity: String(parseFloat(item.quantity) || 1),
      unit: item.unit || "UN",
      unitPrice: String(parseFloat(item.unitPrice) || 0),
      discountPct: "0",
      isExempt: false,
      accountId: item.accountId,
      refuerzoSolicitudId: item.sourceType === "refuerzo" ? item.sourceId : undefined,
    }));

    setLines((prev) => {
      // Replace the empty first line if it's the only one and blank
      if (prev.length === 1 && !prev[0].itemName && !prev[0].unitPrice) {
        return newLines;
      }
      return [...prev, ...newLines];
    });

    toast.success(`${selected.length} item(s) importados`);
    setImportOpen(false);
  }, [pendingItems, selectedItemIds]);

  return (
    <div className="space-y-6">
      {/* Header fields */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tipo de documento *</Label>
              <Select value={dteType} onValueChange={setDteType}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableTypes.map((t) => (
                    <SelectItem key={t} value={String(t)}>
                      {DTE_TYPE_LABELS[t] ?? `Tipo ${t}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="border-t mt-4 pt-4">
            <p className="text-sm font-medium mb-3">Receptor</p>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label>RUT *</Label>
                <Input
                  placeholder="12.345.678-9"
                  value={receiverRut}
                  onChange={(e) => setReceiverRut(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Razón Social *</Label>
                <Input
                  value={receiverName}
                  onChange={(e) => setReceiverName(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={receiverEmail}
                  onChange={(e) => setReceiverEmail(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lines */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Detalle</h3>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleImportOpen}>
              <Download className="h-3.5 w-3.5 mr-1" />
              Importar pendientes
            </Button>
            <Button variant="outline" size="sm" onClick={addLine}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Agregar línea
            </Button>
          </div>
        </div>

        {/* Desktop lines */}
        <div className="hidden md:block">
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-3 py-2 font-medium text-muted-foreground">Nombre *</th>
                    <th className="px-3 py-2 font-medium text-muted-foreground w-20">Cant.</th>
                    <th className="px-3 py-2 font-medium text-muted-foreground w-16">Unidad</th>
                    <th className="px-3 py-2 font-medium text-muted-foreground text-right w-28">Precio *</th>
                    <th className="px-3 py-2 font-medium text-muted-foreground text-right w-20">Desc.%</th>
                    <th className="px-3 py-2 font-medium text-muted-foreground text-right w-28">Subtotal</th>
                    <th className="px-3 py-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => {
                    const qty = parseFloat(line.quantity) || 0;
                    const price = parseFloat(line.unitPrice) || 0;
                    const disc = parseFloat(line.discountPct) || 0;
                    const subtotal = qty * price * (1 - disc / 100);
                    return (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="px-3 py-2">
                          <Input
                            value={line.itemName}
                            onChange={(e) => updateLine(i, "itemName", e.target.value)}
                            className="h-8 text-xs"
                            placeholder="Nombre del ítem"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number" min={1}
                            value={line.quantity}
                            onChange={(e) => updateLine(i, "quantity", e.target.value)}
                            className="h-8 text-xs text-right"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            value={line.unit}
                            onChange={(e) => updateLine(i, "unit", e.target.value)}
                            className="h-8 text-xs"
                            placeholder="UN"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number" min={0}
                            value={line.unitPrice}
                            onChange={(e) => updateLine(i, "unitPrice", e.target.value)}
                            className="h-8 text-xs text-right"
                            placeholder="0"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number" min={0} max={100}
                            value={line.discountPct}
                            onChange={(e) => updateLine(i, "discountPct", e.target.value)}
                            className="h-8 text-xs text-right"
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {fmtCLP.format(Math.round(subtotal))}
                        </td>
                        <td className="px-3 py-2">
                          <Button variant="ghost" size="sm" onClick={() => removeLine(i)} className="h-8 w-8 p-0">
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Mobile lines */}
        <div className="md:hidden space-y-3">
          {lines.map((line, i) => {
            const qty = parseFloat(line.quantity) || 0;
            const price = parseFloat(line.unitPrice) || 0;
            const disc = parseFloat(line.discountPct) || 0;
            const subtotal = qty * price * (1 - disc / 100);
            return (
              <Card key={i}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Línea {i + 1}</span>
                    <Button variant="ghost" size="sm" onClick={() => removeLine(i)} className="h-7 w-7 p-0">
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                  <Input
                    value={line.itemName}
                    onChange={(e) => updateLine(i, "itemName", e.target.value)}
                    className="h-8 text-xs"
                    placeholder="Nombre del ítem *"
                  />
                  <div className="grid grid-cols-3 gap-2 min-w-0">
                    <div className="space-y-1">
                      <Label className="text-[10px]">Cant.</Label>
                      <Input
                        type="number" min={1}
                        value={line.quantity}
                        onChange={(e) => updateLine(i, "quantity", e.target.value)}
                        className="h-8 text-xs text-right"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]">Precio *</Label>
                      <Input
                        type="number" min={0}
                        value={line.unitPrice}
                        onChange={(e) => updateLine(i, "unitPrice", e.target.value)}
                        className="h-8 text-xs text-right"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]">Desc.%</Label>
                      <Input
                        type="number" min={0} max={100}
                        value={line.discountPct}
                        onChange={(e) => updateLine(i, "discountPct", e.target.value)}
                        className="h-8 text-xs text-right"
                      />
                    </div>
                  </div>
                  <div className="text-right text-xs font-mono">
                    Subtotal: {fmtCLP.format(Math.round(subtotal))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Totals */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col items-end gap-1 text-sm">
            <div className="flex items-center gap-8">
              <span className="text-muted-foreground">Neto</span>
              <span className="font-mono w-28 text-right">{fmtCLP.format(totals.netAmount)}</span>
            </div>
            {!isExenta && (
              <div className="flex items-center gap-8">
                <span className="text-muted-foreground">IVA (19%)</span>
                <span className="font-mono w-28 text-right">{fmtCLP.format(totals.taxAmount)}</span>
              </div>
            )}
            <div className="flex items-center gap-8 font-medium border-t pt-1 mt-1">
              <span>Total</span>
              <span className="font-mono w-28 text-right">{fmtCLP.format(totals.totalAmount)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Options */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Notas / Observaciones</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notas opcionales para el documento"
                className="h-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="dte-auto-email"
                checked={autoSendEmail}
                onChange={(e) => setAutoSendEmail(e.target.checked)}
                className="rounded border-border"
              />
              <Label htmlFor="dte-auto-email">Enviar automáticamente por email al receptor</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          onClick={() => router.push("/finanzas/facturacion")}
          disabled={saving}
        >
          Cancelar
        </Button>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
          Emitir documento
        </Button>
      </div>

      {/* Import pending billable items dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Importar items pendientes</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Cuenta / Cliente</Label>
              <Select
                value={importAccountId}
                onValueChange={(v) => {
                  setImportAccountId(v);
                  fetchPendingItems(v);
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Seleccione una cuenta" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.code} - {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {loadingItems && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {!loadingItems && importAccountId && pendingItems.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No hay items pendientes para esta cuenta.
              </p>
            )}

            {!loadingItems && pendingItems.length > 0 && (
              <div className="max-h-64 overflow-y-auto border rounded-md divide-y">
                {pendingItems.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-start gap-3 p-3 hover:bg-muted/50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedItemIds.has(item.id)}
                      onChange={() => toggleItem(item.id)}
                      className="mt-0.5 rounded border-border"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.itemName}</p>
                      {item.description && (
                        <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                      )}
                      <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                        <span>{parseFloat(item.quantity)} {item.unit}</span>
                        <span>x {fmtCLP.format(parseFloat(item.unitPrice))}</span>
                        <span className="font-medium text-foreground">
                          = {fmtCLP.format(parseFloat(item.netAmount))}
                        </span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleImportSelected}
              disabled={selectedItemIds.size === 0}
            >
              Importar {selectedItemIds.size > 0 ? `(${selectedItemIds.size})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
