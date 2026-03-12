"use client";

/**
 * SupervisorVisitaWizard — Mobile-first wrapper del SupervisionVisitWizard.
 *
 * El wizard desktop es self-contained (sin props), consume las mismas APIs.
 * Este wrapper provee la chrome mobile: overlay full-screen + botón cerrar.
 */

import { X } from "lucide-react";
import { SupervisionVisitWizard } from "@/components/supervision/wizard/SupervisionVisitWizard";

interface Props {
  onClose: () => void;
  onComplete: () => void;
}

export function SupervisorVisitaWizard({ onClose, onComplete }: Props) {
  return (
    <div className="fixed inset-0 z-50 bg-[#0a0a0f] flex flex-col overflow-hidden">
      {/* Mobile close bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 flex-shrink-0">
        <span className="text-sm font-medium text-zinc-200">Visita de supervisión</span>
        <button
          onClick={onClose}
          className="p-2 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          aria-label="Cerrar wizard"
        >
          <X size={18} />
        </button>
      </div>

      {/* Wizard content */}
      <div className="flex-1 overflow-y-auto">
        <SupervisionVisitWizard onComplete={onComplete} />
      </div>
    </div>
  );
}
