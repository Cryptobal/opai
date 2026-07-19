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
    <div className={cn("rounded-xl border border-border bg-card opai-glass-soft-m p-4 space-y-3", className)}>
      <h3 className="text-xl font-bold text-foreground">
        <span className="text-primary">{sectionNumber}.</span> Detalle del Servicio de Seguridad
      </h3>

      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
        {text}
      </p>
    </div>
  );
}
