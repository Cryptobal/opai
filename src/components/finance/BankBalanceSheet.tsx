"use client";

import { DatePickerField } from "@/components/ui/date-picker";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { confirmDialog } from "@/components/ui/confirm-service";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, Wallet, Upload, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tag } from "@/components/opai-ds";
import { DEFAULT_BANK_BALANCE_DISCREPANCY_THRESHOLD_CLP } from "@/modules/finance/banking/bank-balance-constants";

interface BalanceSnapshot {
  id: string;
  asOfDate: string;
  balance: string | number;
  computedBalance?: string | number | null;
  deltaClp?: string | number | null;
  source: "MANUAL" | "IMPORT" | "CALCULATED";
  note: string | null;
  createdAt: string;
  createdById: string | null;
}

interface BankBalanceSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bankAccountId: string;
  bankAccountLabel: string;
  canManage: boolean;
  currentBalance?: number;
  onChanged?: () => void;
}

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

const SOURCE_LABEL: Record<BalanceSnapshot["source"], { label: string; className: string; icon: React.ComponentType<{ className?: string }> }> = {
  MANUAL: {
    label: "Manual",
    className: "bg-status-info-soft text-status-info-fg border-status-info-border",
    icon: Wallet,
  },
  IMPORT: {
    label: "Cartola",
    className: "bg-status-ok-soft text-status-ok-fg border-status-ok-border",
    icon: Upload,
  },
  CALCULATED: {
    label: "Fintoc",
    className: "bg-primary/10 text-primary border-primary/30",
    icon: History,
  },
};

