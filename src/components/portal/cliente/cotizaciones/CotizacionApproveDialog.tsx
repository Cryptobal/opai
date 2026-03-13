"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";

interface CotizacionApproveDialogProps {
  quoteName: string;
  monthlyCost: number;
  currency: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  isProspect?: boolean;
}

export function CotizacionApproveDialog({
  quoteName, monthlyCost, currency, open, onOpenChange, onConfirm, isProspect,
}: CotizacionApproveDialogProps) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      await onConfirm();
      setSuccess(true);
      setTimeout(() => {
        onOpenChange(false);
        setSuccess(false);
      }, 2000);
    } catch {
      // Error handled by parent
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!loading) { onOpenChange(v); setSuccess(false); } }}>
      <DialogContent className="sm:max-w-md">
        {success ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="w-14 h-14 rounded-full bg-emerald-900/40 flex items-center justify-center">
              <Check className="w-7 h-7 text-emerald-400" />
            </div>
            <p className="text-sm font-medium text-emerald-300">
              {isProspect ? "¡Propuesta aceptada!" : "¡Cotización aprobada!"}
            </p>
            <p className="text-xs text-zinc-400 text-center">
              Tu ejecutivo te contactará en las próximas 24 horas.
            </p>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-base flex items-center gap-2">
                <Check className="w-5 h-5 text-emerald-400" />
                {isProspect ? "Aceptar propuesta" : "Confirmar aprobación"}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Confirmación de {isProspect ? "aceptación de propuesta" : "aprobación de cotización"}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <p className="text-sm text-zinc-400">
                Estás {isProspect ? "aceptando la propuesta" : "aprobando la cotización"}:
              </p>
              <p className="text-sm text-zinc-200 font-medium">&ldquo;{quoteName}&rdquo;</p>
              <p className="text-sm text-zinc-400">
                Valor mensual:{" "}
                <span className="text-teal-400 font-semibold">
                  {formatCurrency(monthlyCost, currency === "UF" ? "UF" : "CLP")}
                </span>
              </p>
              <p className="text-xs text-zinc-500">
                Al confirmar, nuestro equipo iniciará el proceso de implementación de tu servicio.
                Un ejecutivo te contactará en las próximas 24 horas.
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={loading}
                className="flex items-center justify-center gap-2 h-10 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-colors"
                style={{ background: "linear-gradient(135deg, #0d9488, #14b8a6)" }}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {isProspect ? "Confirmar aceptación" : "Confirmar aprobación"}
              </button>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={loading}
                className="h-10 rounded-lg border border-zinc-700 text-zinc-400 text-sm hover:text-zinc-200 transition-colors"
              >
                Volver
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
