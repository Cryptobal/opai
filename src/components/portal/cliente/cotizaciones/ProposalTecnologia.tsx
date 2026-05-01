"use client";

import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const DEFAULT_ITEMS = [
  "Rondas GPS en tiempo real",
  "Trust Score de guardias",
  "Portal de cliente 24/7",
  "Chat directo con equipo de seguridad",
  "Documentación digital completa",
  "Cumplimiento normativo automático (Ley 21.659)",
  "Programa de capacitación certificado",
  "Control anti-doble turno",
];

interface ProposalTecnologiaProps {
  items?: string[];
  sectionNumber: number;
  className?: string;
}

export function ProposalTecnologia({
  items,
  sectionNumber,
  className,
}: ProposalTecnologiaProps) {
  const displayItems = items && items.length > 0 ? items : DEFAULT_ITEMS;

  return (
    <div className={cn("rounded-xl border border-slate-700/50 bg-slate-800/50 p-4 space-y-3", className)}>
      <div className="flex items-center gap-2.5">
        <h3 className="text-xl font-bold text-white">
          <span className="text-status-info-fg">{sectionNumber}.</span> Qué Incluye
        </h3>
        <span className="text-[10px] uppercase tracking-wider bg-status-info-soft text-teal-400/70 rounded-full px-2 py-0.5 font-medium">
          Tecnología OPAI
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {displayItems.map((item, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-status-ok-fg mt-0.5 shrink-0" />
            <span className="text-sm text-slate-300">{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