export function BankBalanceSheet({
  open,
  onOpenChange,
  bankAccountId,
  bankAccountLabel,
  canManage,
  currentBalance,
  onChanged,
}: BankBalanceSheetProps) {
  const [history, setHistory] = useState<BalanceSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [thresholdClp, setThresholdClp] = useState(
    DEFAULT_BANK_BALANCE_DISCREPANCY_THRESHOLD_CLP,
  );
  // Form
  const [asOfDate, setAsOfDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [balanceStr, setBalanceStr] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/finance/banking/accounts/${bankAccountId}/balance-history`
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Error al cargar historial");
      }
      setHistory(json.data ?? []);
      if (typeof json.discrepancyThresholdClp === "number") {
        setThresholdClp(json.discrepancyThresholdClp);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }, [bankAccountId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const handleSubmit = async () => {
    const balance = Number(balanceStr.replace(/[^\d.-]/g, ""));
    if (!Number.isFinite(balance)) {
      toast.error("Monto inválido");
      return;
    }
    if (!asOfDate) {
      toast.error("Selecciona una fecha");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/finance/banking/accounts/${bankAccountId}/balance-history`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            asOfDate,
            balance,
            note: note.trim() || null,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        if (json.error === "note_required") {
          throw new Error(
            `La diferencia (${fmtCLP.format(Number(json.delta ?? 0))}) supera el umbral: agregá una nota`,
          );
        }
        throw new Error(json.error || "Error al fijar saldo");
      }
      toast.success("Saldo registrado");
      setBalanceStr("");
      setNote("");
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSubmitting(false);
    }
  };

  const parsedBalance = Number(balanceStr.replace(/[^\d.-]/g, ""));
  const liveDelta =
    Number.isFinite(parsedBalance) && currentBalance != null
      ? parsedBalance - currentBalance
      : null;
  const noteRequired =
    liveDelta != null &&
    Math.abs(liveDelta) >= thresholdClp &&
    !note.trim();

  const handleDelete = async (snapshotId: string) => {
    if (
      !(await confirmDialog({
        description:
          "¿Eliminar este registro de saldo? El saldo actual se recalculará al snapshot anterior.",
        variant: "destructive",
        confirmLabel: "Eliminar",
      }))
    ) {
      return;
    }
    setDeleting(snapshotId);
    try {
      const res = await fetch(
        `/api/finance/banking/accounts/${bankAccountId}/balance-history/${snapshotId}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Error al eliminar");
      }
      toast.success("Snapshot eliminado");
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Saldo a fecha</SheetTitle>
          <SheetDescription>{bankAccountLabel}</SheetDescription>
        </SheetHeader>

        {canManage && (
          <div className="mt-6 space-y-3 rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-xs font-mono uppercase tracking-[0.08em] text-muted-foreground">
              Fijar saldo
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="bal-date">Fecha</Label>
                <DatePickerField value={asOfDate || null} onChange={(ymd) => setAsOfDate((ymd ?? ""))} id={"bal-date"} triggerClassName={"h-9"} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bal-amount">Saldo (CLP)</Label>
                <Input
                  id="bal-amount"
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  className="h-9 font-mono"
                  value={balanceStr}
                  onChange={(e) => setBalanceStr(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bal-note">
                {noteRequired ? "Nota (obligatoria)" : "Nota (opcional)"}
              </Label>
              <Input
                id="bal-note"
                type="text"
                placeholder="Ej. Cierre conciliación abril, ajuste por error de cartola..."
                className="h-10 sm:h-9"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
              />
            </div>
            {liveDelta != null && liveDelta !== 0 && (
              <p
                className={`text-[12px] tabular-nums ${
                  Math.abs(liveDelta) >= thresholdClp
                    ? "text-status-warn-fg"
                    : "text-ds-text-3"
                }`}
              >
                Diferencia vs calculado: {fmtCLP.format(liveDelta)}
              </p>
            )}
            <Button
              onClick={handleSubmit}
              disabled={submitting || noteRequired}
              size="sm"
              className="h-10 sm:h-9"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-1.5" />
              )}
              Registrar saldo
            </Button>
          </div>
        )}

        <div className="mt-6 space-y-2">
          <p className="text-xs font-mono uppercase tracking-[0.08em] text-muted-foreground">
            Historial
          </p>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              Sin registros de saldo todavía.
            </p>
          ) : (
            <ul className="space-y-2">
              {history.map((s) => {
                const cfg = SOURCE_LABEL[s.source] ?? SOURCE_LABEL.MANUAL;
                const Icon = cfg.icon;
                const balanceNum =
                  typeof s.balance === "string" ? Number(s.balance) : s.balance;
                const computedNum =
                  s.computedBalance == null || s.computedBalance === ""
                    ? null
                    : Number(s.computedBalance);
                const deltaNum =
                  s.deltaClp == null || s.deltaClp === ""
                    ? null
                    : Number(s.deltaClp);
                const warnDelta =
                  deltaNum != null && Math.abs(deltaNum) >= thresholdClp;
                return (
                  <li
                    key={s.id}
                    className="rounded-lg border border-border bg-card p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">
                            {format(new Date(s.asOfDate), "dd MMM yyyy", {
                              locale: es,
                            })}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn("text-[11px] gap-1", cfg.className)}
                          >
                            <Icon className="h-3 w-3" />
                            {cfg.label}
                          </Badge>
                        </div>
                        <p className="font-mono text-sm font-semibold mt-1">
                          {fmtCLP.format(balanceNum)}
                        </p>
                        {computedNum != null && Number.isFinite(computedNum) && (
                          <p className="text-[12px] text-ds-text-3 mt-0.5">
                            Calculado {fmtCLP.format(computedNum)}
                          </p>
                        )}
                        {deltaNum != null && Number.isFinite(deltaNum) && (
                          <div className="mt-1">
                            <Tag variant={warnDelta ? "warn" : "neutral"} size="md">
                              Delta {fmtCLP.format(deltaNum)}
                            </Tag>
                          </div>
                        )}
                        {s.note && (
                          <p className="text-xs text-muted-foreground mt-1.5">
                            {s.note}
                          </p>
                        )}
                        <p className="text-[12px] text-ds-text-3 mt-1">
                          Registrado{" "}
                          {format(new Date(s.createdAt), "dd MMM yyyy HH:mm", {
                            locale: es,
                          })}
                          {s.createdById ? " · usuario" : " · sistema"}
                        </p>
                      </div>
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(s.id)}
                          disabled={deleting === s.id}
                        >
                          {deleting === s.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
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
