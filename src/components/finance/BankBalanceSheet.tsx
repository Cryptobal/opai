"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
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

interface BalanceSnapshot {
  id: string;
  asOfDate: string;
  balance: string | number;
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
    label: "Calculado",
    className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
    icon: History,
  },
};

export function BankBalanceSheet({
  open,
  onOpenChange,
  bankAccountId,
  bankAccountLabel,
  canManage,
  onChanged,
}: BankBalanceSheetProps) {
  const [history, setHistory] = useState<BalanceSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
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

  const handleDelete = async (snapshotId: string) => {
    if (!confirm("¿Eliminar este registro de saldo? El saldo actual se recalculará al snapshot anterior.")) {
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
                <Input
                  id="bal-date"
                  type="date"
                  className="h-9"
                  value={asOfDate}
                  onChange={(e) => setAsOfDate(e.target.value)}
                />
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
              <Label htmlFor="bal-note">Nota (opcional)</Label>
              <Input
                id="bal-note"
                type="text"
                placeholder="Ej. Cierre conciliación abril, ajuste por error de cartola..."
                className="h-9"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
              />
            </div>
            <Button onClick={handleSubmit} disabled={submitting} size="sm">
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
                        {s.note && (
                          <p className="text-xs text-muted-foreground mt-1.5">
                            {s.note}
                          </p>
                        )}
                        <p className="text-[11px] text-muted-foreground/70 mt-1">
                          Registrado{" "}
                          {format(new Date(s.createdAt), "dd MMM yyyy HH:mm", {
                            locale: es,
                          })}
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
