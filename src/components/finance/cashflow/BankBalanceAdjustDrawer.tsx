"use client";
import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Landmark, RefreshCw, AlertCircle } from "lucide-react";

interface BankAccountOption {
  bankAccountId: string;
  bankName: string;
  accountNumber: string;
  currentBalance: number;
  balanceUpdatedAt: string | null;
  lastSync: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const fmt = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

export function BankBalanceAdjustDrawer({ open, onClose, onSaved }: Props) {
  const [accounts, setAccounts] = useState<BankAccountOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newBalance, setNewBalance] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setNewBalance("");
    setNote("");
    setLoading(true);
    fetch("/api/finance/cashflow/bank-balance/pull")
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) {
          setAccounts(j.data);
          if (j.data.length > 0) setSelectedId(j.data[0].bankAccountId);
        } else {
          setError(j?.error || "No se pudieron cargar las cuentas");
        }
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [open]);

  const selected = accounts.find((a) => a.bankAccountId === selectedId);

  function applyBankBalance() {
    if (!selected) return;
    setNewBalance(String(Math.round(selected.currentBalance)));
  }

  async function handleSave() {
    if (!selectedId || !newBalance) return;
    const value = Number(newBalance);
    if (!isFinite(value)) {
      setError("El saldo debe ser un número válido");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/finance/cashflow/bank-balance/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankAccountId: selectedId,
          balance: value,
          note: note || undefined,
        }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || "Error al guardar");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[80vh] rounded-t-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5" /> Ajustar saldo del banco
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {loading && <p className="text-sm text-muted-foreground">Cargando cuentas...</p>}

          {!loading && accounts.length === 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm">
              No hay cuentas bancarias activas en CLP. Crea una en /finanzas/bancos primero.
            </div>
          )}

          {accounts.length > 1 && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Cuenta</label>
              <select
                value={selectedId ?? ""}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-border bg-background text-sm"
              >
                {accounts.map((a) => (
                  <option key={a.bankAccountId} value={a.bankAccountId}>
                    {a.bankName} · {a.accountNumber}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selected && (
            <>
              <div className="rounded-md bg-muted/40 p-3 space-y-1">
                <p className="text-xs text-muted-foreground">Saldo actual conocido por el sistema</p>
                <p className="text-lg font-mono font-semibold">{fmt.format(selected.currentBalance)}</p>
                {selected.balanceUpdatedAt && (
                  <p className="text-[10px] text-muted-foreground">
                    Actualizado {new Date(selected.balanceUpdatedAt).toLocaleString("es-CL")}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Nuevo saldo (CLP)</label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={newBalance}
                    onChange={(e) => setNewBalance(e.target.value)}
                    placeholder="Ej. 12500000"
                    className="h-11 text-base font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={applyBankBalance}
                    className="h-11 shrink-0"
                  >
                    <RefreshCw className="h-4 w-4 mr-1" /> Traer
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  &quot;Traer&quot; toma el saldo que el sistema ya conoce (del banco/cartola) y lo deja editable.
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Nota (opcional)</label>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ej. saldo informado por el banco vía app"
                  className="h-10 text-sm"
                />
              </div>
            </>
          )}

          {error && (
            <div className="flex items-start gap-2 text-sm text-status-warn-fg">
              <AlertCircle className="h-4 w-4 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="ghost" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={!selectedId || !newBalance || saving}
              className="flex-1"
            >
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
