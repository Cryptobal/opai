"use client";

import { useMemo, useState } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Surface, Tag } from "@/components/opai-ds";
import { toast } from "sonner";
import type { BandejaGroup } from "@/modules/finance/flow-v3/unmatched-count";
import {
  MERCHANT_NEEDLE_MIN_LEN,
  isForbiddenNeedle,
  normalizeMerchantText,
} from "@/modules/finance/banking/merchant-key";
import { fmtClp, fmtShortDate } from "./format";

export interface BandejaFlowRowOption {
  id: string;
  name: string;
  section: string;
  hasCategory: boolean;
  categoryId: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  section: string;
  groups: BandejaGroup[];
  flowRows: BandejaFlowRowOption[];
  onClassifyGroup: (args: {
    group: BandejaGroup;
    flowRowId: string;
    needle: string | null;
  }) => Promise<void>;
}

const KIND_BADGE: Record<BandejaGroup["kind"], string> = {
  RUT: "RUT",
  MERCHANT: "Glosa",
  OTHER: "Sin patrón",
};

function GroupAssignPanel({
  group,
  flowRows,
  busy,
  onConfirm,
  onCancel,
}: {
  group: BandejaGroup;
  flowRows: BandejaFlowRowOption[];
  busy: boolean;
  onConfirm: (flowRowId: string, needle: string | null) => void;
  onCancel: () => void;
}) {
  const [needle, setNeedle] = useState(group.needle ?? "");
  const categoryCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of flowRows) {
      if (!r.categoryId) continue;
      m.set(r.categoryId, (m.get(r.categoryId) ?? 0) + 1);
    }
    return m;
  }, [flowRows]);

  const needleNorm = normalizeMerchantText(needle).trim();
  const needleOk =
    group.kind !== "MERCHANT" ||
    (needleNorm.length >= MERCHANT_NEEDLE_MIN_LEN && !isForbiddenNeedle(needleNorm));

  return (
    <Surface elevation={1} padding="sm" className="space-y-2">
      <p className="text-[12px] text-ds-text-3">Elegir fila destino</p>
      {group.kind === "RUT" && group.needle && (
        <p className="text-[12px] text-ds-text-3">
          Se creará la regla: RUT es {group.label}
        </p>
      )}
      {group.kind === "MERCHANT" && (
        <div className="space-y-1">
          <label className="text-[12px] text-ds-text-3" htmlFor={`needle-${group.key}`}>
            Regla a aprender: la descripción contiene
          </label>
          <Input
            id={`needle-${group.key}`}
            value={needle}
            onChange={(e) => setNeedle(e.target.value)}
            className="h-10 sm:h-9"
            disabled={busy}
          />
          <p className="text-[12px] text-ds-text-3">
            Se creará la regla: descripción contiene «{needleNorm || "…"}»
          </p>
          {!needleOk && (
            <p className="text-[12px] text-status-warn-fg">
              Mínimo {MERCHANT_NEEDLE_MIN_LEN} caracteres; evitá términos genéricos.
            </p>
          )}
        </div>
      )}
      {group.kind === "OTHER" && (
        <p className="text-[12px] text-ds-text-3">
          Estos movimientos se clasifican una sola vez; no se creará una regla.
        </p>
      )}
      {flowRows.map((row) => {
        const shared =
          row.categoryId != null && (categoryCounts.get(row.categoryId) ?? 0) > 1;
        const disabled = busy || !row.hasCategory || (group.kind === "MERCHANT" && !needleOk);
        return (
          <div key={row.id}>
            <button
              type="button"
              disabled={disabled}
              onClick={() =>
                onConfirm(
                  row.id,
                  group.kind === "MERCHANT"
                    ? needleNorm
                    : group.kind === "RUT"
                      ? group.needle
                      : null,
                )
              }
              className="flex min-h-11 w-full flex-col items-start justify-center rounded-md px-2 text-left text-[13px] text-ds-text-1 hover:bg-ds-surface-2 disabled:opacity-50"
            >
              <span>{row.name}</span>
              {!row.hasCategory && (
                <span className="text-[12px] text-status-warn-fg">sin cuenta contable</span>
              )}
            </button>
            {shared && row.hasCategory && (
              <p className="px-2 pb-1 text-[12px] text-status-warn-fg">
                Otra fila comparte esta categoría; el movimiento puede aparecer en ella.
              </p>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={onCancel}
        className="flex min-h-11 w-full items-center justify-center text-[12px] text-ds-text-3"
      >
        Cancelar
      </button>
    </Surface>
  );
}

/** Sheet: grupos de bandeja (RUT / comerciante / residual) para clasificar a fila. */
export function BandejaGroupList({
  open,
  onOpenChange,
  section,
  groups,
  flowRows,
  onClassifyGroup,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [pickKey, setPickKey] = useState<string | null>(null);

  const title = section === "INGRESOS" ? "Otros ingresos · cartola" : "Otros egresos · cartola";
  const totalClp = useMemo(
    () => groups.reduce((s, g) => s + g.totalClp, 0),
    [groups],
  );

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const assign = async (
    group: BandejaGroup,
    flowRowId: string,
    needle: string | null,
  ) => {
    setBusyKey(group.key);
    try {
      await onClassifyGroup({ group, flowRowId, needle });
      setPickKey(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al clasificar";
      toast.error(message);
    } finally {
      setBusyKey(null);
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
              ? "Sin movimientos pendientes"
              : `${groups.length} grupos · ${fmtClp(totalClp)} en cartola`}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto border-t border-ds-border-subtle">
          {groups.length === 0 ? (
            <p className="px-5 py-6 text-[13px] text-ds-text-4">No hay movimientos pendientes.</p>
          ) : (
            <ul className="ds-list-cascade">
              {groups.map((g) => {
                const isOpen = expanded.has(g.key);
                const picking = pickKey === g.key;
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
                      <span className="min-w-0 flex-1 truncate text-[13px] text-ds-text-1">
                        {g.label}
                      </span>
                      <Tag size="sm" variant="neutral">{KIND_BADGE[g.kind]}</Tag>
                      <span className="shrink-0 text-[12px] text-ds-text-3">
                        {g.items.length} mov
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
                            disabled={busyKey === g.key || flowRows.length === 0}
                            onClick={() => setPickKey(g.key)}
                            className="flex min-h-11 w-full items-center justify-center rounded-lg border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] font-medium text-ds-text-1 hover:bg-ds-surface-2 disabled:opacity-50"
                          >
                            Asignar a fila…
                          </button>
                        ) : (
                          <GroupAssignPanel
                            group={g}
                            flowRows={flowRows}
                            busy={busyKey === g.key}
                            onConfirm={(flowRowId, needle) => {
                              void assign(g, flowRowId, needle);
                            }}
                            onCancel={() => setPickKey(null)}
                          />
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
