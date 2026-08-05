"use client";

import { useMemo, useState } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Surface } from "@/components/opai-ds";
import type { BandejaGroup } from "@/modules/finance/flow-v3/unmatched-count";
import { fmtClp, fmtShortDate } from "./format";

interface FlowRowOption {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  section: string;
  groups: BandejaGroup[];
  flowRows: FlowRowOption[];
  onClassifyRut: (groupKey: string, flowRowId: string) => void | Promise<void>;
}

/** Sheet: RUTs sin regla en bandeja (capa real), agrupados por monto. */
export function BandejaRutList({
  open,
  onOpenChange,
  section,
  groups,
  flowRows,
  onClassifyRut,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [busyRut, setBusyRut] = useState<string | null>(null);
  const [pickRut, setPickRut] = useState<string | null>(null);

  const title = section === "INGRESOS" ? "Otros ingresos · cartola" : "Otros egresos · cartola";
  const totalClp = useMemo(
    () => groups.reduce((s, g) => s + g.totalClp, 0),
    [groups],
  );

  const toggle = (rut: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(rut)) next.delete(rut);
      else next.add(rut);
      return next;
    });
  };

  const assign = async (rut: string, flowRowId: string) => {
    setBusyRut(rut);
    try {
      await onClassifyRut(rut, flowRowId);
      setPickRut(null);
    } finally {
      setBusyRut(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex h-[100dvh] max-h-[100dvh] flex-col gap-0 rounded-none p-0 sm:h-auto sm:max-h-[85vh] sm:rounded-t-2xl"
      >
        <div className="mx-auto mt-2 hidden h-1 w-10 rounded-full bg-ds-border-default sm:block" aria-hidden />
        <SheetHeader className="shrink-0 px-5 pt-4 pb-3 text-left">
          <SheetTitle className="text-base text-ds-text-1">{title}</SheetTitle>
          <SheetDescription className="text-[13px] text-ds-text-3">
            {groups.length === 0
              ? "Sin movimientos sin regla"
              : `${groups.length} RUT · ${fmtClp(totalClp)} en cartola`}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto border-t border-ds-border-subtle">
          {groups.length === 0 ? (
            <p className="px-5 py-6 text-[13px] text-ds-text-4">No hay RUT pendientes.</p>
          ) : (
            <ul className="ds-list-cascade">
              {groups.map((g) => {
                const isOpen = expanded.has(g.key);
                const picking = pickRut === g.key;
                return (
                  <li key={g.key} className="border-b border-ds-border-subtle last:border-b-0">
                    <button
                      type="button"
                      onClick={() => toggle(g.key)}
                      className="flex min-h-11 w-full items-center gap-2 px-5 py-3 text-left hover:bg-ds-surface-2"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-ds-text-3" aria-hidden />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-ds-text-3" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-ds-text-1">
                        {g.label}
                      </span>
                      <span className="shrink-0 tabular-nums text-[13px] text-ds-text-2">
                        {fmtClp(g.totalClp)}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="space-y-2 px-5 pb-3">
                        <ul className="space-y-1">
                          {g.items.map((it) => (
                            <li
                              key={`${it.bankTransactionId}:${it.weekStart}`}
                              className="rounded-md bg-ds-surface-2 px-3 py-2"
                            >
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="text-[12px] text-ds-text-3">
                                  {fmtShortDate(it.fecha)}
                                </span>
                                <span className="tabular-nums text-[13px] text-ds-text-1">
                                  {fmtClp(it.monto)}
                                </span>
                              </div>
                              <p className="mt-0.5 truncate text-[12px] text-ds-text-3" title={it.label}>
                                {it.label}
                              </p>
                            </li>
                          ))}
                        </ul>
                        {!picking ? (
                          <button
                            type="button"
                            disabled={busyRut === g.key || flowRows.length === 0}
                            onClick={() => setPickRut(g.key)}
                            className="flex min-h-11 w-full items-center justify-center rounded-lg border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] font-medium text-ds-text-1 hover:bg-ds-surface-2 disabled:opacity-50"
                          >
                            Asignar a fila…
                          </button>
                        ) : (
                          <Surface elevation={1} padding="sm" className="space-y-1">
                            <p className="text-[12px] text-ds-text-3">Elegir fila destino</p>
                            {flowRows.map((row) => (
                              <button
                                key={row.id}
                                type="button"
                                disabled={busyRut === g.key}
                                onClick={() => void assign(g.key, row.id)}
                                className="flex min-h-11 w-full items-center rounded-md px-2 text-left text-[13px] text-ds-text-1 hover:bg-ds-surface-2 disabled:opacity-50"
                              >
                                {row.name}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => setPickRut(null)}
                              className="flex min-h-11 w-full items-center justify-center text-[12px] text-ds-text-3"
                            >
                              Cancelar
                            </button>
                          </Surface>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
