"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getConditionableTokens } from "@/lib/docs/token-registry";
import { conditionToMustache, type ConditionOp } from "@/lib/docs/condition";
import { CONDITION_OP_LABELS } from "@/lib/docs/laborales/constants";

export type ConditionDraft = {
  field: string;
  op: ConditionOp;
  value?: string;
  hasElse?: boolean;
};

function opsFor(type?: string): ConditionOp[] {
  if (type === "number" || type === "currency") {
    return [">", "<", ">=", "<=", "==", "!=", "truthy", "empty"];
  }
  return ["==", "!=", "truthy", "empty"];
}

export function ConditionBuilderDialog({
  open,
  onOpenChange,
  initial,
  onApply,
  allowElse = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: ConditionDraft | null;
  onApply: (draft: ConditionDraft) => void;
  allowElse?: boolean;
}) {
  const tokens = useMemo(() => getConditionableTokens(), []);
  const [field, setField] = useState(initial?.field ?? "guardia.isJubilado");
  const selected = tokens.find((t) => t.key === field);
  const [op, setOp] = useState<ConditionOp>(initial?.op ?? "==");
  const [value, setValue] = useState(initial?.value ?? "");
  const [hasElse, setHasElse] = useState(initial?.hasElse ?? true);

  useEffect(() => {
    if (!open) return;
    setField(initial?.field ?? "guardia.isJubilado");
    setOp(initial?.op ?? "==");
    setValue(initial?.value ?? "");
    setHasElse(initial?.hasElse ?? true);
  }, [open, initial]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof tokens>();
    for (const t of tokens) {
      const list = map.get(t.moduleLabel) ?? [];
      list.push(t);
      map.set(t.moduleLabel, list);
    }
    return [...map.entries()];
  }, [tokens]);

  const preview = conditionToMustache(field, op, value);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Condición SI / SINO</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-[13px]">
          <p className="text-ds-text-3">Si el dato falta, cuenta como que NO cumple.</p>
          <label className="block space-y-1">
            <span className="text-ds-text-2">Campo</span>
            <select
              className="h-10 sm:h-9 w-full rounded-md border border-ds-border-default bg-ds-surface-1 px-2"
              value={field}
              onChange={(e) => setField(e.target.value)}
            >
              {groups.map(([label, list]) => (
                <optgroup key={label} label={label}>
                  {list.map((t) => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-ds-text-2">Operador</span>
            <select
              className="h-10 sm:h-9 w-full rounded-md border border-ds-border-default bg-ds-surface-1 px-2"
              value={op}
              onChange={(e) => setOp(e.target.value as ConditionOp)}
            >
              {opsFor(selected?.type).map((o) => (
                <option key={o} value={o}>{CONDITION_OP_LABELS[o]}</option>
              ))}
            </select>
          </label>
          {op !== "truthy" && op !== "empty" && (
            selected?.catalog?.length ? (
              <select
                className="h-10 sm:h-9 w-full rounded-md border border-ds-border-default bg-ds-surface-1 px-2"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              >
                {selected.catalog.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            ) : (
              <Input className="h-10 sm:h-9" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Valor" />
            )
          )}
          {allowElse && (
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" checked={hasElse} onChange={(e) => setHasElse(e.target.checked)} />
              Incluir rama SINO
            </label>
          )}
          <button type="button" disabled className="text-ds-text-4" title="próximamente">
            Condición Y/O (próximamente)
          </button>
          <p className="font-mono text-[12px] text-ds-text-3">{preview}</p>
          <Button
            className="min-h-11 sm:min-h-9"
            onClick={() => {
              onApply({ field, op, value, hasElse });
              onOpenChange(false);
            }}
          >
            Insertar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
