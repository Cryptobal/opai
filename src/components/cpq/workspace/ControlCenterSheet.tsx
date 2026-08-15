"use client";

/**
 * Centro de control como bottom-sheet glass v2 (móvil): mismo contenido que el
 * aside desktop, con scrim liviano y `env(safe-area-inset-bottom)`.
 */

import type { ComponentProps, ReactNode } from "react";
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
  title = "Centro de control",
  description = "Resumen comercial, preparación de envío y documentos de la cotización",
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  panelProps?: ComponentProps<typeof ControlCenterPanel>;
  title?: string;
  description?: string;
  /** Contenido alternativo (Lead/Licitación) cuando no hay panel CPQ. */
  children?: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        surface="glass-island"
        className="max-h-[80dvh] overflow-hidden rounded-[26px] border-[var(--glass-border)] px-0 pt-0"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

        <div className="mb-1 flex justify-center pt-2.5">
          <div className="h-[5px] w-11 rounded-full bg-[var(--glass-grabber)]" />
        </div>
        <div className="flex items-center justify-between px-[18px] pb-2.5 pt-1.5">
          <b className="text-[14px] font-bold text-ds-text-1">{title}</b>
        </div>

        <div className="max-h-[calc(80dvh-4.5rem)] overflow-y-auto px-3.5 pb-4">
          {children ??
            (panelProps ? (
              <ControlCenterPanel {...panelProps} showConversations={false} />
            ) : null)}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Disparador del sheet para la barra inferior móvil. */
export function ControlCenterTrigger({
  onClick,
  label = "Centro",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Abrir ${label.toLowerCase()}`}
      className="inline-flex h-11 w-[38px] shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-[var(--glass-fill-soft)] text-ds-text-2 shadow-[var(--glass-specular)] transition hover:bg-white/[0.09] hover:text-ds-text-1"
    >
      <PanelRightOpen className="h-[18px] w-[18px]" />
      <span className="sr-only">{label}</span>
    </button>
  );
}
