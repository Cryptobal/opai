"use client";

import { useState } from "react";
import { XCircle, Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const REJECTION_REASONS = [
  "Precio fuera de presupuesto",
  "El alcance no se ajusta a lo que necesito",
  "No es el momento adecuado",
  "Elegí otro proveedor",
  "Otro motivo",
];

interface CotizacionRejectDialogProps {
  quoteName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason?: string) => Promise<void>;
}

export function CotizacionRejectDialog({
  quoteName, open, onOpenChange, onConfirm,
}: CotizacionRejectDialogProps) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      let reason: string | undefined;
      if (selectedReason && comment) {
        reason = `${selectedReason} — ${comment}`;
      } else if (selectedReason) {
        reason = selectedReason;
      } else if (comment) {
        reason = comment;
      }
      await onConfirm(reason);
      setSelectedReason(null);
      setComment("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!loading) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Rechazar propuesta</DialogTitle>
          <DialogDescription className="sr-only">Formulario para rechazar la propuesta</DialogDescription>
        </DialogHeader>

        <p className="text-sm text-zinc-400">
          Estás rechazando: <span className="text-zinc-200 font-medium">&ldquo;{quoteName}&rdquo;</span>
        </p>

        <div className="space-y-3">
          <p className="text-xs text-zinc-500">¿Nos ayudas a mejorar? (opcional)</p>
          <div className="flex flex-wrap gap-2">
            {REJECTION_REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                onClick={() => setSelectedReason(selectedReason === reason ? null : reason)}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-full border transition-colors",
                  selectedReason === reason
                    ? "border-status-danger-border bg-status-danger-soft text-status-danger-fg"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-500",
                )}
              >
                {reason}
              </button>
            ))}
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Comentario adicional..."
            rows={2}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-red-600 resize-none"
          />
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="flex items-center justify-center gap-2 h-10 rounded-lg bg-status-danger hover:brightness-110 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
            Confirmar rechazo
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
      </DialogContent>
    </Dialog>
  );
}
