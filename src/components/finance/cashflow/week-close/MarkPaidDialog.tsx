"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fmtCLP } from "./types";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirmed: () => void;
  occurrenceId: string;
  itemName: string;
  defaultAmount: number;
}

export function MarkPaidDialog({
  open,
  onClose,
  onConfirmed,
  occurrenceId,
  itemName,
  defaultAmount,
}: Props) {
  const [amount, setAmount] = useState<string>(String(defaultAmount));
  const [saving, setSaving] = useState(false);

  async function confirm() {
    setSaving(true);
    try {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      const res = await fetch(
        `/api/finance/cashflow/occurrences/${occurrenceId}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "PAID",
            effectiveDate: `${yyyy}-${mm}-${dd}`,
          }),
        },
      );
      const j = await res.json();
      if (!j.success) throw new Error(j.error);
      toast.success("Cuota marcada como pagada");
      onConfirmed();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Marcar pagada</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="text-xs text-muted-foreground">{itemName}</div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Monto real (CLP)</label>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              className="h-10 font-mono"
            />
            <p className="text-[10px] text-muted-foreground">
              Si difiere de {fmtCLP.format(defaultAmount)}, queda como variance del bucket.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving} className="flex-1">
            Cancelar
          </Button>
          <Button onClick={confirm} disabled={saving} className="flex-1">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Confirmar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
