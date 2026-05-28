"use client";

import { useEffect, useState } from "react";
import { Landmark, Lock, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtCLP } from "./format";

export interface CierreConfirmInput {
  mode: "real" | "manual";
  forcedBalanceClp?: number;
  manualReason?: string;
}

interface Props {
  bankConnected: boolean;
  projectedClp: number;
  bankClosingClp: number;
  submitting: boolean;
  onConfirm: (input: CierreConfirmInput) => void;
}

/** Bloque de cierre del modal de cuadratura: saldo real (no editable) con
 *  escape a manual, o manual directo (input + motivo obligatorio + aviso de
 *  ajuste automático). */
export function CierreBlock({
  bankConnected,
  projectedClp,
  bankClosingClp,
  submitting,
  onConfirm,
}: Props) {
  const [manualMode, setManualMode] = useState(!bankConnected);
  const [manualBalance, setManualBalance] = useState("");
  const [manualReason, setManualReason] = useState("");

  useEffect(() => {
    if (!bankConnected) setManualMode(true);
  }, [bankConnected]);

  const manualBalanceN = parseInt(manualBalance.replace(/[^\d-]/g, ""), 10) || 0;
  const adjustDiff = manualMode ? manualBalanceN - projectedClp : 0;
  const canSubmitManual = !!manualBalance && manualReason.trim().length >= 5;

  return (
    <div
      className={`overflow-hidden rounded-ds-lg border bg-ds-surface-2 ${
        manualMode ? "border-status-warn-border" : "border-primary"
      }`}
    >
      <div className={`px-3 py-2 ${manualMode ? "bg-status-warn-soft" : "bg-primary/10"}`}>
        <span
          className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${
            manualMode ? "text-status-warn-fg" : "text-primary"
          }`}
        >
          {manualMode ? (
            <>
              <Pencil className="h-3 w-3" /> Cierre manual
            </>
          ) : (
            <>
              <Landmark className="h-3 w-3" /> Cierre con saldo real del banco
            </>
          )}
        </span>
      </div>
      <div className="space-y-2.5 p-3">
        {!manualMode && bankConnected && (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase text-ds-text-3">se anclará con</div>
              <div className="mt-0.5 font-mono text-xl font-bold tabular-nums text-primary">
                {fmtCLP.format(bankClosingClp)}
              </div>
              <div className="mt-0.5 text-[10px] text-ds-text-3">
                calculado de la cartola (no editable)
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setManualMode(true);
                setManualBalance(String(bankClosingClp));
              }}
              className="text-[11px] text-status-warn-fg underline"
            >
              ¿el banco no coincide?
            </button>
          </div>
        )}
        {manualMode && (
          <>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-ds-text-3">
                Saldo final manual
              </label>
              <input
                value={manualBalance}
                onChange={(e) => setManualBalance(e.target.value)}
                placeholder="ej. 10400000"
                inputMode="numeric"
                className="mt-1 w-full rounded-ds-md border border-status-warn-border bg-ds-surface-3 px-3 py-2 font-mono text-[15px] font-bold tabular-nums text-status-warn-fg focus:outline-none focus:ring-1 focus:ring-status-warn-fg"
              />
              {manualBalanceN !== 0 && adjustDiff !== 0 && (
                <div className="mt-1.5 text-[10px] text-status-warn-fg">
                  Se creará una occurrence{" "}
                  <b>
                    «Ajuste de cierre {adjustDiff > 0 ? "+" : ""}
                    {fmtCLP.format(adjustDiff)}»
                  </b>{" "}
                  en la semana para que cuadre.
                </div>
              )}
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-ds-text-3">
                Motivo (obligatorio, mínimo 5 caracteres)
              </label>
              <textarea
                value={manualReason}
                onChange={(e) => setManualReason(e.target.value)}
                placeholder="ej. Banco fuera de línea, saldo tomado de cartola PDF"
                rows={2}
                className="mt-1 w-full resize-none rounded-ds-md border border-ds-border-default bg-ds-surface-3 px-3 py-2 text-[12px] text-ds-text-1 placeholder:text-ds-text-3 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            {bankConnected && (
              <button
                type="button"
                onClick={() => {
                  setManualMode(false);
                  setManualBalance("");
                  setManualReason("");
                }}
                className="text-[11px] text-ds-text-3 underline"
              >
                ← volver al cierre con saldo real
              </button>
            )}
          </>
        )}
        <div className="pt-2">
          {manualMode ? (
            <Button
              disabled={!canSubmitManual || submitting}
              onClick={() =>
                onConfirm({
                  mode: "manual",
                  forcedBalanceClp: manualBalanceN,
                  manualReason: manualReason.trim(),
                })
              }
              className="w-full"
            >
              <Pencil className="mr-1 h-3 w-3" /> Cerrar manual con{" "}
              {fmtCLP.format(manualBalanceN || 0)}
            </Button>
          ) : (
            <Button
              disabled={submitting}
              onClick={() => onConfirm({ mode: "real" })}
              className="w-full"
            >
              <Lock className="mr-1 h-3 w-3" /> Cerrar con saldo real{" "}
              {fmtCLP.format(bankClosingClp)}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
