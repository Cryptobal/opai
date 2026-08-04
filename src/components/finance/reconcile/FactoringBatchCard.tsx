"use client";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Layers, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import type { FactoringBatchCandidate, FactoringCandidate } from "./types";

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

export interface FactoringBatchCardProps {
  batch: FactoringBatchCandidate;
  operations: FactoringCandidate[];
  selectedIds: Set<string>;
  onToggleBatch: () => void;
  onToggleOperation: (op: FactoringCandidate) => void;
}

export function FactoringBatchCard({
  batch,
  operations,
  selectedIds,
  onToggleBatch,
  onToggleOperation,
}: FactoringBatchCardProps) {
  const allSelected =
    batch.operationIds.length > 0 &&
    batch.operationIds.every((id) => selectedIds.has(id));
  const someSelected =
    !allSelected && batch.operationIds.some((id) => selectedIds.has(id));

  return (
    <div
      className={cn(
        "rounded-xl border p-3 space-y-3",
        batch.matchesDeposit
          ? "border-status-ok-border bg-status-ok-soft/20"
          : "border-ds-border-default bg-ds-surface-1",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 pt-0.5">
          <Layers
            className={cn(
              "h-5 w-5",
              batch.matchesDeposit ? "text-status-ok-fg" : "text-primary",
            )}
          />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-[13px] font-medium text-ds-text-1">
              Lote {batch.code}
            </p>
            {batch.matchesDeposit ? (
              <Tag variant="ok" size="sm">
                Calza con depósito
              </Tag>
            ) : null}
            <Tag variant="neutral" size="sm">
              {batch.operationsCount} cesiones
            </Tag>
          </div>
          <p className="text-[12px] text-ds-text-3">
            {batch.factoringCompanyName}
            {batch.fechaCesion
              ? ` · ${format(new Date(batch.fechaCesion), "dd MMM yyyy", { locale: es })}`
              : ""}
          </p>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[13px] font-mono font-medium tabular-nums text-ds-text-1">
              {fmtCLP.format(batch.totalMontoAGirar)}
              <span className="text-[12px] font-normal text-ds-text-3 ml-1">
                a girar
              </span>
            </p>
            <Button
              type="button"
              size="sm"
              variant={allSelected ? "outline" : "default"}
              className="h-11 sm:h-9 min-w-[7.5rem]"
              onClick={onToggleBatch}
            >
              {allSelected ? (
                "Quitar lote"
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                  {someSelected ? "Completar lote" : "Asignar lote"}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {operations.length > 0 && (
        <ul className="space-y-1.5 border-t border-ds-border-subtle pt-2">
          {operations.map((op) => {
            const selected = selectedIds.has(op.id);
            return (
              <li key={op.id}>
                <button
                  type="button"
                  onClick={() => onToggleOperation(op)}
                  className={cn(
                    "w-full flex items-center gap-2 rounded-md px-2 py-2 min-h-11 text-left",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                    selected ? "bg-primary/5" : "hover:bg-ds-surface-2",
                  )}
                >
                  {selected ? (
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  ) : (
                    <span className="h-4 w-4 rounded-full border border-ds-border-default shrink-0" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ds-text-1">
                    {op.dteFolio ? `Factura ${op.dteFolio}` : op.code}
                    {op.dteReceiverName ? (
                      <span className="text-ds-text-3">
                        {" · "}
                        {op.dteReceiverName}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 font-mono text-[12px] tabular-nums text-ds-text-2">
                    {fmtCLP.format(op.expectedDeposit)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
