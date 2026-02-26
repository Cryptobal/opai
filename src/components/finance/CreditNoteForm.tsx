"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
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
import { Plus, Trash2, Loader2, Send, Copy } from "lucide-react";
import { toast } from "sonner";

/* ── Types ── */

interface ReferenceDte {
  id: string;
  dteType: number;
  folio: number;
  receiverRut: string;
  receiverName: string;
  totalAmount: number;
  lines: {
    itemName: string;
    description: string | null;
    quantity: number;
    unitPrice: number;
  }[];
}

interface Props {
  noteType: "credit" | "debit";
  referenceDte: ReferenceDte | null;
}

interface NoteLine {
  itemName: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

const DTE_TYPE_LABELS: Record<number, string> = {
  33: "Factura Electrónica",
  34: "Factura Exenta",
  39: "Boleta Electrónica",
};

const EMPTY_LINE: NoteLine = {
  itemName: "",
  description: "",
  quantity: "1",
  unitPrice: "",
};

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

/* ── Component ── */

export function CreditNoteForm({ noteType, referenceDte }: Props) {
  const router = useRouter();
  const isCredit = noteType === "credit";

  const [reason, setReason] = useState("");
  const [referenceType, setReferenceType] = useState("1");
  const [lines, setLines] = useState<NoteLine[]>([{ ...EMPTY_LINE }]);
  const [saving, setSaving] = useState(false);

  const updateLine = useCallback((index: number, field: keyof NoteLine, value: string) => {
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
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const copyFromReference = useCallback(() => {
    if (!referenceDte?.lines.length) return;
    setLines(
      referenceDte.lines.map((l) => ({
        itemName: l.itemName,
        description: l.description ?? "",
        quantity: String(l.quantity),
        unitPrice: String(l.unitPrice),
      }))
    );
    toast.success("Líneas copiadas del DTE original");
  }, [referenceDte]);

  const total = useMemo(() => {
    return lines.reduce((sum, l) => {
      const qty = parseFloat(l.quantity) || 0;
      const price = parseFloat(l.unitPrice) || 0;
      return sum + qty * price;
    }, 0);
  }, [lines]);

  const handleSubmit = async () => {
    if (!referenceDte) {
      toast.error("No se ha seleccionado un DTE de referencia");
      return;
    }
    if (!reason.trim()) {
      toast.error("La razón es obligatoria");
      return;
    }
    const validLines = lines.filter((l) => l.itemName.trim() && parseFloat(l.unitPrice) > 0);
    if (validLines.length === 0) {
      toast.error("Debe incluir al menos una línea");
      return;
    }

    setSaving(true);
    try {
      const endpoint = isCredit
        ? "/api/finance/billing/credit-note"
        : "/api/finance/billing/debit-note";

      const payload = {
        referenceDteId: referenceDte.id,
        reason: reason.trim(),
        referenceType: parseInt(referenceType),
        lines: validLines.map((l) => ({
          itemName: l.itemName.trim(),
          description: l.description.trim() || null,
          quantity: parseFloat(l.quantity) || 1,
          unitPrice: parseFloat(l.unitPrice) || 0,
        })),
      };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Error al emitir nota de ${isCredit ? "crédito" : "débito"}`);
      }
      toast.success(`Nota de ${isCredit ? "crédito" : "débito"} emitida`);
      router.push("/finanzas/facturacion");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Reference DTE info */}
      {referenceDte ? (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm font-medium mb-3">DTE de referencia</p>
            <div className="grid gap-2 md:grid-cols-4 text-sm">
              <div>
                <span className="text-muted-foreground text-xs">Tipo</span>
                <p>{DTE_TYPE_LABELS[referenceDte.dteType] ?? `Tipo ${referenceDte.dteType}`}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Folio</span>
                <p className="font-mono">{referenceDte.folio}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Receptor</span>
                <p>{referenceDte.receiverName}</p>
                <p className="text-xs text-muted-foreground font-mono">{referenceDte.receiverRut}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Total original</span>
                <p className="font-mono font-medium">{fmtCLP.format(referenceDte.totalAmount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-4 text-center text-muted-foreground">
            <p>No se proporcionó un DTE de referencia.</p>
            <p className="text-xs mt-1">Use los botones de NC/ND en la lista de DTEs emitidos.</p>
          </CardContent>
        </Card>
      )}

      {/* Reason and reference type */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Razón *</Label>
              <Input
                placeholder={isCredit ? "Ej: Devolución de producto" : "Ej: Corrección de monto"}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de referencia</Label>
              <Select value={referenceType} onValueChange={setReferenceType}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Anula documento de referencia</SelectItem>
                  <SelectItem value="2">Corrige texto</SelectItem>
                  <SelectItem value="3">Corrige montos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lines */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Detalle</h3>
          <div className="flex gap-2">
            {referenceDte && referenceDte.lines.length > 0 && (
              <Button variant="outline" size="sm" onClick={copyFromReference}>
                <Copy className="h-3.5 w-3.5 mr-1" />
                Copiar del original
              </Button>
            )}
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
                <thead className="bg-muted/30">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Nombre *</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Descripción</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground w-20">Cant.</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground w-28">Precio *</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground w-28">Subtotal</th>
                    <th className="px-3 py-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => {
                    const qty = parseFloat(line.quantity) || 0;
                    const price = parseFloat(line.unitPrice) || 0;
                    const subtotal = qty * price;
                    return (
                      <tr key={i} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2">
                          <Input
                            value={line.itemName}
                            onChange={(e) => updateLine(i, "itemName", e.target.value)}
                            className="h-8 text-xs"
                            placeholder="Nombre"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            value={line.description}
                            onChange={(e) => updateLine(i, "description", e.target.value)}
                            className="h-8 text-xs"
                            placeholder="Descripción"
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
                            type="number" min={0}
                            value={line.unitPrice}
                            onChange={(e) => updateLine(i, "unitPrice", e.target.value)}
                            className="h-8 text-xs text-right"
                            placeholder="0"
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
                  <tr className="bg-accent/30 font-medium">
                    <td className="px-3 py-2" colSpan={4}>
                      <span className="text-xs">TOTAL</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {fmtCLP.format(Math.round(total))}
                    </td>
                    <td />
                  </tr>
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
            const subtotal = qty * price;
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
                    placeholder="Nombre *"
                  />
                  <div className="grid grid-cols-2 gap-2">
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
                  </div>
                  <div className="text-right text-xs font-mono">
                    Subtotal: {fmtCLP.format(Math.round(subtotal))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          <Card>
            <CardContent className="p-3 text-right font-mono text-sm font-medium">
              Total: {fmtCLP.format(Math.round(total))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          onClick={() => router.push("/finanzas/facturacion")}
          disabled={saving}
        >
          Cancelar
        </Button>
        <Button onClick={handleSubmit} disabled={saving || !referenceDte}>
          {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
          Emitir nota de {isCredit ? "crédito" : "débito"}
        </Button>
      </div>
    </div>
  );
}
