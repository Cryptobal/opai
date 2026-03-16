"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { formatPersonName } from "@/lib/personas";
import type { GuardiaOption } from "@/types/ops-asistencia";

interface SheetMontoTEProps {
  open: boolean;
  onClose: () => void;
  guard: GuardiaOption | null;
  baseAmount: number;
  isDesktop: boolean;
  isSaving: boolean;
  onConfirm: (data: { guardId: string; amount: number; justification?: string }) => void;
}

export function SheetMontoTE({
  open,
  onClose,
  guard,
  baseAmount,
  isDesktop,
  isSaving,
  onConfirm,
}: SheetMontoTEProps) {
  const [amount, setAmount] = useState(baseAmount);
  const [justification, setJustification] = useState("");

  useEffect(() => {
    if (open) {
      setAmount(baseAmount);
      setJustification("");
    }
  }, [open, baseAmount]);

  const isModified = amount !== baseAmount;
  const canConfirm = !isSaving && guard && (!isModified || justification.trim().length >= 3);

  const content = guard ? (
    <div className="space-y-4 py-2">
      {/* Guard info */}
      <div className="rounded-md border border-border/60 bg-muted/20 p-3">
        <div className="flex items-center gap-2">
          <span className="text-violet-400 text-lg">↺</span>
          <div>
            <span className="text-sm font-medium">
              {formatPersonName(guard.persona.firstName, guard.persona.lastName)}
            </span>
            {guard.code && (
              <span className="text-xs text-muted-foreground block">{guard.code} · Turno Extra</span>
            )}
          </div>
        </div>
      </div>

      {/* Amount input */}
      <div className="space-y-2">
        <Label>Monto del turno extra</Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
          <Input
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value) || 0)}
            className="h-10 pl-7"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Valor base: ${baseAmount.toLocaleString("es-CL")}
        </p>
        {isModified && (
          <p className="text-xs text-amber-400">Monto modificado</p>
        )}
      </div>

      {/* Justification (required if amount modified) */}
      {isModified && (
        <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
          <Label>Justificación (obligatorio)</Label>
          <Input
            placeholder="¿Por qué se modifica el monto?"
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            className="h-10"
          />
          {justification.trim().length > 0 && justification.trim().length < 3 && (
            <p className="text-xs text-red-400">Mínimo 3 caracteres</p>
          )}
        </div>
      )}

      {/* Confirm button */}
      <Button
        className="w-full"
        disabled={!canConfirm}
        onClick={() => {
          if (!guard) return;
          onConfirm({
            guardId: guard.id,
            amount,
            justification: isModified ? justification.trim() : undefined,
          });
        }}
      >
        {isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          `Confirmar reemplazo · $${amount.toLocaleString("es-CL")}`
        )}
      </Button>
    </div>
  ) : null;

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Valor del turno extra</DialogTitle>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="max-h-[80vh] rounded-t-xl">
        <SheetHeader>
          <SheetTitle>Valor del turno extra</SheetTitle>
        </SheetHeader>
        <div className="mt-4">{content}</div>
      </SheetContent>
    </Sheet>
  );
}
