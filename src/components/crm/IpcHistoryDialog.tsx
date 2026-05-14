"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock, Loader2, TrendingUp } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface Adjustment {
  id: string;
  dueDate: string;
  status: "PENDING" | "APPLIED";
  appliedPct: number | null;
  oldAmount: number | null;
  newAmount: number | null;
  appliedAt: string | null;
  appliedByName: string | null;
  notes: string | null;
}

interface Props {
  itemId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatCLP(n: number | null): string {
  if (n === null) return "—";
  return `$${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(n)}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function IpcHistoryDialog({ itemId, open, onOpenChange }: Props) {
  const [rows, setRows] = useState<Adjustment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setRows(null);
    setError(null);
    fetch(`/api/finance/cashflow/items/${itemId}/ipc-adjustments`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (!json.success) {
          setError(json.error ?? "Error cargando historial");
          return;
        }
        setRows(json.data);
      })
      .catch(() => {
        if (!cancelled) setError("Error de conexión");
      });
    return () => {
      cancelled = true;
    };
  }, [open, itemId]);

  const applied = rows?.filter((r) => r.status === "APPLIED") ?? [];
  const pending = rows?.filter((r) => r.status === "PENDING") ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-status-info-fg" />
            Historial de reajustes IPC
          </DialogTitle>
          <DialogDescription>
            Línea de tiempo de reajustes aplicados y próximos pendientes.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 space-y-4">
          {rows === null && !error ? (
            <div className="flex items-center justify-center py-8 text-ds-text-3">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Cargando…
            </div>
          ) : null}
          {error ? (
            <div className="text-sm text-destructive">{error}</div>
          ) : null}

          {pending.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
                Próximo reajuste
              </h4>
              {pending.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 rounded-lg border border-status-warn-border bg-status-warn-soft px-3 py-2"
                >
                  <Clock className="h-4 w-4 text-status-warn-fg shrink-0" />
                  <div className="flex-1 text-sm">
                    <span className="font-medium">{formatDate(p.dueDate)}</span>
                    <span className="text-ds-text-3 ml-2">Pendiente</span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {applied.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
                Reajustes aplicados ({applied.length})
              </h4>
              <div className="space-y-1.5">
                {applied.map((a) => {
                  const isZero = (a.appliedPct ?? 0) === 0;
                  return (
                    <div
                      key={a.id}
                      className="rounded-lg border border-ds-border-subtle bg-ds-surface-2 px-3 py-2"
                    >
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="h-4 w-4 text-status-ok-fg shrink-0 mt-0.5" />
                        <div className="flex-1 text-sm space-y-0.5">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">
                              {formatDate(a.dueDate)}
                            </span>
                            <span
                              className={cn(
                                "font-mono font-semibold text-[12px]",
                                isZero
                                  ? "text-ds-text-3"
                                  : (a.appliedPct ?? 0) > 0
                                  ? "text-status-ok-fg"
                                  : "text-status-warn-fg",
                              )}
                            >
                              {isZero
                                ? "Sin reajuste"
                                : `${a.appliedPct! > 0 ? "+" : ""}${a.appliedPct!.toFixed(2)}%`}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[12px] text-ds-text-3 font-mono">
                            <span>{formatCLP(a.oldAmount)}</span>
                            <span>→</span>
                            <span className="text-ds-text-1">
                              {formatCLP(a.newAmount)}
                            </span>
                          </div>
                          <div className="text-[11px] text-ds-text-3">
                            {a.appliedByName
                              ? `Aplicado por ${a.appliedByName}`
                              : "Aplicado"}
                            {a.appliedAt
                              ? ` · ${formatDate(a.appliedAt)}`
                              : ""}
                          </div>
                          {a.notes ? (
                            <div className="text-[11px] text-ds-text-2 italic pt-0.5">
                              "{a.notes}"
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {rows !== null && rows.length === 0 ? (
            <div className="text-sm text-ds-text-3 text-center py-6">
              Aún no hay reajustes registrados para este contrato.
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
