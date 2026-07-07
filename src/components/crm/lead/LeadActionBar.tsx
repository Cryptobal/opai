"use client";

import { Loader2, CheckCircle2, XCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * LeadActionBar — barra de acciones fija (mobile). En desktop se oculta
 * (las acciones viven en el header vía LeadHeaderCta).
 */
export interface LeadActionBarProps {
  isEditable: boolean;
  isApproved: boolean;
  isRejected: boolean;
  duplicateChecked: boolean;
  hasConflicts: boolean;
  approving: boolean;
  onReject: () => void;
  onVerifyAndApprove: () => void;
  onOpenDeal?: () => void;
}

export function LeadActionBar({
  isEditable,
  isApproved,
  isRejected,
  duplicateChecked,
  hasConflicts,
  approving,
  onReject,
  onVerifyAndApprove,
  onOpenDeal,
}: LeadActionBarProps) {
  if (isRejected) return null;

  if (isApproved) {
    if (!onOpenDeal) return null;
    return (
      <div className="fixed inset-x-0 bottom-0 z-40 flex gap-2.5 border-t border-ds-border-subtle bg-background/85 px-3.5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        <Button onClick={onOpenDeal} className="min-h-11 w-full gap-1.5">
          Abrir negocio
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    );
  }

  if (!isEditable) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex gap-2.5 border-t border-ds-border-subtle bg-background/85 px-3.5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
      <Button
        variant="outline"
        onClick={onReject}
        disabled={approving}
        className="min-h-11 flex-1 gap-1.5 text-destructive hover:text-destructive"
      >
        <XCircle className="h-4 w-4" aria-hidden />
        Rechazar
      </Button>
      <Button
        onClick={onVerifyAndApprove}
        disabled={approving}
        className={cn(
          "min-h-11 flex-[1.4] gap-1.5 font-medium text-white",
          hasConflicts ? "bg-status-warn hover:brightness-110" : "bg-status-ok hover:brightness-110",
        )}
      >
        {approving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
        <span className="truncate">{duplicateChecked ? "Confirmar" : "Verificar y aprobar"}</span>
      </Button>
    </div>
  );
}
