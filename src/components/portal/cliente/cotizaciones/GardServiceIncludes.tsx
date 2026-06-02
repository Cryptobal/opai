"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface GardServiceIncludesProps {
  variant?: "full" | "compact";
  className?: string;
  brandName?: string;
  items?: string[];
}

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

export function GardServiceIncludes({
  variant = "full",
  className,
  brandName,
  items: customItems,
}: GardServiceIncludesProps) {
  const allItems = customItems?.length ? customItems : DEFAULT_ITEMS;
  const visibleItems = variant === "compact" ? allItems.slice(0, 5) : allItems;

  return (
    <div className={cn("rounded-xl border border-white/[0.06] bg-white/[0.02] p-4", className)}>
      <div className="flex items-center gap-2 mb-3">
        <h4 className="text-sm font-semibold text-zinc-200">
          Qué incluye{brandName ? ` con ${brandName}` : ""}
        </h4>
        <span className="text-[10px] uppercase tracking-wider bg-teal-500/10 text-teal-400/70 rounded-full px-2 py-0.5 font-medium">
          Tecnología OPAI
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {visibleItems.map((item) => (
          <div key={item} className="flex items-start gap-2">
            <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
            <span className="text-xs text-zinc-300">{item}</span>
          </div>
        ))}
      </div>
      {variant === "compact" && allItems.length > 5 && (
        <p className="text-[10px] text-zinc-500 mt-2">
          +{allItems.length - 5} servicios incluidos más
        </p>
      )}
    </div>
  );
}
