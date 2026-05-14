"use client";
import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  Loader2,
  Calendar as CalendarIcon,
  AlertCircle,
  CheckCircle2,
  X,
  CircleSlash,
  Trash2,
  Send,
  ExternalLink,
  Banknote,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { CashflowCellStatus, CellDteSummary } from "@/modules/finance/cashflow/types";
import { CobranzaSendDialog } from "./CobranzaSendDialog";

const fmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

function formatDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  return format(dt, "d MMM yyyy", { locale: es });
}

interface ConflictInfo {
  existingOccurrenceId: string;
  targetDate: string;
  suggestedFreeDate: string;
  originalArgs: { newDate?: string; daysFromCurrent?: number };
}

interface CellOccurrenceTarget {
  id: string | null;
  itemId: string;
  originalDate: string;
  amountClp: number;
  /** Estado de la celda respecto al DTE vinculado (PR3). */
  cellStatus?: CashflowCellStatus;
  /** DTE vinculado a esta celda (presente cuando hay vínculo). */
  dteId?: string | null;
  /** Folio del DTE vinculado — usado en el botón "Igualar a factura #X". */
  dteFolio?: number | null;
  /** Monto bruto (totalAmount) del DTE en CLP — fuente del botón
   *  "Igualar a factura". Usamos el bruto, no el neto recibido en banco,
   *  porque el costo de factoring vive en su propia categoría. */
  dteGrossAmount?: number | null;
  /** Lista de TODOS los DTEs conciliados con esta celda. Cuando hay >1, el
   *  popover los muestra individualmente (folio, fecha emisión, monto, link)
   *  y el botón "Igualar" suma los totales en vez de matchear con uno solo. */
  dtes?: CellDteSummary[];
  /** Días de mora (positivo si vencido, 0 si al día). */
  daysOverdue?: number;
  /** Cliente CRM dueño del ítem — necesario para traer contactos en cobranza. */
  crmAccountId?: string | null;
}

interface Props {
  children: React.ReactNode;
  target: CellOccurrenceTarget | null;
  granularity: "weekly" | "monthly";
  onActionDone: () => void;
}

const SHIFT_OPTIONS: { label: string; days: number }[] = [
  { label: "1 día", days: 1 },
  { label: "1 sem", days: 7 },
  { label: "2 sem", days: 14 },
  { label: "1 mes", days: 30 },
];

