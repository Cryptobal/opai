"use client";

import { Mail, RefreshCw, CheckCircle2, Download, X, FileText, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  count: number;
  onClear: () => void;
  onResendEmail: () => void;
  onCheckStatus: () => void;
  onMarkPaid: () => void;
  onExportCsv: () => void;
  /** Abre modal "Enviar como…" para el PRIMER DTE seleccionado. */
  onSendAs?: () => void;
  /** Abre el modal de cesión bulk a factoring (≥ 2 DTEs). */
  onCedeFactoring?: () => void;
  canResendEmail: boolean;
  canMarkPaid: boolean;
  canSendAs?: boolean;
  canCedeFactoring?: boolean;
}

/**
 * Barra sticky con acciones masivas. Render condicional: solo si count > 0.
 *  - Desktop: bottom-4, centrada, max-w-2xl, rounded-xl con shadow.
 *  - Mobile : bottom-0 inset-x-0, respecta safe-area-inset-bottom.
 */
export function BulkActionBar({
  count,
  onClear,
  onResendEmail,
  onCheckStatus,
  onMarkPaid,
  onExportCsv,
  onSendAs,
  onCedeFactoring,
  canResendEmail,
  canMarkPaid,
  canSendAs,
  canCedeFactoring,
}: Props) {
  if (count === 0) return null;

  return (
    <div
      className={cn(
        "fixed z-40 inset-x-0 bottom-0 md:bottom-4 md:inset-x-auto md:left-1/2 md:-translate-x-1/2",
        "md:max-w-2xl md:w-[min(92vw,640px)]",
        "pb-[env(safe-area-inset-bottom,0)]",
      )}
    >
      <div
        className={cn(
          "bg-ds-surface-2/95 border-t md:border border-ds-border-default",
          "md:rounded-xl shadow-lg backdrop-blur-md",
          "px-4 py-3 flex items-center gap-2",
        )}
      >
        <button
          type="button"
          onClick={onClear}
          aria-label="Limpiar selección"
          className="h-8 w-8 inline-flex items-center justify-center rounded-md text-ds-text-3 hover:text-ds-text-1 hover:bg-ds-surface-3 transition-colors shrink-0"
        >
          <X className="h-4 w-4" />
        </button>

        <span className="text-sm font-medium text-ds-text-1 shrink-0">
          {count} <span className="text-ds-text-3 font-normal">seleccionado{count === 1 ? "" : "s"}</span>
        </span>

        <div className="flex items-center gap-1.5 ml-auto overflow-x-auto">
          {canResendEmail && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onResendEmail}
              className="gap-1.5 shrink-0"
            >
              <Mail className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Reenviar email</span>
              <span className="sm:hidden">Email</span>
            </Button>
          )}
          {canSendAs && onSendAs && count === 1 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSendAs}
              className="gap-1.5 shrink-0"
              title="Enviar como Proforma o Estado de Pago"
            >
              <FileText className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Enviar como…</span>
              <span className="sm:hidden">Enviar</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onCheckStatus}
            className="gap-1.5 shrink-0"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Estado SII</span>
            <span className="sm:hidden">SII</span>
          </Button>
          {canMarkPaid && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onMarkPaid}
              className="gap-1.5 shrink-0"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Marcar pagado</span>
              <span className="sm:hidden">Pagar</span>
            </Button>
          )}
          {canCedeFactoring && onCedeFactoring && count >= 2 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCedeFactoring}
              className="gap-1.5 shrink-0"
              title="Ceder estas facturas a factoring en un mismo batch"
            >
              <Coins className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Ceder a factoring</span>
              <span className="sm:hidden">Ceder</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onExportCsv}
            className="gap-1.5 shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">CSV</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
