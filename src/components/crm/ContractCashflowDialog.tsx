"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Trash2, AlertCircle, Wallet } from "lucide-react";
import { toast } from "sonner";

const fmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

function parseAmount(raw: string): number {
  if (!raw) return NaN;
  return Number(raw.replace(/\./g, "").replace(",", "."));
}

interface Installation {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Cuando hay cambios, el padre debe refrescar la lista para mostrar el nuevo badge. */
  onChanged: () => void;
  accountId: string;
  contractId: string;
  contractTitle: string;
  defaultEffectiveDate: string | null;
  defaultExpirationDate: string | null;
  installations: Installation[];
}

export function ContractCashflowDialog({
  open,
  onClose,
  onChanged,
  accountId,
  contractId,
  contractTitle,
  defaultEffectiveDate,
  defaultExpirationDate,
  installations,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [hadLink, setHadLink] = useState(false);
  const [installationId, setInstallationId] = useState<string>("");
  const [monthlyAmount, setMonthlyAmount] = useState<string>("");
  const [currency, setCurrency] = useState<"CLP" | "UF">("CLP");
  const [paymentDay, setPaymentDay] = useState<string>("5");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [hasEndDate, setHasEndDate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resetear y cargar estado del backend al abrir.
  const loadState = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/crm/accounts/${accountId}/contracts/${contractId}/cashflow`,
      );
      const j = await r.json();
      if (!j?.success) {
        setError(j?.error ?? "No se pudo cargar la configuración");
        return;
      }
      const cashflow = j.data.cashflowItem;
      if (cashflow && cashflow.isActive) {
        setEnabled(true);
        setHadLink(true);
        setInstallationId(cashflow.installationId ?? "");
        setMonthlyAmount(fmt.format(cashflow.amountClp));
        setCurrency(cashflow.currency === "UF" ? "UF" : "CLP");
        setPaymentDay(String(cashflow.dayOfMonth ?? 5));
        setStartDate(
          cashflow.startDate
            ? new Date(cashflow.startDate).toISOString().slice(0, 10)
            : defaultEffectiveDate ?? "",
        );
        if (cashflow.endDate) {
          setHasEndDate(true);
          setEndDate(new Date(cashflow.endDate).toISOString().slice(0, 10));
        } else {
          setHasEndDate(false);
          setEndDate("");
        }
      } else {
        // Defaults para link nuevo: heredamos las fechas del contrato.
        setEnabled(false);
        setHadLink(false);
        setInstallationId("");
        setMonthlyAmount("");
        setCurrency("CLP");
        setPaymentDay("5");
        setStartDate(defaultEffectiveDate ?? "");
        if (defaultExpirationDate) {
          setHasEndDate(true);
          setEndDate(defaultExpirationDate.slice(0, 10));
        } else {
          setHasEndDate(false);
          setEndDate("");
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, [accountId, contractId, defaultEffectiveDate, defaultExpirationDate]);

  useEffect(() => {
    if (open) loadState();
  }, [open, loadState]);

  async function handleSave() {
    setError(null);
    if (!enabled) {
      // Si está deshabilitado y existía un link, lo desvinculamos.
      if (hadLink) {
        await handleRemove();
      } else {
        onClose();
      }
      return;
    }
    const amt = parseAmount(monthlyAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Indica el monto mensual del contrato");
      return;
    }
    const pd = Number(paymentDay);
    if (!Number.isFinite(pd) || pd === 0 || pd < -1 || pd > 31) {
      setError("Día de pago debe ser 1–31 o -1 (último)");
      return;
    }
    if (!startDate) {
      setError("Indica la fecha de inicio");
      return;
    }
    if (hasEndDate && endDate && endDate < startDate) {
      setError("La fecha de fin no puede ser anterior al inicio");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(
        `/api/crm/accounts/${accountId}/contracts/${contractId}/cashflow`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            installationId: installationId || null,
            monthlyAmountClp: amt,
            currency,
            paymentDay: pd,
            startDate,
            endDate: hasEndDate && endDate ? endDate : null,
          }),
        },
      );
      const j = await r.json();
      if (j?.success) {
        toast.success(
          j.data.action === "created"
            ? "Contrato agregado al flujo de caja"
            : "Configuración actualizada",
        );
        onChanged();
        onClose();
      } else {
        setError(j?.error ?? "No se pudo guardar");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!confirm("¿Desvincular este contrato del flujo de caja? Las cuotas pagadas (conciliadas con banco) se conservan.")) return;
    setRemoving(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/crm/accounts/${accountId}/contracts/${contractId}/cashflow`,
        { method: "DELETE" },
      );
      const j = await r.json();
      if (j?.success) {
        toast.success("Desvinculado del flujo de caja");
        onChanged();
        onClose();
      } else {
        setError(j?.error ?? "No se pudo desvincular");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-status-ok-fg" />
            Flujo de caja del contrato
          </DialogTitle>
          <DialogDescription className="break-words">
            {contractTitle}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-ds-text-3">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <label className="flex items-start gap-2 cursor-pointer rounded-md border border-border p-3">
              <Checkbox
                checked={enabled}
                onCheckedChange={(v) => setEnabled(v === true)}
                className="mt-1"
              />
              <div className="space-y-0.5">
                <span className="text-sm font-medium">
                  {hadLink ? "Mantener en flujo de caja" : "Agregar al flujo de caja"}
                </span>
                <p className="text-xs text-muted-foreground">
                  Crea un ingreso mensual recurrente vinculado a este contrato
                  específico. Cada PDF tiene su propio monto, instalación y
                  vigencia.
                </p>
              </div>
            </label>

            {enabled && (
              <>
                <div className="space-y-2">
                  <Label>
                    Instalación{" "}
                    <span className="text-[10px] text-muted-foreground font-normal">
                      (opcional)
                    </span>
                  </Label>
                  <Select
                    value={installationId || "none"}
                    onValueChange={(v) =>
                      setInstallationId(v === "none" ? "" : v)
                    }
                  >
                    <SelectTrigger className="h-10 sm:h-9">
                      <SelectValue placeholder="Sin instalación específica" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin instalación específica</SelectItem>
                      {installations.map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-[1fr_auto] gap-3">
                  <div className="space-y-2">
                    <Label>
                      Monto mensual ({currency})
                    </Label>
                    <Input
                      inputMode="decimal"
                      value={monthlyAmount}
                      onChange={(e) => {
                        const raw = e.target.value
                          .replace(/[^\d,.-]/g, "")
                          .replace(/\./g, "")
                          .replace(",", ".");
                        const n = Number(raw);
                        if (Number.isFinite(n)) {
                          setMonthlyAmount(fmt.format(n));
                        } else {
                          setMonthlyAmount(e.target.value);
                        }
                      }}
                      placeholder={currency === "UF" ? "120" : "1.500.000"}
                      className="font-mono text-right h-10 sm:h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Moneda</Label>
                    <Select
                      value={currency}
                      onValueChange={(v) => setCurrency(v === "UF" ? "UF" : "CLP")}
                    >
                      <SelectTrigger className="h-10 sm:h-9 w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CLP">CLP</SelectItem>
                        <SelectItem value="UF">UF</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Día de pago</Label>
                  <Input
                    type="number"
                    min={-1}
                    max={31}
                    value={paymentDay}
                    onChange={(e) => setPaymentDay(e.target.value)}
                    className="h-10 sm:h-9"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    <code className="font-mono">-1</code> = último día.
                    {currency === "UF" && (
                      <>
                        {" "}Monto en UF, convertido a CLP con la UF del día de pago.
                      </>
                    )}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Inicio</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-10 sm:h-9"
                  />
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={hasEndDate}
                      onCheckedChange={(v) => setHasEndDate(v === true)}
                    />
                    <span className="text-sm">Tiene fecha de fin</span>
                  </label>
                  {hasEndDate && (
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="h-10 sm:h-9"
                    />
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    Sin fecha = recurrente perpetuo. Las cuotas dejan de
                    proyectarse después de la fecha de fin.
                  </p>
                </div>
              </>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-md bg-status-warn-soft px-3 py-2 text-xs text-status-warn-fg">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                {error}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-2">
          {hadLink && enabled && (
            <Button
              variant="outline"
              onClick={handleRemove}
              disabled={saving || removing}
              className="w-full sm:w-auto text-status-warn-fg hover:bg-status-warn-soft"
            >
              {removing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Desvincular
                </>
              )}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={onClose}
            disabled={saving || removing}
            className="w-full sm:w-auto"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || removing || loading}
            className="w-full sm:w-auto"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
