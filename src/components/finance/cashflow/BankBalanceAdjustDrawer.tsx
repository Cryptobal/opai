"use client";
import { useState, useEffect, useRef } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Landmark, AlertCircle } from "lucide-react";
import { toast } from "sonner";

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

const fmtNumber = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

/** Devuelve el inset del teclado en iOS via visualViewport. */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;
    const update = () => {
      const diff = window.innerHeight - vv.height - vv.offsetTop;
      setInset(Math.max(0, diff));
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}

export function BankBalanceAdjustDrawer({ open, onClose, onSaved }: Props) {
  const [accounts, setAccounts] = useState<BankAccountOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newBalance, setNewBalance] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const keyboardInset = useKeyboardInset();

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

  function handleBalanceChange(raw: string) {
    const digits = raw.replace(/\D/g, "");
    setNewBalance(digits);
  }

  const displayBalance = newBalance ? fmtNumber.format(Number(newBalance)) : "";

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
      if (!j.success) {
        throw new Error(
          j.error === "note_required"
            ? "La diferencia supera el umbral: agregá una nota"
            : j.error || "Error al guardar",
        );
      }
      const d = j.data as {
        balance: number;
        discrepancy?: { delta: number; evaluable: boolean };
      };
      const delta = d.discrepancy?.delta ?? 0;
      if (d.discrepancy?.evaluable === false) {
        toast.warning("Lectura registrada: definí el saldo inicial en Bancos → Cuadratura.");
      } else if (Math.abs(delta) < 1) {
        toast.success("Cuadra con el banco.");
      } else {
        toast.warning(
          `Diferencia banco − OPAI: ${fmt.format(delta)}. Banco hoy no cambia; revisá Bancos → Cuadratura.`,
        );
      }
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
      <SheetContent
        side="bottom"
        className="p-0 rounded-t-2xl flex flex-col"
        style={{
          maxHeight: `calc(100dvh - 48px)`,
        }}
      >
        <SheetHeader className="px-4 pt-4 pb-2 border-b border-border/50">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Landmark className="h-4 w-4" /> Cuadrar saldo del banco
          </SheetTitle>
        </SheetHeader>

        <div
          className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
          style={{
            paddingBottom: `calc(96px + ${keyboardInset}px)`,
          }}
        >
          {loading && (
            <p className="text-sm text-muted-foreground">Cargando cuentas...</p>
          )}

          {!loading && accounts.length === 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm">
              No hay cuentas bancarias activas en CLP. Crea una en{" "}
              <span className="font-mono">/finanzas/bancos</span> primero.
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
              <div className="flex items-baseline justify-between gap-2 py-2 border-b border-border/40">
                <span className="text-xs text-muted-foreground">
                  Saldo OPAI (saldo inicial + movimientos)
                </span>
                <span className="text-sm font-mono font-semibold tabular-nums">
                  {fmt.format(selected.currentBalance)}
                </span>
              </div>

              <p className="text-[12px] text-ds-text-3">
                Escribí el saldo que muestra el banco. Se compara con OPAI y no
                modifica el saldo: si difieren, falta o sobra un movimiento.
              </p>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  Saldo según banco (CLP)
                </label>
                <Input
                  ref={inputRef}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  enterKeyHint="done"
                  value={displayBalance}
                  onChange={(e) => handleBalanceChange(e.target.value)}
                  placeholder="Ej. 12.500.000"
                  className="h-12 text-lg font-mono tabular-nums"
                  onFocus={() => {
                    setTimeout(() => {
                      inputRef.current?.scrollIntoView({
                        block: "center",
                        behavior: "smooth",
                      });
                    }, 200);
                  }}
                />
                <p className="text-[12px] text-ds-text-3">
                  Solo números enteros, sin decimales.
                </p>
              </div>

              <details className="text-sm">
                <summary className="text-xs text-muted-foreground cursor-pointer py-1">
                  Agregar nota (opcional)
                </summary>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ej. saldo informado por el banco vía app"
                  className="h-10 text-sm mt-1"
                />
              </details>
            </>
          )}

          {error && (
            <div className="flex items-start gap-2 text-sm text-status-warn-fg">
              <AlertCircle className="h-4 w-4 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div
          className="border-t border-border/50 bg-background px-4 pt-3 pb-4 flex gap-2"
          style={{
            paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + 12px)`,
            transform:
              keyboardInset > 0 ? `translateY(-${keyboardInset}px)` : undefined,
            transition: "transform 0.15s ease",
          }}
        >
          <Button variant="ghost" onClick={onClose} className="flex-1 h-11">
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={!selectedId || !newBalance || saving}
            className="flex-1 h-11"
          >
            {saving ? "Guardando..." : "Registrar lectura"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
