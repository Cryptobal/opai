"use client";

import { useMemo, useState } from "react";
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
  adjustmentId: string;
  contractTitle: string;
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

export function ApplyIpcDialog({
  open,
  onOpenChange,
  adjustmentId,
  contractTitle,
  dueDate,
  currentAmount,
  currency,
  onApplied,
}: Props) {
  const [pct, setPct] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const preview = useMemo(() => {
    const n = Number(pct);
    if (!Number.isFinite(n)) return null;
    const next = currentAmount * (1 + n / 100);
    const delta = next - currentAmount;
    return { next, delta };
  }, [pct, currentAmount]);

  async function handleApply() {
    const n = Number(pct);
    if (!Number.isFinite(n) || n <= -100) {
      toast.error("Ingresá un porcentaje válido");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/finance/cashflow/ipc-adjustments/${adjustmentId}/apply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pct: n, notes: notes.trim() || undefined }),
        },
      );
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
            Aplicar ajuste de IPC
          </DialogTitle>
          <DialogDescription>
            {contractTitle} ·{" "}
            <span className="font-mono">{dueDate}</span>
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
            {preview && Number(pct) !== 0 ? (
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

          <div className="space-y-2">
            <Label htmlFor="ipcPct">% del ajuste IPC</Label>
            <Input
              id="ipcPct"
              type="number"
              step="0.01"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              placeholder="3,5"
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground">
              IPC publicado por el INE para el período. Ej: si fue 3,5%, ingresá{" "}
              <code className="font-mono">3.5</code>. Si el contrato no se ajusta
              este período por acuerdo con el cliente, ingresá{" "}
              <code className="font-mono">0</code>.
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
