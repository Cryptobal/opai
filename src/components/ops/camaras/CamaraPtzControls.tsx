"use client";

import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Minus, Plus, Square } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  disabled?: boolean;
  onMove: (pan: number, tilt: number, zoom: number) => void;
  onStop: () => void;
};

function PtzBtn({
  label, children, onMove, onStop, disabled, className,
}: {
  label: string;
  children: React.ReactNode;
  onMove: () => void;
  onStop: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onPointerDown={(e) => {
        e.preventDefault();
        onMove();
      }}
      onPointerUp={onStop}
      onPointerLeave={onStop}
      className={cn(
        "inline-flex h-11 w-11 items-center justify-center rounded-ds-md border border-ds-border-default bg-ds-surface-2 text-ds-text-1",
        "disabled:opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function CamaraPtzControls({ disabled, onMove, onStop }: Props) {
  const icon = "h-5 w-5";
  return (
    <div className="flex items-center gap-3">
      <div className="grid grid-cols-3 gap-1">
        <span />
        <PtzBtn label="Arriba" disabled={disabled} onMove={() => onMove(0, 0.4, 0)} onStop={onStop}>
          <ChevronUp className={icon} />
        </PtzBtn>
        <span />
        <PtzBtn label="Izquierda" disabled={disabled} onMove={() => onMove(-0.4, 0, 0)} onStop={onStop}>
          <ChevronLeft className={icon} />
        </PtzBtn>
        <PtzBtn label="Detener" disabled={disabled} onMove={onStop} onStop={onStop}>
          <Square className="h-4 w-4" />
        </PtzBtn>
        <PtzBtn label="Derecha" disabled={disabled} onMove={() => onMove(0.4, 0, 0)} onStop={onStop}>
          <ChevronRight className={icon} />
        </PtzBtn>
        <span />
        <PtzBtn label="Abajo" disabled={disabled} onMove={() => onMove(0, -0.4, 0)} onStop={onStop}>
          <ChevronDown className={icon} />
        </PtzBtn>
        <span />
      </div>
      <div className="flex flex-col gap-1">
        <PtzBtn label="Zoom +" disabled={disabled} onMove={() => onMove(0, 0, 0.3)} onStop={onStop}>
          <Plus className={icon} />
        </PtzBtn>
        <PtzBtn label="Zoom −" disabled={disabled} onMove={() => onMove(0, 0, -0.3)} onStop={onStop}>
          <Minus className={icon} />
        </PtzBtn>
      </div>
    </div>
  );
}
