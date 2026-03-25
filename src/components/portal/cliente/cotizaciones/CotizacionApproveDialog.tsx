"use client";

import { useState, useEffect } from "react";
import { Check, Loader2, AlertTriangle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";

interface MissingItem {
  field: string;
  label: string;
  section: string;
}

interface CotizacionApproveDialogProps {
  quoteId: string;
  quoteName: string;
  monthlyCost: number;
  currency: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  onNavigateToEmpresa?: () => void;
  isProspect?: boolean;
}

export function CotizacionApproveDialog({
  quoteId, quoteName, monthlyCost, currency, open, onOpenChange, onConfirm, onNavigateToEmpresa, isProspect,
}: CotizacionApproveDialogProps) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Readiness check
  const [checking, setChecking] = useState(false);
  const [missing, setMissing] = useState<MissingItem[]>([]);
  const [readinessChecked, setReadinessChecked] = useState(false);

  // Check readiness when dialog opens
  useEffect(() => {
    if (!open) {
      setReadinessChecked(false);
      setMissing([]);
      setSuccess(false);
      return;
    }

    setChecking(true);
    fetch(`/api/portal/cliente/cotizaciones/${quoteId}/readiness`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setMissing(json.data.missing ?? []);
        }
      })
      .catch(() => {
        // If check fails, allow proceeding (don't block on network error)
        setMissing([]);
      })
      .finally(() => {
        setChecking(false);
        setReadinessChecked(true);
      });
  }, [open, quoteId]);

  const isReady = readinessChecked && missing.length === 0;

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

              {/* Readiness check loading */}
              {checking && (
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Verificando datos de tu empresa...
                </div>
              )}

              {/* Missing fields warning */}
              {readinessChecked && missing.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                    <div className="space-y-1.5">
                      <p className="text-xs text-amber-200 font-medium">
                        Debes completar los siguientes datos antes de continuar:
                      </p>
                      <ul className="text-xs text-amber-200/70 list-disc list-inside space-y-0.5">
                        {missing.map((m) => (
                          <li key={m.field}>{m.label}</li>
                        ))}
                      </ul>
                      {onNavigateToEmpresa && (
                        <button
                          type="button"
                          onClick={() => {
                            onOpenChange(false);
                            onNavigateToEmpresa();
                          }}
                          className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 text-xs font-medium text-amber-300 hover:bg-amber-500/30 hover:text-amber-200 transition-colors"
                        >
                          Ir a completar datos de empresa
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Ready — show confirmation text */}
              {isReady && (
                <p className="text-xs text-zinc-500">
                  Al confirmar, nuestro equipo iniciará el proceso de implementación de tu servicio.
                  Un ejecutivo te contactará en las próximas 24 horas.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={loading || checking || !isReady}
                className="flex items-center justify-center gap-2 h-10 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-colors"
                style={{ background: isReady ? "linear-gradient(135deg, #0d9488, #14b8a6)" : undefined }}
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