export function CellActionPopover({
  children,
  target,
  granularity,
  onActionDone,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<
    null | "shift" | "amount" | "date" | "resolve" | "end" | "cancel"
  >(null);
  const [editing, setEditing] = useState(false);
  const [pickingDate, setPickingDate] = useState(false);
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cobranzaOpen, setCobranzaOpen] = useState(false);
  const [draftAmount, setDraftAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);

  const canSendCobranza =
    !!target?.dteId && target?.cellStatus === "INVOICED";

  if (!target) {
    return <>{children}</>;
  }

  function resetState() {
    setEditing(false);
    setPickingDate(false);
    setConfirmingEnd(false);
    setConfirmingCancel(false);
    setError(null);
    setSuccess(null);
    setDraftAmount("");
    setConflict(null);
  }

  async function cancelOccurrence() {
    if (!target) return;
    setBusy("cancel");
    setError(null);
    setSuccess(null);
    try {
      // Si la ocurrencia aún no está materializada (id === null) usamos
      // upsert-and-act que la crea y la marca CANCELLED de una vez. Si ya
      // existe, vamos directo al endpoint de status.
      let r: Response;
      if (target.id === null) {
        r = await fetch(`/api/finance/cashflow/occurrences/upsert-and-act`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "cancel",
            itemId: target.itemId,
            originalDate: target.originalDate,
          }),
        });
      } else {
        r = await fetch(
          `/api/finance/cashflow/occurrences/${target.id}/status`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "CANCELLED" }),
          },
        );
      }
      const j = await r.json();
      if (j?.success) {
        flashSuccessAndClose(
          `Monto eliminado de ${formatDateLabel(target.originalDate)}`,
        );
      } else {
        setError(j?.error ?? "No se pudo eliminar el monto");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setBusy(null);
    }
  }

  async function endRecurrenceFromHere() {
    if (!target) return;
    setBusy("end");
    setError(null);
    setSuccess(null);
    try {
      // endDate = día anterior al originalDate → la cuota actual y las
      // posteriores dejan de proyectarse. Si el usuario quiere mantener la
      // actual, debería usar "Editar monto"; este botón es el corte limpio.
      const [y, m, d] = target.originalDate.split("-").map(Number);
      const dt = new Date(y, (m ?? 1) - 1, d);
      dt.setDate(dt.getDate() - 1);
      const newEnd = format(dt, "yyyy-MM-dd");
      const r = await fetch(`/api/finance/cashflow/items/${target.itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endDate: newEnd }),
      });
      const j = await r.json();
      if (j?.success) {
        flashSuccessAndClose(`Terminado desde ${formatDateLabel(target.originalDate)}`);
      } else {
        setError(j?.error ?? "No se pudo terminar la recurrencia");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setBusy(null);
    }
  }

  function flashSuccessAndClose(msg: string) {
    setSuccess(msg);
    onActionDone();
    setTimeout(() => {
      setOpen(false);
      resetState();
    }, 900);
  }

  async function callMoveEndpoint(args: {
    newDate?: string;
    daysFromCurrent?: number;
    resolveStrategy?: "replace" | "next_free";
  }) {
    if (!target) return null;
    const useUpsert = target.id === null;
    const url = useUpsert
      ? `/api/finance/cashflow/occurrences/upsert-and-act`
      : `/api/finance/cashflow/occurrences/${target.id}/move`;
    const body = useUpsert
      ? { action: "move", itemId: target.itemId, originalDate: target.originalDate, ...args }
      : args;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return r.json();
  }

  async function shiftDays(days: number) {
    if (!target) return;
    setBusy("shift");
    setError(null);
    setSuccess(null);
    try {
      const args = { daysFromCurrent: days };
      const j = await callMoveEndpoint(args);
      if (j?.success) {
        flashSuccessAndClose(`Movido ${days > 0 ? "+" : ""}${days} día${Math.abs(days) === 1 ? "" : "s"}`);
      } else if (j?.conflict) {
        setConflict({ ...j.conflict, originalArgs: args });
      } else {
        setError(j?.error ?? "No se pudo mover");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setBusy(null);
    }
  }

  async function moveToDate(date: Date) {
    if (!target) return;
    setBusy("date");
    setError(null);
    setSuccess(null);
    try {
      const args = { newDate: format(date, "yyyy-MM-dd") };
      const j = await callMoveEndpoint(args);
      if (j?.success) {
        flashSuccessAndClose(`Movido a ${format(date, "d MMM", { locale: es })}`);
      } else if (j?.conflict) {
        setConflict({ ...j.conflict, originalArgs: args });
        setPickingDate(false);
      } else {
        setError(j?.error ?? "No se pudo mover");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setBusy(null);
    }
  }

  async function resolveConflict(strategy: "replace" | "next_free") {
    if (!target || !conflict) return;
    setBusy("resolve");
    setError(null);
    try {
      const j = await callMoveEndpoint({ ...conflict.originalArgs, resolveStrategy: strategy });
      if (j?.success) {
        flashSuccessAndClose(
          strategy === "replace" ? "Cuota reemplazada" : "Movida a fecha libre",
        );
        setConflict(null);
      } else {
        setError(j?.error ?? "No se pudo resolver la colisión");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setBusy(null);
    }
  }

  function cancelConflict() {
    setConflict(null);
    setError(null);
  }

  async function saveAmount() {
    if (!target) return;
    const cleaned = draftAmount.replace(/\./g, "").replace(",", ".");
    const n = Number(cleaned);
    if (!Number.isFinite(n) || n <= 0) {
      setError("Monto inválido");
      return;
    }
    await persistAmount(n);
  }

  async function persistAmount(n: number) {
    if (!target) return;
    setBusy("amount");
    setError(null);
    setSuccess(null);
    try {
      const useUpsert = target.id === null;
      const url = useUpsert
        ? `/api/finance/cashflow/occurrences/upsert-and-act`
        : `/api/finance/cashflow/occurrences/${target.id}/amount`;
      const body = useUpsert
        ? {
            action: "amount",
            itemId: target.itemId,
            originalDate: target.originalDate,
            amountClp: n,
          }
        : { amountClp: n };
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (j?.success) {
        flashSuccessAndClose(`Monto actualizado a $${fmt.format(n)}`);
      } else {
        setError(j?.error ?? "No se pudo guardar");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setBusy(null);
    }
  }

  void granularity;

  return (
    <>
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) resetState();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="block w-full text-right hover:bg-muted/40 rounded-ds-sm px-1 py-0.5 cursor-pointer min-h-[32px] sm:min-h-0"
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="center"
        sideOffset={6}
        collisionPadding={12}
        // Mobile-first: el popover ocupa casi todo el ancho del viewport con
        // un padding de seguridad. En desktop se limita a 360px. Border y
        // shadow fuertes garantizan contraste sobre el dashboard oscuro.
        className="w-[calc(100vw-1rem)] max-w-[360px] sm:w-[360px] p-0 bg-popover border-2 border-border shadow-2xl rounded-ds-lg overflow-hidden"
      >
        {/* Header con monto/fecha actuales y botón cerrar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
          <div className="min-w-0">
            <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-3">
              Cuota
            </p>
            <p className="text-[14px] font-semibold text-ds-text-1 tabular-nums">
              ${fmt.format(target.amountClp)}
            </p>
            <p className="text-[11px] text-ds-text-3 truncate">
              {formatDateLabel(target.originalDate)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="p-2 -mr-1 rounded-ds-sm hover:bg-muted/60 text-ds-text-3"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-3">
          {/* SUCCESS banner — visible 0.9s antes de cerrar */}
          {success && (
            <div className="mb-2 flex items-center gap-2 px-3 py-2 rounded-ds-md bg-status-ok-soft border border-status-ok-fg/20">
              <CheckCircle2 className="h-4 w-4 text-status-ok-fg shrink-0" />
              <p className="text-[13px] text-status-ok-fg font-medium">{success}</p>
            </div>
          )}

          {/* ERROR banner — destacado, no cierra el popover */}
          {error && !conflict && (
            <div className="mb-2 flex items-start gap-2 px-3 py-2 rounded-ds-md bg-status-warn-soft border border-status-warn-fg/20">
              <AlertCircle className="h-4 w-4 text-status-warn-fg shrink-0 mt-0.5" />
              <p className="text-[13px] text-status-warn-fg">{error}</p>
            </div>
          )}

          {conflict ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2 px-1">
                <AlertCircle className="h-5 w-5 text-status-warn-fg shrink-0 mt-0.5" />
                <div>
                  <p className="text-[13px] font-semibold text-ds-text-1">
                    Hay otra cuota en {formatDateLabel(conflict.targetDate)}
                  </p>
                  <p className="text-[12px] text-ds-text-3 mt-0.5">
                    ¿Cómo querés resolver el conflicto?
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Button
                  variant="outline"
                  onClick={() => resolveConflict("replace")}
                  disabled={busy !== null}
                  className="w-full h-11 sm:h-10 text-[13px] justify-start"
                >
                  Reemplazar la otra cuota
                </Button>
                <Button
                  variant="outline"
                  onClick={() => resolveConflict("next_free")}
                  disabled={busy !== null}
                  className="w-full h-11 sm:h-10 text-[13px] justify-start"
                >
                  Mover a {formatDateLabel(conflict.suggestedFreeDate)}
                </Button>
                <Button
                  variant="ghost"
                  onClick={cancelConflict}
                  disabled={busy !== null}
                  className="w-full h-11 sm:h-10 text-[13px]"
                >
                  Cancelar
                </Button>
              </div>
              {busy === "resolve" && (
                <div className="flex items-center justify-center gap-2 text-[13px] text-ds-text-3">
                  <Loader2 className="h-4 w-4 animate-spin" /> Aplicando…
                </div>
              )}
              {error && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-ds-md bg-status-warn-soft border border-status-warn-fg/20">
                  <AlertCircle className="h-4 w-4 text-status-warn-fg shrink-0 mt-0.5" />
                  <p className="text-[13px] text-status-warn-fg">{error}</p>
                </div>
              )}
            </div>
          ) : pickingDate ? (
            <div className="space-y-2">
              <p className="text-[12px] font-mono uppercase tracking-[0.08em] text-ds-text-3 px-1">
                Elegí una fecha
              </p>
              <div className="flex justify-center">
                <Calendar
                  mode="single"
                  locale={es}
                  onSelect={(d) => {
                    if (d) moveToDate(d);
                  }}
                  disabled={busy !== null}
                />
              </div>
              <Button
                variant="outline"
                onClick={() => setPickingDate(false)}
                disabled={busy !== null}
                className="w-full h-11 sm:h-10 text-[13px]"
              >
                Cancelar
              </Button>
              {busy === "date" && (
                <div className="flex items-center justify-center gap-2 text-[13px] text-ds-text-3">
                  <Loader2 className="h-4 w-4 animate-spin" /> Moviendo…
                </div>
              )}
            </div>
          ) : confirmingCancel ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2 px-1">
                <Trash2 className="h-5 w-5 text-status-error-fg shrink-0 mt-0.5" />
                <div>
                  <p className="text-[13px] font-semibold text-ds-text-1">
                    Eliminar solo este monto
                  </p>
                  <p className="text-[12px] text-ds-text-3 mt-0.5">
                    La cuota de {formatDateLabel(target.originalDate)} dejará
                    de proyectarse. Las próximas cuotas del ítem se mantienen
                    intactas. Podés revertirlo desde &quot;Movimientos
                    proyectados&quot;.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setConfirmingCancel(false)}
                  disabled={busy !== null}
                  className="flex-1 h-11 sm:h-10 text-[13px]"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={cancelOccurrence}
                  disabled={busy !== null}
                  className="flex-1 h-11 sm:h-10 text-[13px] bg-status-error-fg text-background hover:bg-status-error-fg/90"
                >
                  {busy === "cancel" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Eliminar"
                  )}
                </Button>
              </div>
            </div>
          ) : confirmingEnd ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2 px-1">
                <CircleSlash className="h-5 w-5 text-status-warn-fg shrink-0 mt-0.5" />
                <div>
                  <p className="text-[13px] font-semibold text-ds-text-1">
                    Terminar este ítem
                  </p>
                  <p className="text-[12px] text-ds-text-3 mt-0.5">
                    A partir de {formatDateLabel(target.originalDate)} no se
                    proyectarán más cuotas. Las ocurrencias ya pagadas quedan
                    intactas. Podés revertirlo editando el ítem en
                    &quot;Movimientos proyectados&quot;.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setConfirmingEnd(false)}
                  disabled={busy !== null}
                  className="flex-1 h-11 sm:h-10 text-[13px]"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={endRecurrenceFromHere}
                  disabled={busy !== null}
                  className="flex-1 h-11 sm:h-10 text-[13px] bg-status-warn-fg text-background hover:bg-status-warn-fg/90"
                >
                  {busy === "end" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Terminar"
                  )}
                </Button>
              </div>
            </div>
          ) : editing ? (
            <div className="space-y-2">
              <label className="text-[12px] font-mono uppercase tracking-[0.08em] text-ds-text-3 px-1 block">
                Nuevo monto (CLP)
              </label>
              <Input
                autoFocus
                inputMode="decimal"
                value={draftAmount}
                onChange={(e) => {
                  const cleaned = e.target.value
                    .replace(/[^\d,.-]/g, "")
                    .replace(/\./g, "")
                    .replace(",", ".");
                  const n = Number(cleaned);
                  setDraftAmount(
                    Number.isFinite(n) ? fmt.format(n) : e.target.value,
                  );
                }}
                className="h-12 sm:h-11 font-mono text-right text-[16px] font-semibold"
              />
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  onClick={() => setEditing(false)}
                  disabled={busy !== null}
                  className="flex-1 h-11 sm:h-10 text-[13px]"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={saveAmount}
                  disabled={busy !== null}
                  className="flex-1 h-11 sm:h-10 text-[13px]"
                >
                  {busy === "amount" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Guardar"
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Sección "Facturas conciliadas": lista las facturas que el
                  matcher vinculó a esta celda. Cada fila muestra folio +
                  fecha emisión + monto bruto + link a la factura origen,
                  útil para distinguir facturas antiguas cobradas hoy del
                  ingreso de la cuota corriente. El botón "Igualar" se
                  adapta al número de facturas (1 → bruto exacto;
                  N → suma de totales). */}
              {target.dtes && target.dtes.length > 0 && (
                <DtesSection
                  dtes={target.dtes}
                  cellAmountClp={target.amountClp}
                  busy={busy === "amount"}
                  onIgualar={(total) => persistAmount(total)}
                />
              )}
              <p className="text-[12px] font-mono uppercase tracking-[0.08em] text-ds-text-3 px-1">
                Mover ocurrencia
              </p>
              <div className="space-y-2">
                {SHIFT_OPTIONS.map(({ label, days }) => (
                  <div
                    key={label}
                    className="grid grid-cols-[1fr_72px_1fr] items-center gap-2"
                  >
                    <Button
                      variant="outline"
                      onClick={() => shiftDays(-days)}
                      disabled={busy !== null}
                      className="h-11 sm:h-10"
                      aria-label={`Mover ${label} hacia atrás`}
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <span className="text-[14px] text-ds-text-1 text-center font-semibold tabular-nums">
                      {label}
                    </span>
                    <Button
                      variant="outline"
                      onClick={() => shiftDays(days)}
                      disabled={busy !== null}
                      className="h-11 sm:h-10"
                      aria-label={`Mover ${label} hacia adelante`}
                    >
                      <ChevronRight className="h-5 w-5" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="pt-2 space-y-2 border-t border-border">
                <Button
                  variant="outline"
                  onClick={() => setPickingDate(true)}
                  disabled={busy !== null}
                  className="w-full h-11 sm:h-10 text-[13px] justify-start"
                >
                  <CalendarIcon className="h-4 w-4 mr-2" /> Mover a fecha exacta…
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setDraftAmount(fmt.format(target.amountClp));
                    setEditing(true);
                  }}
                  disabled={busy !== null}
                  className="w-full h-11 sm:h-10 text-[13px] justify-start"
                >
                  <Pencil className="h-4 w-4 mr-2" /> Editar monto
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setConfirmingCancel(true)}
                  disabled={busy !== null}
                  className="w-full h-11 sm:h-10 text-[13px] justify-start text-status-error-fg hover:bg-status-error-soft"
                >
                  <Trash2 className="h-4 w-4 mr-2" /> Eliminar este monto…
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setConfirmingEnd(true)}
                  disabled={busy !== null}
                  className="w-full h-11 sm:h-10 text-[13px] justify-start text-status-warn-fg hover:bg-status-warn-soft"
                >
                  <CircleSlash className="h-4 w-4 mr-2" /> Terminar desde aquí…
                </Button>
                {canSendCobranza && (
                  <Button
                    variant="outline"
                    onClick={() => setCobranzaOpen(true)}
                    disabled={busy !== null}
                    className="w-full h-11 sm:h-10 text-[13px] justify-start text-status-info-fg hover:bg-status-info-soft"
                  >
                    <Send className="h-4 w-4 mr-2" /> Enviar cobranza…
                  </Button>
                )}
              </div>
              {busy === "shift" && (
                <div className="flex items-center justify-center gap-2 text-[13px] text-ds-text-3">
                  <Loader2 className="h-4 w-4 animate-spin" /> Moviendo…
                </div>
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
    {target?.dteId && (
      <CobranzaSendDialog
        open={cobranzaOpen}
        onClose={() => setCobranzaOpen(false)}
        dteId={target.dteId}
        crmAccountId={target.crmAccountId ?? null}
        daysOverdue={target.daysOverdue ?? 0}
      />
    )}
    </>
  );
}

function formatShortDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return format(new Date(y, m - 1, d), "d MMM yy", { locale: es });
}

/**
 * Sección de facturas conciliadas con la celda. Muestra cada DTE con folio,
 * fecha de emisión, monto y link al detalle. El botón "Igualar" suma los
 * totales cuando hay >1 factura, y solo aparece si el bruto total difiere
 * del proyectado actual de la celda.
 */
function DtesSection({
  dtes,
  cellAmountClp,
  busy,
  onIgualar,
}: {
  dtes: CellDteSummary[];
  cellAmountClp: number;
  busy: boolean;
  onIgualar: (total: number) => void;
}) {
  const grossTotal = dtes.reduce((s, d) => s + d.totalAmount, 0);
  const hasFactoring = dtes.some((d) => d.hasFactoring);
  // Solo mostramos el botón si el total real ≠ proyectado (sino no hay
  // nada que igualar). Tolerancia 1 CLP para evitar disparos por redondeo.
  const showIgualar = Math.abs(grossTotal - cellAmountClp) > 1;
  const isMulti = dtes.length > 1;

  return (
    <div className="space-y-2">
      <p className="text-[12px] font-mono uppercase tracking-[0.08em] text-ds-text-3 px-1">
        {isMulti ? `Facturas conciliadas (${dtes.length})` : "Factura conciliada"}
      </p>
      <ul className="space-y-1.5">
        {dtes.map((d) => (
          <li
            key={d.id}
            className="flex items-center gap-2 rounded-ds-sm bg-muted/30 px-2 py-1.5"
          >
            <Banknote className="h-4 w-4 shrink-0 text-ds-text-3" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-[13px] font-semibold text-ds-text-1 truncate">
                  {d.folio ? `#${d.folio}` : "(sin folio)"}
                </span>
                <span className="text-[12px] text-ds-text-3">
                  {formatShortDate(d.issueDate)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[12px] font-mono tabular-nums text-ds-text-2">
                  ${fmt.format(d.totalAmount)}
                </span>
                {d.hasFactoring && (
                  <span className="text-[11px] font-mono uppercase tracking-[0.06em] px-1 py-0.5 rounded-ds-sm bg-purple-500/15 text-purple-300">
                    Factoring
                  </span>
                )}
              </div>
            </div>
            <a
              href={`/finanzas/facturacion/dtes?folio=${d.folio ?? ""}`}
              target="_blank"
              rel="noreferrer"
              className="p-1.5 rounded-ds-sm text-ds-text-3 hover:text-ds-text-1 hover:bg-muted/60 shrink-0"
              aria-label="Abrir factura"
              title="Abrir factura"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </li>
        ))}
      </ul>
      {hasFactoring && (
        <p className="text-[12px] text-ds-text-3 px-1">
          ℹ️ El costo de factoring aparece en la categoría{" "}
          <span className="font-medium text-ds-text-2">Costo Factoring</span>{" "}
          (no se duplica desde aquí).
        </p>
      )}
      {showIgualar && (
        <Button
          onClick={() => onIgualar(grossTotal)}
          disabled={busy}
          className="w-full h-11 sm:h-10 text-[13px] justify-start"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4 mr-2" />
          )}
          <span className="truncate">
            {isMulti
              ? `Igualar al total real ($${fmt.format(grossTotal)} · ${dtes.length} facturas)`
              : `Igualar a factura${dtes[0].folio ? ` #${dtes[0].folio}` : ""} ($${fmt.format(grossTotal)})`}
          </span>
        </Button>
      )}
    </div>
  );
}
