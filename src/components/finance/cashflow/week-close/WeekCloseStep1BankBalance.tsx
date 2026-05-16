"use client";
import { useState } from "react";
import { Landmark, Pencil, Check, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { WeeklyCloseSnapshotDTO } from "./types";
import { fmtCLP } from "./types";

interface Props {
  snap: WeeklyCloseSnapshotDTO;
  onRefresh: () => void;
}

/**
 * Paso 1 del cierre semanal: confirmar saldo banco real al cierre.
 * Muestra tres bloques compactos (banco real / proyectado / diferencia) y
 * un edit inline que reusa el endpoint /bank-balance/adjust.
 *
 * Nota: el endpoint pide bankAccountId. Si hay múltiples cuentas, esta vista
 * delega a BankBalanceAdjustDrawer (paso 1 detallado). Para mantener este
 * componente <150 líneas, el edit inline asume cuenta única — caso común
 * en tenants Gard. Para multi-cuenta, abrir el drawer clásico desde aquí.
 */
export function WeekCloseStep1BankBalance({ snap, onRefresh }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<string>(
    String(Math.round(snap.bankBalanceClp)),
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const accountsRes = await fetch("/api/finance/cashflow/bank-balance/pull");
      const accountsJ = await accountsRes.json();
      if (!accountsJ.success) throw new Error(accountsJ.error);
      const accounts = accountsJ.data as Array<{ bankAccountId: string }>;
      if (accounts.length === 0) throw new Error("No hay cuentas CLP activas");
      if (accounts.length > 1) {
        throw new Error(
          "Hay varias cuentas CLP — usa Ajustar saldo del banco para distribuir el total",
        );
      }
      const res = await fetch("/api/finance/cashflow/bank-balance/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankAccountId: accounts[0].bankAccountId,
          balance: Number(value),
          note: "Cierre semanal — confirmación de saldo",
        }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error);
      toast.success("Saldo banco actualizado");
      setEditing(false);
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  const variance = snap.varianceClp;
  const varianceTone =
    Math.abs(variance) < 50_000
      ? "text-ds-text-3"
      : variance > 0
        ? "text-status-ok-fg"
        : "text-status-warn-fg";

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Landmark className="h-4 w-4 text-ds-text-3" />
        1. Confirmar saldo banco al cierre
      </h3>
      <div className="rounded-md border border-border/60 divide-y divide-border/60">
        <div className="flex items-center justify-between px-3 py-2.5">
          <span className="text-xs text-muted-foreground">Saldo banco real</span>
          {editing ? (
            <div className="flex items-center gap-1.5">
              <Input
                value={value}
                inputMode="numeric"
                onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
                className="h-8 w-32 text-sm font-mono text-right"
                disabled={saving}
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={handleSave}
                disabled={saving}
                className="h-8 w-8 p-0"
                aria-label="Confirmar"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 text-status-ok-fg" />
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setValue(String(Math.round(snap.bankBalanceClp)));
                }}
                disabled={saving}
                className="h-8 w-8 p-0"
                aria-label="Cancelar"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 text-sm font-mono font-semibold tabular-nums hover:underline underline-offset-2 decoration-dotted"
            >
              {fmtCLP.format(snap.bankBalanceClp)}
              <Pencil className="h-3 w-3 opacity-60" />
            </button>
          )}
        </div>
        <div className="flex items-center justify-between px-3 py-2.5">
          <span className="text-xs text-muted-foreground">Saldo proyectado</span>
          <span className="text-sm font-mono tabular-nums text-ds-text-2">
            {fmtCLP.format(snap.projectedBalanceClp)}
          </span>
        </div>
        <div className="flex items-center justify-between px-3 py-2.5 bg-muted/30">
          <span className="text-xs text-muted-foreground">Diferencia</span>
          <span className={`text-sm font-mono font-semibold tabular-nums ${varianceTone}`}>
            {variance > 0 ? "+" : ""}
            {fmtCLP.format(variance)}
          </span>
        </div>
      </div>
    </section>
  );
}
