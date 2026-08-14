"use client";

import { ArrowUpRight } from "lucide-react";

interface Props {
  onOpen: () => void;
}

export function AmpliarCoberturaCard({ onOpen }: Props) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left rounded-2xl border border-primary/30 bg-primary/10 p-5 min-h-11 transition-colors hover:bg-primary/15"
    >
      <p className="text-ds-caption font-mono uppercase tracking-[0.08em] text-primary">Crecer con Gard</p>
      <p className="mt-1 font-display text-ds-heading text-ds-text-1">Ampliar cobertura</p>
      <p className="mt-1 text-ds-body text-ds-text-3 max-w-md">
        ¿Necesitas más puestos, una nueva instalación o un servicio adicional? Te armamos una propuesta en menos de 2 horas.
      </p>
      <span className="mt-3 inline-flex items-center gap-1.5 text-ds-caption font-semibold text-primary">
        Solicitar propuesta <ArrowUpRight className="h-4 w-4" />
      </span>
    </button>
  );
}
