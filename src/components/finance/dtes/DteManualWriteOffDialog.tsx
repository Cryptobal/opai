"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Modal "Cerrar e imputar diferencia": permite cerrar manualmente un DTE
 * PARTIAL imputando la diferencia (total − amountPaid) a una cuenta
 * contable explícita. Útil cuando la varianza excede el umbral del
 * write-off automático.
 */
export interface DteManualWriteOffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dte: {
    id: string;
    folio: number | null;
    counterpartyName: string;
    totalAmount: number;
    amountPaid: number;
  };
  accountOptions: { id: string; code: string; name: string }[];
  /** Llamado tras éxito; el caller refresca la vista. */
  onSuccess?: () => void;
}

const fmtClp = (n: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);

export function DteManualWriteOffDialog({
  open,
  onOpenChange,
  dte,
  accountOptions,
  onSuccess,
}: DteManualWriteOffDialogProps) {
  const [accountId, setAccountId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const variance = dte.totalAmount - dte.amountPaid;
  const direction: "SHORT" | "OVER" = variance >= 0 ? "SHORT" : "OVER";

  async function submit() {
    if (!accountId) {
      setError("Seleccioná la cuenta contable de destino.");
      return;
    }
    if (reason.trim().length < 3) {
      setError("Indicá un motivo (mínimo 3 caracteres).");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/finance/billing/dte/${dte.id}/manual-write-off`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountPlanId: accountId, reason: reason.trim() }),
        },
      );
      const j = await res.json();
      if (!j?.success) {
        setError(j?.error ?? "Error al aplicar ajuste");
        return;
      }
      onOpenChange(false);
      setAccountId("");
      setReason("");
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cerrar e imputar diferencia</DialogTitle>
          <DialogDescription>
            La diferencia se imputa a una cuenta contable y el DTE pasa a PAID.
            La acción crea un asiento POSTED con trazabilidad.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-[13px]">
          <div className="grid grid-cols-2 gap-2 rounded-ds-md bg-muted/30 p-3">
            <div>
              <p className="text-[11px] text-ds-text-3">Factura</p>
              <p className="font-medium">
                {dte.folio ? `#${dte.folio}` : dte.id.slice(0, 8)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-ds-text-3">Contraparte</p>
              <p className="font-medium truncate">{dte.counterpartyName}</p>
            </div>
            <div>
              <p className="text-[11px] text-ds-text-3">Total</p>
              <p className="font-medium">{fmtClp(dte.totalAmount)}</p>
            </div>
            <div>
              <p className="text-[11px] text-ds-text-3">Pagado</p>
              <p className="font-medium">{fmtClp(dte.amountPaid)}</p>
            </div>
            <div className="col-span-2">
              <p className="text-[11px] text-ds-text-3">
                Diferencia ({direction === "SHORT" ? "en contra" : "a favor"})
              </p>
              <p className="font-semibold">{fmtClp(Math.abs(variance))}</p>
            </div>
          </div>

          <div>
            <Label>Cuenta contable destino</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Seleccionar cuenta…" />
              </SelectTrigger>
              <SelectContent>
                {accountOptions.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Motivo del ajuste</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: variación UF entre emisión y cobro; comisión bancaria absorbida; descuento comercial otorgado."
              rows={3}
              maxLength={500}
            />
            <p className="mt-1 text-[11px] text-ds-text-3">
              Queda en la descripción del asiento contable para auditoría.
            </p>
          </div>

          {error && (
            <p className="text-[12px] text-status-error-fg">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Aplicando…" : "Aplicar ajuste y cerrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
