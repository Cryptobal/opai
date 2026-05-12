"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Wallet,
  CircleDollarSign,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface OpeningPerAccount {
  bankAccountId: string;
  bankName: string;
  accountNumber: string;
  anchorSnapshotDate: string | null;
  anchorBalanceClp: number;
  txDeltaClp: number;
  txCount: number;
  resolvedBalanceClp: number;
}

interface BalanceHealth {
  asOfDate: string;
  opening: {
    totalClp: number;
    perAccount: OpeningPerAccount[];
  };
  projection: {
    currentDriftClp: number | null;
    projectedAtCurrentBucketClp: number | null;
    realBankAtCurrentBucketClp: number | null;
  };
  unassignedBank: {
    count: number;
    totalClp: number;
    items: Array<{
      id: string;
      transactionDate: string;
      description: string;
      reference: string | null;
      amountClp: number;
      reconciliationStatus: string;
      hasSuggestion: boolean;
    }>;
  };
  unfulfilledProj: {
    count: number;
    totalClp: number;
    items: Array<{
      occurrenceId: string;
      itemName: string;
      installationName: string | null;
      scheduledDate: string;
      amountClp: number;
      kind: "INCOME" | "EXPENSE";
      categoryCode: string;
      categoryName: string;
      isOverdue: boolean;
    }>;
  };
  alerts: string[];
}

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

