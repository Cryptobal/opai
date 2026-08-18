"use client";

import type { CSSProperties, ReactNode } from "react";
import { Loader2, CheckCircle2, XCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * LeadActionBar — barra de acciones fija (mobile). En desktop se oculta
 * (las acciones viven en el header vía LeadHeaderCta).
 *
 * Se ancla inmediatamente encima del dock global (`--bottom-nav-height`,
 * publicado por BottomNav) para no quedar tapada. Fallback 76px si la
 * variable aún no está definida en el primer paint.
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
  onReopen?: () => void;
  reopening?: boolean;
}

const BAR_BOTTOM_STYLE: CSSProperties = {
  bottom: "var(--bottom-nav-height, 76px)",
};

const BAR_SHELL =
  "fixed inset-x-0 z-40 lg:hidden";

const BAR_INNER =
  "flex gap-2.5 border-t border-ds-border-subtle bg-background/85 px-3.5 py-3 backdrop-blur";

function MobileActionShell({ children }: { children: ReactNode }) {
  return (
    <div className={BAR_SHELL} style={BAR_BOTTOM_STYLE} data-lead-action-bar>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-5 h-5 bg-gradient-to-t from-background/85 to-transparent"
      />
      <div className={BAR_INNER}>{children}</div>
    </div>
  );
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
  onReopen,
  reopening,
}: LeadActionBarProps) {
  if (isRejected) {
    if (!onReopen) return null;
    return (
      <MobileActionShell>
        <Button onClick={onReopen} disabled={reopening} className="min-h-11 w-full gap-1.5">
          {reopening ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {reopening ? "Reabriendo…" : "Reabrir"}
        </Button>
      </MobileActionShell>
    );
  }

  if (isApproved) {
    if (!onOpenDeal) return null;
    return (
      <MobileActionShell>
        <Button onClick={onOpenDeal} className="min-h-11 w-full gap-1.5">
          Abrir negocio
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Button>
      </MobileActionShell>
    );
  }

  if (!isEditable) return null;

  return (
    <MobileActionShell>
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
    </MobileActionShell>
  );
}
