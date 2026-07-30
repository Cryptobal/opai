"use client";

/**
 * Centro de control como bottom-sheet glass (móvil): mismo contenido que el
 * aside desktop, con scrim y respeto de `env(safe-area-inset-bottom)`.
 */

import type { ComponentProps } from "react";
import { PanelRightOpen } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ControlCenterPanel } from "./ControlCenterPanel";

export function ControlCenterSheet({
  open,
  onOpenChange,
  panelProps,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  panelProps: ComponentProps<typeof ControlCenterPanel>;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[88dvh] overflow-y-auto rounded-t-2xl px-0 pt-3"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Centro de control</SheetTitle>
          <SheetDescription>
            Resumen comercial, preparación de envío y documentos de la cotización
          </SheetDescription>
        </SheetHeader>

        {/* Drag handle */}
        <div className="mb-3 flex justify-center">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>
        <p className="mb-1 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Centro de control
        </p>

        <ControlCenterPanel {...panelProps} showConversations={false} />
      </SheetContent>
    </Sheet>
  );
}

/** Disparador del sheet para la barra inferior móvil. */
export function ControlCenterTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Abrir centro de control"
      className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-md border border-border/70 bg-muted/30 px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <PanelRightOpen className="h-4 w-4" />
      Centro
    </button>
  );
}
