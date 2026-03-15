"use client";

import React, { useState } from "react";
import { ChevronUp, Send, Shield, Mail } from "lucide-react";
import { formatCLP, formatUFSuffix, cn } from "@/lib/utils";
import { clpToUf } from "@/lib/uf-utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

interface MobileBottomBarProps {
  salePriceMonthly: number;
  additionalLinesTotal: number;
  marginPct: number;
  ufValue: number | null;
  financialPanelContent: React.ReactNode;
  sendButton?: React.ReactNode;
  portalButton?: React.ReactNode;
  pdfEmailButton?: React.ReactNode;
  emailButton?: React.ReactNode;
  totalGuards?: number;
  className?: string;
}

export function MobileBottomBar({
  salePriceMonthly,
  additionalLinesTotal,
  marginPct,
  ufValue,
  financialPanelContent,
  sendButton,
  portalButton,
  pdfEmailButton,
  emailButton,
  totalGuards,
  className,
}: MobileBottomBarProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sendSheetOpen, setSendSheetOpen] = useState(false);

  const total = salePriceMonthly + additionalLinesTotal;
  const ufTotal = ufValue ? clpToUf(total, ufValue) : null;

  const hasMultipleSendOptions = portalButton || pdfEmailButton || emailButton;

  return (
    <>
      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 lg:hidden",
          "bg-background/95 backdrop-blur-xl border-t border-border/60",
          "px-4 py-2 pb-[max(env(safe-area-inset-bottom,0px),0.5rem)]",
          "flex items-center justify-between gap-2",
          className
        )}
      >
        {/* Left: price info */}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="flex flex-col min-w-0 text-left"
        >
          <span className="text-base font-extrabold font-mono text-white truncate">
            {formatCLP(total)}
          </span>
          {ufTotal != null && ufValue ? (
            <span className="text-[10px] text-blue-400 truncate">
              {formatUFSuffix(ufTotal)} <span className="text-muted-foreground">(UF ${formatCLP(ufValue).replace("$", "")})</span>
            </span>
          ) : null}
          <span className="text-[10px] text-emerald-400">
            Margen {Number(marginPct || 0).toFixed(0)}%{totalGuards ? ` · ${totalGuards} guardias` : ""}
          </span>
        </button>

        {/* Right: send button */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          {hasMultipleSendOptions ? (
            <button
              type="button"
              onClick={() => setSendSheetOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors"
            >
              <Send className="h-3 w-3" />
              Enviar
            </button>
          ) : (
            sendButton
          )}
        </div>
      </div>

      {/* Bottom sheet with financial breakdown */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85vh] overflow-y-auto rounded-t-xl"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Detalle financiero</SheetTitle>
            <SheetDescription>
              Desglose completo de la cotización
            </SheetDescription>
          </SheetHeader>
          <div className="[&>div]:h-auto [&>div]:min-h-0">
            {financialPanelContent}
          </div>
        </SheetContent>
      </Sheet>

      {/* Send options bottom sheet */}
      {hasMultipleSendOptions && (
        <Sheet open={sendSheetOpen} onOpenChange={setSendSheetOpen}>
          <SheetContent
            side="bottom"
            className="rounded-t-2xl px-4 pt-3 pb-6"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Enviar cotización</SheetTitle>
              <SheetDescription>Elige cómo enviar la cotización</SheetDescription>
            </SheetHeader>

            {/* Drag handle */}
            <div className="flex justify-center mb-4">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>

            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">
              Enviar cotización
            </p>

            <div className="space-y-2">
              {portalButton && (
                <div onClick={() => setSendSheetOpen(false)}>
                  {portalButton}
                </div>
              )}
              {pdfEmailButton && (
                <div onClick={() => setSendSheetOpen(false)}>
                  {pdfEmailButton}
                </div>
              )}
              {emailButton && (
                <div onClick={() => setSendSheetOpen(false)}>
                  {emailButton}
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
