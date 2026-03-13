"use client";

import React, { useState } from "react";
import { ChevronUp, Send } from "lucide-react";
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
  sendButton: React.ReactNode;
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
  totalGuards,
  className,
}: MobileBottomBarProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const total = salePriceMonthly + additionalLinesTotal;
  const ufTotal = ufValue ? clpToUf(total, ufValue) : null;

  return (
    <>
      <div
        className={cn(
          "fixed bottom-14 left-0 right-0 z-50",
          "bg-background/95 backdrop-blur-xl border-t border-border/60",
          "px-4 py-2",
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
          {sendButton}
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
    </>
  );
}
