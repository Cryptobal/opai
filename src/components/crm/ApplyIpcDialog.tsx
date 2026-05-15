"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ID del adjustment PENDING. Si se provee, se aplica ese adjustment;
   *  si NO, se crea uno manual sobre `itemId` con dueDate=hoy. */
  adjustmentId?: string | null;
  /** Requerido cuando no hay `adjustmentId` (modo manual). */
  itemId?: string;
  contractTitle: string;
  /** Fecha programada del reajuste (PENDING) o "hoy" (manual). */
  dueDate: string;
  currentAmount: number;
  currency: string;
  onApplied?: () => void;
}

function formatAmount(n: number, currency: string): string {
  if (currency === "UF") {
    return `UF ${new Intl.NumberFormat("es-CL", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n)}`;
  }
  return `$${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(n)}`;
}

function roundAmount(n: number, currency: string): number {
  if (currency === "UF") return Math.round(n * 100) / 100;
  return Math.round(n);
}

function formatAmountInput(n: number, currency: string): string {
  if (currency === "UF") return (Math.round(n * 100) / 100).toString();
  return Math.round(n).toString();
}

export function ApplyIpcDialog({
  open,
  onOpenChange,
  adjustmentId,
  itemId,
  contractTitle,
  dueDate,
  currentAmount,
  currency,
  onApplied,
}: Props) {
  const isManual = !adjustmentId;
  const [pct, setPct] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [lastEdited, setLastEdited] = useState<"pct" | "amount" | null>(null);
  const [notes, setNotes] = useState("");
  // Fecha de vigencia del reajuste, editable en ambos modos. En manual
  // default = hoy; en PENDING default = la dueDate del cron, pero el
  // usuario puede adelantarla o postergarla. Las ocurrencias desde esta
  // fecha se regeneran y el próximo ciclo se ancla aquí.
  const [effectiveDate, setEffectiveDate] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setPct("");
      setAmount("");
      setLastEdited(null);
      setNotes("");
      const today = new Date().toISOString().slice(0, 10);
      setEffectiveDate(isManual ? today : dueDate);
    }
  }, [open, isManual, dueDate]);

  function handlePctChange(value: string) {
    setPct(value);
    setLastEdited("pct");
    const n = Number(value);
    if (value === "" || !Number.isFinite(n)) {
      setAmount("");
      return;
    }
    const next = currentAmount * (1 + n / 100);
    setAmount(formatAmountInput(next, currency));
  }

  function handleAmountChange(value: string) {
    setAmount(value);
    setLastEdited("amount");
    const n = Number(value);
    if (value === "" || !Number.isFinite(n) || currentAmount === 0) {
      setPct("");
      return;
    }
    const implied = (n / currentAmount - 1) * 100;
    setPct((Math.round(implied * 100) / 100).toString());
  }

  const preview = useMemo(() => {
    const pctNum = Number(pct);
    if (!Number.isFinite(pctNum) || pct === "") return null;
    const next = roundAmount(currentAmount * (1 + pctNum / 100), currency);
    return { next, delta: next - currentAmount, pct: pctNum };
  }, [pct, currentAmount, currency]);

  async function handleApply() {
    const pctNum = Number(pct);
    if (!Number.isFinite(pctNum) || pctNum <= -100) {
      toast.error("Ingresá un porcentaje válido");
      return;
    }
    if (isManual && !itemId) {
      toast.error("Falta el item del flujo de caja");
      return;
    }
    setSubmitting(true);
    try {
      const url = isManual
        ? `/api/finance/cashflow/items/${itemId}/ipc-adjust`
        : `/api/finance/cashflow/ipc-adjustments/${adjustmentId}/apply`;
      const body: Record<string, unknown> = {
        pct: pctNum,
        notes: notes.trim() || undefined,
      };
      if (effectiveDate) {
        body.dueDate = effectiveDate;
      }
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error ?? "Error aplicando ajuste");
        return;
      }
      toast.success(
        `Ajuste aplicado: ${formatAmount(currentAmount, currency)} → ${formatAmount(json.data.newAmount, currency)}`,
      );
      onApplied?.();
      onOpenChange(false);
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-status-info-fg" />
            {isManual ? "Registrar reajuste IPC" : "Aplicar ajuste de IPC"}
          </DialogTitle>
          <DialogDescription>
            {contractTitle}
            {!isManual ? (
              <span className="block text-[11px] text-ds-text-3 mt-1">
                Reajuste programado para{" "}
                <span className="font-mono">{dueDate}</span> — podés
                adelantarlo o postergarlo cambiando la fecha de vigencia.
              </span>
            ) : (
              <span className="block text-[11px] text-ds-text-3 mt-1">
                El próximo ciclo se programará desde la fecha de vigencia
                según la frecuencia configurada en el contrato.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border border-ds-border-subtle bg-ds-surface-2 p-3 text-sm space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-ds-text-3">Monto actual</span>
              <span className="font-mono font-semibold">
                {formatAmount(currentAmount, currency)}
              </span>
            </div>
            {preview && preview.pct !== 0 ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-ds-text-3">Variación</span>
                  <span
                    className={`font-mono ${
                      preview.delta >= 0
                        ? "text-status-ok-fg"
                        : "text-status-warn-fg"
                    }`}
                  >
                    {preview.delta >= 0 ? "+" : ""}
                    {formatAmount(preview.delta, currency)}
                  </span>
                </div>
                <div className="border-t border-ds-border-subtle pt-1.5 flex items-center justify-between">
                  <span className="font-medium">Monto nuevo</span>
                  <span className="font-mono font-semibold text-status-info-fg">
                    {formatAmount(preview.next, currency)}
                  </span>
                </div>
              </>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="ipcPct">% del ajuste</Label>
              <Input
                id="ipcPct"
                type="number"
                step="0.01"
                value={pct}
                onChange={(e) => handlePctChange(e.target.value)}
                placeholder="3,5"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ipcAmount">Monto nuevo</Label>
              <Input
                id="ipcAmount"
                type="number"
                step={currency === "UF" ? "0.01" : "1"}
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder={formatAmountInput(currentAmount, currency)}
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Editás % o monto nuevo indistintamente — el otro campo se calcula
            automáticamente. Si el contrato no se ajusta este período por
            acuerdo, ingresá <code className="font-mono">0</code> en %.
            {lastEdited ? (
              <span className="text-ds-text-3">
                {" "}
                · editando por <strong>{lastEdited === "pct" ? "%" : "monto"}</strong>
              </span>
            ) : null}
          </p>

          <div className="space-y-2">
            <Label htmlFor="ipcEffectiveDate">Vigente desde</Label>
            <Input
              id="ipcEffectiveDate"
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Desde esta fecha el flujo de caja muestra el monto reajustado.
              Las cuotas anteriores quedan al monto previo. El próximo
              ciclo se programa N meses después.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ipcNotes">Notas (opcional)</Label>
            <Textarea
              id="ipcNotes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: IPC variación 12 meses anterior según INE."
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button onClick={handleApply} disabled={submitting || !pct}>
            {submitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
            Aplicar ajuste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
