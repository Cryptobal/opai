"use client";

import { cn } from "@/lib/utils";

interface ProposalDetalleServicioProps {
  serviceDetail?: string | null;
  aiDescription?: string | null;
  sectionNumber: number;
  className?: string;
}

export function ProposalDetalleServicio({
  serviceDetail,
  aiDescription,
  sectionNumber,
  className,
}: ProposalDetalleServicioProps) {
  const text = serviceDetail || aiDescription;
  if (!text) return null;

  return (
    <div className={cn("rounded-xl border border-slate-700/50 bg-slate-800/50 p-4 space-y-3", className)}>
      <h3 className="text-xl font-bold text-white">
        <span className="text-status-info-fg">{sectionNumber}.</span> Detalle del Servicio de Seguridad
      </h3>

      <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
        {text}
      </p>
    </div>
  );
}
