"use client";

import React, { useState } from "react";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { CpqDualCurrencyAmount } from "@/components/cpq/CpqDualCurrency";
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
  displayCurrency?: string;
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
  displayCurrency = "CLP",
  sendButton,
  portalButton,
  pdfEmailButton,
  emailButton,
  totalGuards,
  className,
}: MobileBottomBarProps) {
  const [sendSheetOpen, setSendSheetOpen] = useState(false);

  const total = salePriceMonthly + additionalLinesTotal;

  const sendOptionSlots = [portalButton, pdfEmailButton, emailButton].filter(Boolean);
  const sendOptionsCount = sendOptionSlots.length;
  const hasMultipleSendOptions = sendOptionsCount > 1;

  const singleSendTrigger =
    sendOptionsCount === 1
      ? portalButton ?? pdfEmailButton ?? emailButton
      : null;

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
        {/* Left: precio (solo lectura; el desglose está en la ficha al hacer scroll) */}
        <div className="flex flex-col min-w-0 text-left">
          <CpqDualCurrencyAmount
            clp={total}
            currency={displayCurrency}
            ufValue={ufValue}
            size="md"
            isDark
            primaryClassName="!text-white font-extrabold"
            secondaryClassName="!text-blue-400/90"
            align="left"
          />
          <span className="text-[10px] text-emerald-400">
            Margen {Number(marginPct || 0).toFixed(0)}%{totalGuards ? ` · ${totalGuards} guardias` : ""}
          </span>
        </div>

        {/* Right: enviar */}
        <div className="flex items-center gap-1.5 shrink-0 min-w-0 flex-1 justify-end max-w-[58%]">
          {hasMultipleSendOptions ? (
            <button
              type="button"
              onClick={() => setSendSheetOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors w-full max-w-[200px]"
            >
              <Send className="h-3 w-3 shrink-0" />
              Enviar
            </button>
          ) : singleSendTrigger ? (
            <div className="w-full max-w-[220px] min-w-0 [&_button]:w-full">{singleSendTrigger}</div>
          ) : (
            sendButton
          )}
        </div>
      </div>

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
