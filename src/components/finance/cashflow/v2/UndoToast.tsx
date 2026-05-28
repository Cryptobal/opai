"use client";

import { useEffect } from "react";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface UndoPayload {
  occurrenceName: string;
  destLabel: string;
  undo: () => Promise<void> | void;
}

interface Props {
  payload: UndoPayload | null;
  onDismiss: () => void;
  timeoutMs?: number;
}

/** Toast efímero (5s) con botón "Deshacer" tras mover una occurrence. */
export function UndoToast({ payload, onDismiss, timeoutMs = 5000 }: Props) {
  useEffect(() => {
    if (!payload) return;
    const t = setTimeout(onDismiss, timeoutMs);
    return () => clearTimeout(t);
  }, [payload, onDismiss, timeoutMs]);

  if (!payload) return null;

  return (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-50 flex min-w-[280px] -translate-x-1/2 items-center gap-3 rounded-ds-lg border border-ds-border-strong bg-ds-surface-3 px-4 py-2.5 text-ds-text-1 shadow-ds-lg"
    >
      <span className="text-[12px]">
        «<b>{payload.occurrenceName}</b>» → {payload.destLabel}
      </span>
      <Button
        size="sm"
        className="ml-auto h-7 text-[11px]"
        onClick={async () => {
          await payload.undo();
          onDismiss();
        }}
      >
        <Undo2 className="mr-1 h-3 w-3" /> Deshacer
      </Button>
    </div>
  );
}
