"use client";

import { Check, X } from "lucide-react";
import { fmtCLP } from "./format";
import { Button } from "@/components/ui/button";

export interface BankTx {
  id: string;
  transactionDate: string;
  description: string;
  amount: number;
  accountPlanCode: string | null;
  excludedReason?: "interna" | "comision" | "manual_override" | string | null;
  matchedOccurrenceId?: string | null;
  matchedItemName?: string | null;
  suggest?: { occurrenceId: string; itemName: string; confidence: number } | null;
}

interface Props {
  tx: BankTx;
  onAccept?: (txId: string, occurrenceId: string) => void | Promise<void>;
  onCreateManual?: (tx: BankTx) => void | Promise<void>;
  onIgnore?: (txId: string) => void | Promise<void>;
  dim?: boolean;
}

/** Fila de un movimiento bancario en el modal de cuadratura: icono de estado,
 *  monto, descripción, cuenta, fecha + acciones según estado. */
export function BankTxRow({ tx, onAccept, onCreateManual, onIgnore, dim }: Props) {
  const isPos = tx.amount > 0;
  const isMatched = !!tx.matchedOccurrenceId;
  const hasSuggest = !!tx.suggest;
  const isExcluded = !!tx.excludedReason;
  const ok = isMatched;

  return (
    <div className={`flex items-center gap-2.5 p-2.5 ${dim ? "opacity-70" : ""}`}>
      <div className="flex w-5 shrink-0 justify-center">
        {ok ? (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-status-ok-soft">
            <Check className="h-2.5 w-2.5 text-status-ok-fg" />
          </span>
        ) : hasSuggest ? (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-status-warn-soft text-[9px] font-bold text-status-warn-fg">
            ?
          </span>
        ) : isExcluded ? (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-ds-surface-3">
            <X className="h-2.5 w-2.5 text-ds-text-3" />
          </span>
        ) : (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-status-danger-soft text-[9px] font-bold text-status-danger-fg">
            !
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className="font-mono text-[12px] font-semibold tabular-nums"
            style={{ color: isPos ? "var(--ds-ok)" : "var(--ds-danger)" }}
          >
            {isPos ? "+" : ""}
            {fmtCLP.format(tx.amount)}
          </span>
          {tx.accountPlanCode && (
            <span className="rounded-ds-sm bg-ds-surface-3 px-1 py-0.5 text-[9px] uppercase text-ds-text-3">
              {tx.accountPlanCode}
            </span>
          )}
          <span className="text-[9px] text-ds-text-3">
            {new Date(tx.transactionDate).toLocaleDateString("es-CL", {
              day: "numeric",
              month: "short",
            })}
          </span>
        </div>
        <div className="mt-0.5 truncate text-[11px] text-ds-text-2">{tx.description}</div>
        {isMatched && (
          <div className="mt-0.5 text-[10px] text-status-ok-fg">
            calza con <b>{tx.matchedItemName}</b>
          </div>
        )}
        {hasSuggest && tx.suggest && (
          <div className="mt-0.5 text-[10px] text-status-warn-fg">
            sugerencia: <b>{tx.suggest.itemName}</b> · {tx.suggest.confidence}%
          </div>
        )}
        {tx.excludedReason === "interna" && (
          <div className="mt-0.5 text-[10px] text-ds-text-3">
            transferencia interna · no afecta saldo consolidado
          </div>
        )}
        {tx.excludedReason === "comision" && (
          <div className="mt-0.5 text-[10px] text-ds-text-3">
            comisión bancaria · regla automática
          </div>
        )}
        {tx.excludedReason === "manual_override" && (
          <div className="mt-0.5 text-[10px] text-ds-text-3">excluida manualmente</div>
        )}
      </div>
      {!ok && !isExcluded && (
        <div className="flex shrink-0 items-center gap-1">
          {hasSuggest && tx.suggest && onAccept && (
            <Button
              size="sm"
              className="h-7 text-[11px]"
              onClick={() => onAccept(tx.id, tx.suggest!.occurrenceId)}
            >
              Calzar
            </Button>
          )}
          {!hasSuggest && onCreateManual && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={() => onCreateManual(tx)}
            >
              + Manual
            </Button>
          )}
          {onIgnore && (
            <button
              type="button"
              onClick={() => onIgnore(tx.id)}
              className="rounded-ds-sm p-1.5 text-ds-text-3 hover:bg-ds-surface-3 hover:text-ds-text-1"
              aria-label="Descartar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
