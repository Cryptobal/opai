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
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { Plus, Trash2, Loader2, Save, FileCheck } from "lucide-react";
import { toast } from "sonner";

/* ── Types ── */

interface AccountOption {
  id: string;
  code: string;
  name: string;
}

interface PeriodOption {
  id: string;
  year: number;
  month: number;
}

interface JournalLine {
  accountId: string;
  description: string;
  debit: string;
  credit: string;
}

interface Props {
  accounts: AccountOption[];
  periods: PeriodOption[];
}

const EMPTY_LINE: JournalLine = {
  accountId: "",
  description: "",
  debit: "",
  credit: "",
};

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

/* ── Component ── */

export function JournalEntryForm({ accounts, periods }: Props) {
  const router = useRouter();
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<JournalLine[]>([
    { ...EMPTY_LINE },
    { ...EMPTY_LINE },
  ]);
  const [saving, setSaving] = useState(false);

  const updateLine = useCallback((index: number, field: keyof JournalLine, value: string) => {
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
      if (prev.length <= 2) {
        toast.error("Un asiento requiere al menos 2 líneas");
        return prev;
      }
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const totals = useMemo(() => {
    const totalDebit = lines.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0);
    const totalCredit = lines.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0);
    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;
    return { totalDebit, totalCredit, isBalanced };
  }, [lines]);

  const handleSubmit = async (post: boolean) => {
    // Validate
    if (!description.trim()) {
      toast.error("La descripción es obligatoria");
      return;
    }
    if (lines.length < 2) {
      toast.error("Se requieren al menos 2 líneas");
      return;
    }
    const validLines = lines.filter((l) => l.accountId);
    if (validLines.length < 2) {
      toast.error("Al menos 2 líneas deben tener cuenta asignada");
      return;
    }
    if (!totals.isBalanced) {
      toast.error("El asiento no está cuadrado (Debe ≠ Haber)");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        date,
        description: description.trim(),
        reference: reference.trim() || null,
        sourceType: "MANUAL",
        lines: validLines.map((l) => ({
          accountId: l.accountId,
          description: l.description.trim() || null,
          debit: parseFloat(l.debit) || 0,
          credit: parseFloat(l.credit) || 0,
        })),
      };

      const res = await fetch("/api/finance/accounting/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al crear asiento");
      }
      toast.success(post ? "Asiento contabilizado" : "Asiento guardado como borrador");
      router.push("/finanzas/contabilidad");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header fields */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="je-date">Fecha *</Label>
              <Input
                id="je-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="je-desc">Descripción *</Label>
              <Input
                id="je-desc"
                placeholder="Ej: Pago proveedor X, factura 123"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="h-9"
              />
            </div>
          </div>
          <div className="mt-4">
            <div className="space-y-1.5">
              <Label htmlFor="je-ref">Referencia</Label>
              <Input
                id="je-ref"
                placeholder="N° factura, comprobante, etc."
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="h-9 max-w-sm"
              />
            </div>
          </div>
          {periods.length > 0 && (
            <p className="text-xs text-muted-foreground mt-3">
              Períodos abiertos:{" "}
              {periods.map((p) => `${p.month}/${p.year}`).join(", ")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Lines */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Líneas del asiento</h3>
          <Button variant="outline" size="sm" onClick={addLine}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Agregar línea
          </Button>
        </div>

        {/* Desktop lines */}
        <div className="hidden md:block">
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground w-1/3">Cuenta</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Descripción</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground w-32">Debe</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground w-32">Haber</th>
                    <th className="px-3 py-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={i} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2">
                        <SearchableSelect
                          value={line.accountId}
                          options={accounts.map((a) => ({
                            id: a.id,
                            label: `${a.code} - ${a.name}`,
                            description: a.code,
                          }))}
                          placeholder="Cuenta..."
                          emptyText="No se encontraron cuentas"
                          onChange={(v) => updateLine(i, "accountId", v)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={line.description}
                          onChange={(e) => updateLine(i, "description", e.target.value)}
                          className="h-8 text-xs"
                          placeholder="Descripción línea"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min={0}
                          value={line.debit}
                          onChange={(e) => updateLine(i, "debit", e.target.value)}
                          className="h-8 text-xs text-right"
                          placeholder="0"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min={0}
                          value={line.credit}
                          onChange={(e) => updateLine(i, "credit", e.target.value)}
                          className="h-8 text-xs text-right"
                          placeholder="0"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeLine(i)}
                          className="h-8 w-8 p-0"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {/* Totals */}
                  <tr className="bg-accent/30 font-medium">
                    <td className="px-3 py-2" colSpan={2}>
                      <span className="text-xs">TOTAL</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {fmtCLP.format(totals.totalDebit)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {fmtCLP.format(totals.totalCredit)}
                    </td>
                    <td className="px-3 py-2">
                      {totals.isBalanced ? (
                        <span className="text-emerald-400 text-xs">✓</span>
                      ) : (
                        <span className="text-red-400 text-xs">≠</span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Mobile lines */}
        <div className="md:hidden space-y-3">
          {lines.map((line, i) => (
            <Card key={i}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    Línea {i + 1}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeLine(i)}
                    className="h-7 w-7 p-0"
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
                <SearchableSelect
                  value={line.accountId}
                  options={accounts.map((a) => ({
                    id: a.id,
                    label: `${a.code} - ${a.name}`,
                    description: a.code,
                  }))}
                  placeholder="Seleccionar cuenta..."
                  emptyText="No se encontraron cuentas"
                  onChange={(v) => updateLine(i, "accountId", v)}
                />
                <Input
                  value={line.description}
                  onChange={(e) => updateLine(i, "description", e.target.value)}
                  className="h-8 text-xs"
                  placeholder="Descripción"
                />
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px]">Debe</Label>
                    <Input
                      type="number"
                      min={0}
                      value={line.debit}
                      onChange={(e) => updateLine(i, "debit", e.target.value)}
                      className="h-8 text-xs text-right"
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Haber</Label>
                    <Input
                      type="number"
                      min={0}
                      value={line.credit}
                      onChange={(e) => updateLine(i, "credit", e.target.value)}
                      className="h-8 text-xs text-right"
                      placeholder="0"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Mobile totals */}
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Total</span>
                {totals.isBalanced ? (
                  <span className="text-emerald-400 text-xs font-medium">Cuadrado ✓</span>
                ) : (
                  <span className="text-red-400 text-xs font-medium">
                    Diferencia: {fmtCLP.format(Math.abs(totals.totalDebit - totals.totalCredit))}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-1 text-xs">
                <span>Debe: <span className="font-mono">{fmtCLP.format(totals.totalDebit)}</span></span>
                <span>Haber: <span className="font-mono">{fmtCLP.format(totals.totalCredit)}</span></span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          onClick={() => router.push("/finanzas/contabilidad")}
          disabled={saving}
        >
          Cancelar
        </Button>
        <Button
          variant="outline"
          onClick={() => handleSubmit(false)}
          disabled={saving || !totals.isBalanced}
        >
          {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
          Guardar borrador
        </Button>
        <Button
          onClick={() => handleSubmit(true)}
          disabled={saving || !totals.isBalanced}
        >
          {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileCheck className="h-4 w-4 mr-1.5" />}
          Guardar y contabilizar
        </Button>
      </div>
    </div>
  );
}
