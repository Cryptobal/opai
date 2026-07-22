"use client";

import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtShortDate, formatThousands, parseSignedAmount } from "./format";

export interface FillRightRequest {
  rowId: string;
  rowName: string;
  /** Lunes ISO de la celda origen. */
  fromWeek: string;
  /** Semanas futuras disponibles a la derecha (keys YMD, sin la origen). */
  weeksRight: string[];
  /** Monto de la celda origen (prefill). */
  amount: number;
}

interface Props {
  request: FillRightRequest | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (rowId: string, weekStarts: string[], amount: number) => Promise<unknown>;
}

/** Rellenar → estilo Sheets (F3): repite un monto en las próximas N semanas. */
export function FillRightDialog({ request, busy, onClose, onConfirm }: Props) {
  const [amountStr, setAmountStr] = useState("");
  const [weeksN, setWeeksN] = useState(12);

  useEffect(() => {
    if (!request) return;
    setAmountStr(request.amount !== 0 ? formatThousands(String(Math.abs(request.amount))) : "");
    setWeeksN(Math.min(12, request.weeksRight.length));
  }, [request]);

  if (!request) return null;
  const maxN = Math.min(request.weeksRight.length, 60);
  const n = Math.max(1, Math.min(weeksN || 1, maxN));
  const amount =
    (request.amount < 0 ? -1 : 1) * Math.abs(parseSignedAmount(amountStr || "0"));
  const targets = request.weeksRight.slice(0, n);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Rellenar hacia la derecha</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm text-ds-text-2">
          <p>
            <span className="font-medium text-ds-text-1">{request.rowName}</span> · desde la semana
            del {fmtShortDate(request.fromWeek)} hacia adelante.
          </p>
          <label className="block space-y-1 text-xs text-ds-text-3">
            <span>Monto por semana (CLP)</span>
            <Input
              inputMode="numeric"
              value={amountStr}
              onChange={(e) => setAmountStr(formatThousands(e.target.value))}
              placeholder="1.500.000"
            />
          </label>
          <label className="block space-y-1 text-xs text-ds-text-3">
            <span>Cantidad de semanas (máx {maxN})</span>
            <Input
              type="number"
              min={1}
              max={maxN}
              value={weeksN}
              onChange={(e) => setWeeksN(Number(e.target.value))}
            />
          </label>
          {targets.length > 0 && (
            <p className="text-xs text-ds-text-4">
              Se escribirá en {targets.length} semana{targets.length === 1 ? "" : "s"}:{" "}
              {fmtShortDate(targets[0])} → {fmtShortDate(targets[targets.length - 1])}.
              El monto 0 borra las celdas.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={busy || targets.length === 0}
            onClick={async () => {
              const r = await onConfirm(request.rowId, targets, amount);
              if (r != null) onClose();
            }}
          >
            {busy ? "Rellenando…" : "Rellenar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
