"use client";

import { Loader2, CheckCircle2, XCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * LeadHeaderCta — contraparte desktop de LeadActionBar. Se monta en el header
 * del EntityDetailLayout. Oculta en mobile (donde manda la barra fija).
 */
export interface LeadHeaderCtaProps {
  isEditable: boolean;
  isApproved: boolean;
  isRejected: boolean;
  duplicateChecked: boolean;
  hasConflicts: boolean;
  approving: boolean;
  onReject: () => void;
  onVerifyAndApprove: () => void;
  onOpenDeal?: () => void;
  className?: string;
}

export function LeadHeaderCta({
  isEditable,
  isApproved,
  isRejected,
  duplicateChecked,
  hasConflicts,
  approving,
  onReject,
  onVerifyAndApprove,
  onOpenDeal,
  className,
}: LeadHeaderCtaProps) {
  if (isRejected) return null;

  if (isApproved) {
    if (!onOpenDeal) return null;
    return (
      <Button size="sm" onClick={onOpenDeal} className={cn("h-9 gap-1.5", className)}>
        Abrir negocio
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Button>
    );
  }

  if (!isEditable) return null;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button variant="outline" size="sm" onClick={onReject} disabled={approving} className="h-9 gap-1.5 text-destructive hover:text-destructive">
        <XCircle className="h-4 w-4" aria-hidden />
        Rechazar
      </Button>
      <Button
        size="sm"
        onClick={onVerifyAndApprove}
        disabled={approving}
        className={cn(
          "h-9 gap-1.5 font-medium text-white",
          hasConflicts ? "bg-status-warn hover:brightness-110" : "bg-status-ok hover:brightness-110",
        )}
      >
        {approving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
        {duplicateChecked ? "Confirmar" : "Verificar y aprobar"}
      </Button>
    </div>
  );
}
