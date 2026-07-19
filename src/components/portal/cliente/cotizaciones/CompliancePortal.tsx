"use client";

import { CheckCircle2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface CompliancePortalProps {
  numbered?: boolean;
  sectionNumber?: number;
  items?: string[];
  className?: string;
}

const DEFAULT_COMPLIANCE_ITEMS = [
  "Ley 21.659 — Seguridad Privada",
  "D.S. 594 — Condiciones sanitarias y ambientales",
  "D.L. 3.607 — Vigilantes privados",
  "Ley 16.744 — Seguro contra accidentes del trabajo",
  "Código del Trabajo — Jornada y descansos",
  "D.S. 40 — Prevención de riesgos profesionales",
];

export function CompliancePortal({
  numbered,
  sectionNumber,
  items,
  className,
}: CompliancePortalProps) {
  const displayItems = items && items.length > 0 ? items : DEFAULT_COMPLIANCE_ITEMS;

  return (
    <div className={cn("rounded-xl border border-border bg-card opai-glass-soft-m p-4 space-y-3", className)}>
      <div className="flex items-center gap-2.5">
        <ShieldCheck className="h-5 w-5 text-status-ok-fg" />
        <h3 className={cn(
          "font-bold text-foreground",
          numbered ? "text-xl" : "text-sm",
        )}>
          {numbered && sectionNumber ? <span className="text-primary">{sectionNumber}. </span> : null}
          Cumplimiento Normativo
        </h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {displayItems.map((item) => (
          <div key={item} className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-status-ok-fg mt-0.5 shrink-0" />
            <span className="text-sm text-muted-foreground">{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
