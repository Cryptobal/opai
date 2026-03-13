"use client";

import { Check, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface CompliancePortalProps {
  numbered?: boolean;
  sectionNumber?: number;
  className?: string;
}

const COMPLIANCE_ITEMS = [
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
  className,
}: CompliancePortalProps) {
  return (
    <div className={cn("rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3", className)}>
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-emerald-400" />
        <h4 className="text-sm font-semibold text-zinc-200">
          {numbered && sectionNumber ? `${sectionNumber}. ` : ""}Cumplimiento normativo
        </h4>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {COMPLIANCE_ITEMS.map((item) => (
          <div key={item} className="flex items-start gap-2">
            <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
            <span className="text-xs text-zinc-300">{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
