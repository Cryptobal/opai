"use client";

import { useState } from "react";
import { Filter, X } from "lucide-react";
import type { FinanceReportFilters } from "@/modules/finance/reports/shared/types";
import { cn } from "@/lib/utils";

interface Props {
  value: FinanceReportFilters;
  onChange: (v: FinanceReportFilters) => void;
  sectorOptions?: string[];
}

export function ReportsFiltersDrawer({ value, onChange, sectorOptions = [] }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FinanceReportFilters>(value);

  const apply = () => {
    onChange(draft);
    setOpen(false);
  };
  const reset = () => {
    const empty: FinanceReportFilters = {};
    setDraft(empty);
    onChange(empty);
  };

  const activeCount =
    (value.crmAccountIds?.length ?? 0) +
    (value.installationIds?.length ?? 0) +
    (value.costCenterIds?.length ?? 0) +
    (value.sectors?.length ?? 0) +
    (value.onlyActiveClients === false ? 1 : 0);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setDraft(value);
          setOpen(true);
        }}
        className="inline-flex items-center gap-1.5 px-3 h-9 rounded-ds-md text-sm font-medium border border-ds-border-default bg-ds-surface text-ds-text-2 hover:bg-ds-surface-2 transition-colors"
      >
        <Filter className="w-3.5 h-3.5" />
        Filtros
        {activeCount > 0 && (
          <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold bg-primary text-primary-foreground">
            {activeCount}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-40 flex items-end lg:items-center lg:justify-end"
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-full lg:w-96 lg:h-full lg:max-h-screen rounded-t-2xl lg:rounded-l-2xl lg:rounded-tr-none border border-ds-border-default bg-ds-surface p-4 shadow-2xl overflow-y-auto">
            <header className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold font-display">Filtros</h3>
              <button
                onClick={() => setOpen(false)}
                className="text-ds-text-3 hover:text-ds-text-1 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </header>

            <section className="space-y-4">
              {sectorOptions.length > 0 && (
                <div>
                  <label className="text-[11px] font-mono uppercase tracking-wider text-ds-text-3 mb-1.5 block">
                    Sectores
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {sectorOptions.map((s) => {
                      const checked = draft.sectors?.includes(s) ?? false;
                      return (
                        <button
                          key={s}
                          onClick={() =>
                            setDraft((d) => ({
                              ...d,
                              sectors: checked
                                ? (d.sectors ?? []).filter((x) => x !== s)
                                : [...(d.sectors ?? []), s],
                            }))
                          }
                          className={cn(
                            "px-2.5 py-1 rounded-ds-sm border text-xs transition-colors",
                            checked
                              ? "bg-primary/15 border-primary/40 text-primary"
                              : "bg-ds-surface border-ds-border-default text-ds-text-2 hover:bg-ds-surface-2"
                          )}
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between rounded-ds-md border border-ds-border-default p-2.5">
                <div>
                  <p className="text-sm text-ds-text-1">Solo clientes activos</p>
                  <p className="text-[10.5px] text-ds-text-3">
                    Excluye CRM con status `client_inactive`.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={draft.onlyActiveClients !== false}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, onlyActiveClients: e.target.checked }))
                  }
                />
              </div>
            </section>

            <footer className="flex gap-2 mt-5">
              <button
                onClick={reset}
                className="flex-1 h-9 rounded-ds-md border border-ds-border-default text-sm text-ds-text-2 hover:bg-ds-surface-2 transition-colors"
              >
                Limpiar
              </button>
              <button
                onClick={apply}
                className="flex-1 h-9 rounded-ds-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Aplicar
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
