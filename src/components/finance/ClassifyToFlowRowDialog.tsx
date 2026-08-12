"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface ClassifyFlowRowOption {
  id: string;
  name: string;
  section: string;
  hasCategory: boolean;
}

export interface ClassifyFlowRowTx {
  id: string;
  description: string;
  amount: number;
}

interface Props {
  tx: ClassifyFlowRowTx | null;
  flowRows: ClassifyFlowRowOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClassified?: () => void;
  fmtAmount?: (n: number) => string;
}

const defaultFmt = (n: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);

/** Agrupa filas por sección conservando el orden de entrada. */
export function groupFlowRowsBySection(
  rows: ClassifyFlowRowOption[],
): Array<{ section: string; rows: ClassifyFlowRowOption[] }> {
  const groups: Array<{ section: string; rows: ClassifyFlowRowOption[] }> = [];
  const indexBySection = new Map<string, number>();
  for (const row of rows) {
    let idx = indexBySection.get(row.section);
    if (idx === undefined) {
      idx = groups.length;
      indexBySection.set(row.section, idx);
      groups.push({ section: row.section, rows: [] });
    }
    groups[idx]!.rows.push(row);
  }
  return groups;
}

export function ClassifyToFlowRowDialog({
  tx,
  flowRows,
  open,
  onOpenChange,
  onClassified,
  fmtAmount = defaultFmt,
}: Props) {
  const [flowRowId, setFlowRowId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setFlowRowId("");
  }, [open, tx?.id]);

  const groupedRows = useMemo(
    () => groupFlowRowsBySection(flowRows),
    [flowRows],
  );

  const selectedRow = flowRows.find((r) => r.id === flowRowId);

  const classify = async () => {
    if (!tx || !flowRowId) {
      toast.error("Elegí una fila de flujo");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/finance/banking/transactions/${tx.id}/classify-suggestions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "FLOW_ROW",
            flowRowId,
            learnRule: "NONE",
          }),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error ?? "No se pudo clasificar");
      }
      toast.success("Movimiento clasificado a la fila del flujo");
      onOpenChange(false);
      onClassified?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al clasificar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Clasificar a fila del flujo</DialogTitle>
          <DialogDescription>
            El movimiento se vincula a la fila elegida (sin crear regla).
          </DialogDescription>
        </DialogHeader>
        {tx && (
          <div className="rounded-md border border-ds-border-subtle bg-ds-surface-2 p-3 text-[12px] space-y-1">
            <p className="font-medium text-ds-text-1 truncate">{tx.description}</p>
            <p className="font-mono tabular-nums text-ds-text-3">
              {fmtAmount(tx.amount)}
            </p>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="classify-flow-row-select">Fila de flujo</Label>
          <Select
            key={tx?.id ?? "closed"}
            value={flowRowId}
            onValueChange={setFlowRowId}
          >
            <SelectTrigger
              id="classify-flow-row-select"
              className="h-10 sm:h-9"
              data-testid="classify-flow-row-select"
            >
              <SelectValue placeholder="Elegir fila…" />
            </SelectTrigger>
            <SelectContent>
              {groupedRows.map((group) => (
                <SelectGroup key={group.section}>
                  <SelectLabel>{group.section}</SelectLabel>
                  {group.rows.map((row) => (
                    <SelectItem
                      key={row.id}
                      value={row.id}
                      disabled={!row.hasCategory}
                      data-testid={`flow-row-option-${row.id}`}
                    >
                      {row.section} · {row.name}
                      {!row.hasCategory ? " (sin cuenta contable)" : ""}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          {selectedRow && (
            <p
              className="text-[12px] text-ds-text-3"
              data-testid="classify-flow-row-selected-label"
            >
              Seleccionado: {selectedRow.section} · {selectedRow.name}
            </p>
          )}
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="ghost"
            className="h-10 sm:h-9 w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            className="h-10 sm:h-9 w-full sm:w-auto"
            onClick={() => void classify()}
            disabled={saving || !flowRowId}
            data-testid="classify-flow-row-confirm"
          >
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Clasificar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