export function CuadraturaClient({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const [data, setData] = useState<BalanceHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/finance/cashflow/balance-health", {
        cache: "no-store",
      });
      const j = await res.json();
      if (!j?.success) throw new Error(j?.error ?? "Error cargando");
      setData(j.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustForm, setAdjustForm] = useState({
    amountClp: "",
    effectiveDate: new Date().toISOString().slice(0, 10),
    notes: "",
    bankTransactionId: "",
  });
  const [saving, setSaving] = useState(false);

  function openAdjustWithDrift() {
    if (data?.projection.currentDriftClp === null || data === null) return;
    setAdjustForm({
      amountClp: String(data.projection.currentDriftClp ?? 0),
      effectiveDate: new Date().toISOString().slice(0, 10),
      notes: `Ajuste de conciliación: cerrar drift de ${fmtCLP.format(data.projection.currentDriftClp ?? 0)} a ${new Date().toISOString().slice(0, 10)}`,
      bankTransactionId: "",
    });
    setAdjustOpen(true);
  }

  async function submitAdjust() {
    setSaving(true);
    try {
      const amount = parseFloat(adjustForm.amountClp);
      if (!Number.isFinite(amount) || amount === 0) {
        throw new Error("Monto debe ser distinto de 0");
      }
      const res = await fetch("/api/finance/cashflow/ajustes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountClp: amount,
          effectiveDate: adjustForm.effectiveDate,
          notes: adjustForm.notes,
          bankTransactionId: adjustForm.bankTransactionId || null,
        }),
      });
      const j = await res.json();
      if (!j?.success) throw new Error(j?.error ?? "Error al crear ajuste");
      toast.success("Ajuste de conciliación creado");
      setAdjustOpen(false);
      setRefreshing(true);
      router.refresh();
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data) return null;

  const drift = data.projection.currentDriftClp;
  const driftAbs = drift !== null ? Math.abs(drift) : 0;
  const isFlat = drift !== null && driftAbs < 50_000;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {isFlat ? (
                  <CheckCircle2 className="h-5 w-5 text-status-ok-fg" />
                ) : (
                  <AlertTriangle
                    className={cn(
                      "h-5 w-5",
                      driftAbs < 500_000
                        ? "text-status-info-fg"
                        : "text-status-warn-fg",
                    )}
                  />
                )}
                <h2 className="text-base font-semibold">
                  {isFlat
                    ? "Flujo cuadrado con el banco"
                    : "Hay diferencia entre banco y flujo proyectado"}
                </h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Al {format(new Date(data.asOfDate), "dd MMM yyyy", { locale: es })}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setRefreshing(true);
                load();
              }}
              disabled={refreshing}
            >
              {refreshing ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              Actualizar
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-border/40">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <Wallet className="h-3 w-3" /> Saldo banco real
              </div>
              <p className="font-mono text-sm font-semibold">
                {fmtCLP.format(data.opening.totalClp)}
              </p>
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <CircleDollarSign className="h-3 w-3" /> Saldo proyectado
              </div>
              <p className="font-mono text-sm font-semibold">
                {data.projection.projectedAtCurrentBucketClp !== null
                  ? fmtCLP.format(data.projection.projectedAtCurrentBucketClp)
                  : "—"}
              </p>
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                {drift !== null && drift > 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                Drift
              </div>
              <p
                className={cn(
                  "font-mono text-sm font-semibold",
                  isFlat
                    ? "text-status-ok-fg"
                    : driftAbs < 500_000
                      ? "text-status-info-fg"
                      : "text-status-warn-fg",
                )}
              >
                {drift !== null
                  ? `${drift > 0 ? "+" : ""}${fmtCLP.format(drift)}`
                  : "—"}
              </p>
            </div>
          </div>

          {!isFlat && canManage && drift !== null && (
            <div className="flex flex-wrap gap-2 pt-3 border-t border-border/40">
              <Button onClick={openAdjustWithDrift} size="sm">
                Cerrar drift con ajuste único
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setAdjustForm((p) => ({ ...p, amountClp: "" }));
                  setAdjustOpen(true);
                }}
              >
                Crear ajuste personalizado
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {data.alerts.length > 0 && (
        <Card className="border-status-warn-fg/30 bg-status-warn-soft/30">
          <CardContent className="p-3 space-y-1.5">
            {data.alerts.map((a, i) => (
              <div
                key={i}
                className="text-[13px] text-status-warn-fg flex items-start gap-2"
              >
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {a}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3">Desglose por cuenta</h3>
          <div className="space-y-2">
            {data.opening.perAccount.map((acc) => (
              <div
                key={acc.bankAccountId}
                className="flex items-center justify-between gap-3 py-1.5 border-b border-border/30 last:border-0"
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-medium truncate">
                    {acc.bankName}
                  </div>
                  <div className="text-[12px] text-muted-foreground font-mono">
                    {acc.accountNumber}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-sm">
                    {fmtCLP.format(acc.resolvedBalanceClp)}
                  </div>
                  <div className="text-[12px] text-muted-foreground">
                    {acc.anchorSnapshotDate ? (
                      <>
                        Cartola{" "}
                        {format(new Date(acc.anchorSnapshotDate), "dd MMM", {
                          locale: es,
                        })}
                        {acc.txCount > 0 && ` · +${acc.txCount} mov`}
                      </>
                    ) : (
                      <span className="text-status-warn-fg">
                        Sin cartola registrada
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">
              Movimientos del banco sin asignar
            </h3>
            <Badge variant="outline" className="text-xs">
              {data.unassignedBank.count} mov · {fmtCLP.format(data.unassignedBank.totalClp)}
            </Badge>
          </div>
          {data.unassignedBank.items.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              No hay movimientos sin asignar en los últimos 30 días.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-96 overflow-y-auto">
              {data.unassignedBank.items.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-3 py-1.5 border-b border-border/30 last:border-0 text-[13px]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{t.description}</div>
                    <div className="text-[12px] text-muted-foreground">
                      {format(new Date(t.transactionDate), "dd MMM yyyy", { locale: es })}
                      {t.reference && ` · ${t.reference}`}
                      {t.hasSuggestion && " · Tiene sugerencia"}
                    </div>
                  </div>
                  <div
                    className={cn(
                      "font-mono text-sm shrink-0",
                      t.amountClp >= 0 ? "text-status-ok-fg" : "text-status-warn-fg",
                    )}
                  >
                    {t.amountClp >= 0 ? "+" : ""}
                    {fmtCLP.format(t.amountClp)}
                  </div>
                </div>
              ))}
            </div>
          )}
          {data.unassignedBank.items.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border/40">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/finanzas/banca/movimientos?tab=unrecognized")}
              >
                Ir a procesar movimientos
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">
              Proyecciones no cumplidas (atrasadas + próximos 7 días)
            </h3>
            <Badge variant="outline" className="text-xs">
              {data.unfulfilledProj.count} cuotas · {fmtCLP.format(data.unfulfilledProj.totalClp)}
            </Badge>
          </div>
          {data.unfulfilledProj.items.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              No hay cuotas proyectadas atrasadas o próximas sin cumplir.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-96 overflow-y-auto">
              {data.unfulfilledProj.items.map((u) => (
                <div
                  key={u.occurrenceId}
                  className="flex items-center justify-between gap-3 py-1.5 border-b border-border/30 last:border-0 text-[13px]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">
                      {u.itemName}
                      {u.installationName && (
                        <span className="text-muted-foreground font-normal">
                          {" · "}{u.installationName}
                        </span>
                      )}
                    </div>
                    <div className="text-[12px] text-muted-foreground">
                      {u.categoryName} ·{" "}
                      <span
                        className={
                          u.isOverdue
                            ? "text-status-warn-fg font-medium"
                            : ""
                        }
                      >
                        {u.isOverdue ? "Atrasada " : ""}
                        {format(new Date(u.scheduledDate), "dd MMM", { locale: es })}
                      </span>
                    </div>
                  </div>
                  <div
                    className={cn(
                      "font-mono text-sm shrink-0",
                      u.kind === "INCOME"
                        ? "text-status-ok-fg"
                        : "text-status-warn-fg",
                    )}
                  >
                    {u.kind === "INCOME" ? "+" : "−"}
                    {fmtCLP.format(u.amountClp)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Crear ajuste de conciliación</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="adj-amount">Monto (CLP) *</Label>
              <Input
                id="adj-amount"
                type="number"
                step="1"
                placeholder="0"
                value={adjustForm.amountClp}
                onChange={(e) =>
                  setAdjustForm((p) => ({ ...p, amountClp: e.target.value }))
                }
              />
              <p className="text-[12px] text-muted-foreground">
                Positivo = ingreso al banco (sube el saldo proyectado). Negativo
                = egreso (baja el saldo proyectado).
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adj-date">Fecha efectiva *</Label>
              <Input
                id="adj-date"
                type="date"
                value={adjustForm.effectiveDate}
                onChange={(e) =>
                  setAdjustForm((p) => ({
                    ...p,
                    effectiveDate: e.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adj-notes">Notas (auditoría) *</Label>
              <Textarea
                id="adj-notes"
                rows={3}
                value={adjustForm.notes}
                onChange={(e) =>
                  setAdjustForm((p) => ({ ...p, notes: e.target.value }))
                }
                placeholder="Por qué se está creando este ajuste..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAdjustOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button onClick={submitAdjust} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Crear ajuste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
