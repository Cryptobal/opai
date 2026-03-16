"use client";

import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const DEFAULT_ITEMS = [
  "Personal acreditado ante OS-10",
  "Supervisión periódica en terreno",
  "Cobertura por ausencias (reemplazo máx. 4 hrs)",
  "Seguro responsabilidad civil y accidentes laborales",
  "Libro de novedades digital vía OPAI",
  "Reportería mensual de operaciones",
];

interface ProposalServicioIncluyeProps {
  items?: string[];
  sectionNumber: number;
  className?: string;
}

export function ProposalServicioIncluye({
  items,
  sectionNumber,
  className,
}: ProposalServicioIncluyeProps) {
  const displayItems = items && items.length > 0 ? items : DEFAULT_ITEMS;

  return (
    <div className={cn("rounded-xl border border-slate-700/50 bg-slate-800/50 p-4 space-y-3", className)}>
      <h3 className="text-xl font-bold text-white">
        <span className="text-teal-400">{sectionNumber}.</span> El Servicio Incluye
      </h3>

      <ul className="space-y-2">
        {displayItems.map((item, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
            <span className="text-sm text-slate-300">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
