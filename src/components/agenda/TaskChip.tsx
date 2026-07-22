"use client";

import { CheckCircle2 } from "lucide-react";

type Props = {
  id: string;
  title: string;
  start: string;
  allDay: boolean;
  /** Abre el gestor de la tarea (reprogramar / completar / abrir origen). */
  onClick?: () => void;
};

/**
 * Chip de tarea en la agenda: distinto de visitas/licitaciones. Tap → gestor;
 * en desktop se puede arrastrar a otro día (drop en la columna destino).
 */
export function TaskChip({ id, title, start, allDay, onClick }: Props) {
  const time = allDay
    ? "Todo el día"
    : new Date(start).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  return (
    <button
      type="button"
      onClick={onClick}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-opai-task", id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className="w-full cursor-grab rounded-xl border border-primary/30 bg-primary/10 px-2 py-1.5 text-left text-[12px] text-ds-text-1 ds-tap active:cursor-grabbing"
    >
      <div className="flex items-center gap-1 text-primary">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium">{time}</span>
      </div>
      <p className="truncate">{title}</p>
    </button>
  );
}
