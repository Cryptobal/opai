"use client";

import { useState } from "react";
import { Sparkles, X } from "lucide-react";

interface Props {
  onCTA: () => void;
}

export function PortalDemoOverlay({ onCTA }: Props) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-400 text-amber-900 px-4 py-2 flex items-center gap-3 shadow-md">
      <Sparkles className="w-4 h-4 shrink-0" />
      <p className="text-sm font-medium flex-1">
        Datos de demostración — Aprueba tu cotización para ver datos reales de tu servicio.
      </p>
      <button
        onClick={onCTA}
        className="text-xs font-semibold bg-amber-900 text-amber-100 px-3 py-1 rounded-full hover:bg-amber-800 transition-colors"
      >
        Ver cotización
      </button>
      <button onClick={() => setDismissed(true)} className="hover:opacity-70 ml-1">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
