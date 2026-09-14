"use client";

import { DatePickerField } from "@/components/ui/date-picker";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  Loader2,
  Plus,
  Trash2,
  Wallet,
  Upload,
  History,
  Flag,
  CopyCheck,
  Scale,
} from "lucide-react";
import { Tag } from "@/components/opai-ds";
import {
  bankBalanceSourceLabel,
  DEFAULT_BANK_BALANCE_DISCREPANCY_THRESHOLD_CLP,
} from "@/modules/finance/banking/bank-balance-constants";

interface BalanceSnapshot {
  id: string;
  asOfDate: string;
  balance: string | number;
  computedBalance?: string | number | null;
  deltaClp?: string | number | null;
  source: "MANUAL" | "IMPORT" | "CALCULATED" | "OPENING";
  note: string | null;
  createdAt: string;
  createdById: string | null;
}

interface LedgerReadingDto {
  id: string;
  asOfDate: string;
  source: BalanceSnapshot["source"];
  balance: number;
  ledgerAtDate: number | null;
  deltaClp: number | null;
  note: string | null;
  createdAt: string;
}

interface ReconciliationReportDto {
  opening: { id: string; asOfDate: string; balance: number } | null;
  needsOpening: boolean;
  ledgerTodayClp: number;
  latestReading: LedgerReadingDto | null;
  readings: LedgerReadingDto[];
  daysWithDelta: Array<{
    asOfDate: string;
    source: BalanceSnapshot["source"];
    readingBalance: number;
    ledgerAtDate: number;
    deltaClp: number;
  }>;
  duplicateSuspects: Array<{
    id: string;
    transactionDate: string;
    description: string;
    reference: string | null;
    amount: number;
    balance: number | null;
    dupSuspectOfId: string | null;
  }>;
  contentGroups: Array<{
    key: string;
    transactionDate: string;
    amount: number;
    description: string;
    reference: string | null;
    sameBalance: boolean;
    txIds: string[];
  }>;
  windowFromYmd: string;
  windowToYmd: string;
}

interface ResolvedDto {
  txCount: number;
  txDeltaClp: number;
  resolvedBalanceClp: number;
  needsOpening: boolean;
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

const SOURCE_ICON: Record<
  BalanceSnapshot["source"],
  React.ComponentType<{ className?: string }>
> = {
  OPENING: Flag,
  MANUAL: Wallet,
  IMPORT: Upload,
  CALCULATED: History,
};

const SOURCE_TAG: Record<BalanceSnapshot["source"], "brand" | "info" | "ok" | "neutral"> = {
  OPENING: "brand",
  MANUAL: "info",
  IMPORT: "ok",
  CALCULATED: "neutral",
};

function fmtYmd(ymd: string, pattern = "dd MMM yyyy"): string {
  return format(new Date(`${ymd.slice(0, 10)}T12:00:00`), pattern, { locale: es });
}

function yesterdayYmd(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return format(d, "yyyy-MM-dd");
}

function parseDigits(raw: string): number | null {
  const cleaned = raw.replace(/[^\d-]/g, "");
  if (!cleaned || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Panel de cuadratura de una cuenta bancaria:
 *   - Saldo inicial (OPENING): único dato que fija el arranque del libro mayor.
 *   - Lecturas del banco (app / cartola / proveedor) comparadas en vivo con
 *     el ledger a su fecha.
 *   - Días con diferencia y posibles duplicados para explicar cada delta.
 *   - Ajuste explícito (movimiento visible, auditado) como último recurso.
 * Ninguna acción aquí "mueve" el saldo salvo el saldo inicial, ocultar un
 * duplicado confirmado o registrar un ajuste; todo queda en el historial.
 */
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
  const [report, setReport] = useState<ReconciliationReportDto | null>(null);
  const [resolved, setResolved] = useState<ResolvedDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [thresholdClp, setThresholdClp] = useState(
    DEFAULT_BANK_BALANCE_DISCREPANCY_THRESHOLD_CLP,
  );

  // Lectura del banco
  const [readingDate, setReadingDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [readingStr, setReadingStr] = useState("");
  const [readingNote, setReadingNote] = useState("");
  const [savingReading, setSavingReading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Saldo inicial
  const [openingFormOpen, setOpeningFormOpen] = useState(false);
  const [openingDate, setOpeningDate] = useState(yesterdayYmd);
  const [openingStr, setOpeningStr] = useState("");
  const [openingNote, setOpeningNote] = useState("");
  const [savingOpening, setSavingOpening] = useState(false);

  // Ajuste explícito
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustDate, setAdjustDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [adjustStr, setAdjustStr] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [savingAdjust, setSavingAdjust] = useState(false);

  const [resolvingDup, setResolvingDup] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/finance/banking/accounts/${bankAccountId}/balance-history`
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Error al cargar la cuadratura");
      }
      setHistory(json.data ?? []);
      setReport(json.report ?? null);
      setResolved(json.resolved ?? null);
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

  useEffect(() => {
    if (report?.needsOpening) setOpeningFormOpen(true);
  }, [report?.needsOpening]);

  const ledgerToday = report?.ledgerTodayClp ?? resolved?.resolvedBalanceClp ?? currentBalance ?? 0;

  const handleSubmitReading = async () => {
    const balance = parseDigits(readingStr);
    if (balance == null) {
      toast.error("Monto inválido");
      return;
    }
    if (!readingDate) {
      toast.error("Selecciona una fecha");
      return;
    }
    setSavingReading(true);
    try {
      const res = await fetch(
        `/api/finance/banking/accounts/${bankAccountId}/balance-history`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            asOfDate: readingDate,
            balance,
            note: readingNote.trim() || null,
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
        throw new Error(json.error || "Error al registrar la lectura");
      }
      const delta = Number(json.discrepancy?.delta ?? 0);
      if (json.discrepancy?.evaluable === false) {
        toast.warning("Lectura registrada; define el saldo inicial para cuadrar.");
      } else if (Math.abs(delta) < 1) {
        toast.success("La lectura cuadra con el ledger.");
      } else {
        toast.warning(`Diferencia banco − OPAI: ${fmtCLP.format(delta)}`);
      }
      setReadingStr("");
      setReadingNote("");
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSavingReading(false);
    }
  };

  const handleSubmitOpening = async () => {
    const balance = parseDigits(openingStr);
    if (balance == null) {
      toast.error("Saldo inválido");
      return;
    }
    if (!openingDate) {
      toast.error("Selecciona la fecha de cierre");
      return;
    }
    if (
      !(await confirmDialog({
        description: `El saldo pasará a ser ${fmtCLP.format(balance)} al cierre del ${fmtYmd(openingDate)} más cada movimiento posterior. Los movimientos anteriores a esa fecha dejan de sumar (ya están dentro del saldo inicial).`,
        confirmLabel: "Definir saldo inicial",
      }))
    ) {
      return;
    }
    setSavingOpening(true);
    try {
      const res = await fetch(
        `/api/finance/banking/accounts/${bankAccountId}/opening-balance`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            asOfDate: openingDate,
            balance,
            note: openingNote.trim() || null,
          }),
        },
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Error al definir saldo inicial");
      }
      toast.success(
        `Saldo inicial definido. Saldo actual: ${fmtCLP.format(Number(json.data.resolvedBalanceClp))}`,
      );
      setOpeningStr("");
      setOpeningNote("");
      setOpeningFormOpen(false);
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSavingOpening(false);
    }
  };

  const handleSubmitAdjust = async () => {
    const amount = parseDigits(adjustStr);
    if (amount == null || amount === 0) {
      toast.error("Monto inválido (usa signo negativo para un egreso)");
      return;
    }
    if (adjustReason.trim().length < 5) {
      toast.error("Explicá el motivo (mínimo 5 caracteres)");
      return;
    }
    if (
      !(await confirmDialog({
        description: `Se creará un movimiento visible "Ajuste de cuadratura" por ${fmtCLP.format(amount)} el ${fmtYmd(adjustDate)}. Queda en el listado y auditado.`,
        confirmLabel: "Crear ajuste",
        variant: "destructive",
      }))
    ) {
      return;
    }
    setSavingAdjust(true);
    try {
      const res = await fetch(
        `/api/finance/banking/accounts/${bankAccountId}/adjustments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transactionDate: adjustDate,
            amount,
            reason: adjustReason.trim(),
          }),
        },
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Error al crear el ajuste");
      }
      toast.success("Ajuste registrado como movimiento");
      setAdjustStr("");
      setAdjustReason("");
      setAdjustOpen(false);
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSavingAdjust(false);
    }
  };

  const handleResolveDup = async (txId: string, action: "hide" | "keep") => {
    setResolvingDup(txId);
    try {
      const res = await fetch(
        `/api/finance/banking/transactions/${txId}/resolve-duplicate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Error al resolver");
      }
      toast.success(
        action === "hide"
          ? "Copia ocultada: deja de sumar al saldo"
          : "Movimiento confirmado como real",
      );
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setResolvingDup(null);
    }
  };

  const handleDelete = async (snapshot: BalanceSnapshot) => {
    const isOpening = snapshot.source === "OPENING";
    if (
      !(await confirmDialog({
        description: isOpening
          ? "¿Eliminar este saldo inicial? El ledger volverá al saldo inicial anterior (o quedará sin saldo inicial)."
          : "¿Eliminar esta lectura del banco? Solo desaparece del historial; el saldo no cambia.",
        variant: "destructive",
        confirmLabel: "Eliminar",
      }))
    ) {
      return;
    }
    setDeleting(snapshot.id);
    try {
      const res = await fetch(
        `/api/finance/banking/accounts/${bankAccountId}/balance-history/${snapshot.id}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Error al eliminar");
      }
      toast.success("Registro eliminado");
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setDeleting(null);
    }
  };

  const readingParsed = parseDigits(readingStr);
  const readingLiveDelta =
    readingParsed != null && readingDate === format(new Date(), "yyyy-MM-dd")
      ? readingParsed - ledgerToday
      : null;
  const readingNoteRequired =
    readingLiveDelta != null &&
    Math.abs(readingLiveDelta) >= thresholdClp &&
    !readingNote.trim();

  const liveDeltaById = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const r of report?.readings ?? []) m.set(r.id, r.deltaClp);
    return m;
  }, [report]);

  const suspects = report?.duplicateSuspects ?? [];
  const daysWithDelta = report?.daysWithDelta ?? [];
  const contentGroups = report?.contentGroups ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-ds-text-3" aria-hidden />
            Cuadratura con el banco
          </SheetTitle>
          <SheetDescription>{bankAccountLabel}</SheetDescription>
        </SheetHeader>

        {loading && !report ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-ds-text-3" />
          </div>
        ) : (
          <>
            {/* Ledger */}
            <section className="mt-6 rounded-lg border border-ds-border-default bg-ds-surface-2 p-4 space-y-2">
              <p className="text-[12px] font-mono uppercase tracking-[0.08em] text-ds-text-3">
                Saldo OPAI (libro mayor)
              </p>
              <p className="font-display text-xl font-semibold tabular-nums">
                {fmtCLP.format(ledgerToday)}
              </p>
              {report?.opening ? (
                <p className="text-[12px] text-ds-text-3">
                  Saldo inicial {fmtYmd(report.opening.asOfDate)}{" "}
                  {fmtCLP.format(report.opening.balance)} + {resolved?.txCount ?? 0} mov. (
                  {fmtCLP.format(resolved?.txDeltaClp ?? 0)})
                </p>
              ) : (
                <Tag variant="warn" size="md">
                  Sin saldo inicial: el saldo no se calcula desde los movimientos
                </Tag>
              )}
              {report?.latestReading && (
                <Tag
                  variant={
                    report.latestReading.deltaClp != null &&
                    Math.abs(report.latestReading.deltaClp) >= 1
                      ? "warn"
                      : report.latestReading.deltaClp == null
                        ? "neutral"
                        : "ok"
                  }
                  size="md"
                >
                  Última lectura {fmtYmd(report.latestReading.asOfDate, "dd MMM")}:{" "}
                  {fmtCLP.format(report.latestReading.balance)}
                  {report.latestReading.deltaClp == null
                    ? " · sin cuadrar"
                    : Math.abs(report.latestReading.deltaClp) >= 1
                      ? ` · diferencia ${fmtCLP.format(report.latestReading.deltaClp)}`
                      : " · cuadra"}
                </Tag>
              )}
              {canManage && (
                <div className="pt-1">
                  {openingFormOpen ? (
                    <div className="space-y-3 rounded-lg border border-ds-border-subtle bg-ds-surface-1 p-3">
                      <p className="text-[13px] text-ds-text-2">
                        Saldo inicial: saldo de cierre de un día ya terminado (ayer o
                        anterior), tal como lo muestra el banco. Todo lo posterior se
                        suma movimiento a movimiento.
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="opening-date">Fecha de cierre</Label>
                          <DatePickerField
                            value={openingDate || null}
                            onChange={(ymd) => setOpeningDate(ymd ?? "")}
                            id="opening-date"
                            max={yesterdayYmd()}
                            triggerClassName="h-10 sm:h-9"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="opening-amount">Saldo al cierre (CLP)</Label>
                          <Input
                            id="opening-amount"
                            type="text"
                            inputMode="numeric"
                            placeholder="0"
                            className="h-10 sm:h-9 font-mono"
                            value={openingStr}
                            onChange={(e) => setOpeningStr(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="opening-note">Nota (opcional)</Label>
                        <Input
                          id="opening-note"
                          type="text"
                          placeholder="Ej. saldo final cartola agosto"
                          className="h-10 sm:h-9"
                          value={openingNote}
                          onChange={(e) => setOpeningNote(e.target.value)}
                          maxLength={500}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={handleSubmitOpening}
                          disabled={savingOpening || !openingStr || !openingDate}
                          size="sm"
                          className="h-10 sm:h-9"
                        >
                          {savingOpening ? (
                            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                          ) : (
                            <Flag className="h-4 w-4 mr-1.5" />
                          )}
                          Definir saldo inicial
                        </Button>
                        {report?.opening && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-10 sm:h-9"
                            onClick={() => setOpeningFormOpen(false)}
                          >
                            Cancelar
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 sm:h-9"
                      onClick={() => setOpeningFormOpen(true)}
                    >
                      <Flag className="h-4 w-4 mr-1.5" />
                      Cambiar saldo inicial
                    </Button>
                  )}
                </div>
              )}
            </section>

            {/* Días con diferencia */}
            {daysWithDelta.length > 0 && (
              <section className="mt-6 space-y-2">
                <p className="text-[12px] font-mono uppercase tracking-[0.08em] text-status-warn-fg">
                  Días con diferencia ({daysWithDelta.length})
                </p>
                <ul className="space-y-2">
                  {daysWithDelta.map((d) => (
                    <li
                      key={d.asOfDate}
                      className="rounded-lg border border-status-warn-border bg-status-warn-soft p-3 text-[13px]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{fmtYmd(d.asOfDate)}</span>
                        <span className="font-mono tabular-nums font-semibold text-status-warn-fg">
                          {fmtCLP.format(d.deltaClp)}
                        </span>
                      </div>
                      <p className="text-[12px] text-ds-text-3 mt-0.5">
                        Banco {fmtCLP.format(d.readingBalance)} · OPAI{" "}
                        {fmtCLP.format(d.ledgerAtDate)} ·{" "}
                        {d.deltaClp > 0
                          ? "falta un ingreso o sobra un egreso"
                          : "falta un egreso o sobra un ingreso"}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Posibles duplicados */}
            {suspects.length > 0 && (
              <section className="mt-6 space-y-2">
                <p className="text-[12px] font-mono uppercase tracking-[0.08em] text-status-warn-fg">
                  Posibles duplicados ({suspects.length})
                </p>
                <p className="text-[12px] text-ds-text-3">
                  Misma fecha, monto y glosa que otra fila. Están sumando al saldo:
                  confirmá si son copias o movimientos reales.
                </p>
                <ul className="space-y-2">
                  {suspects.map((s) => (
                    <li key={s.id} className="rounded-lg border border-ds-border-default bg-card p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium truncate">{s.description}</p>
                          <p className="text-[12px] text-ds-text-3">
                            {fmtYmd(s.transactionDate)}
                            {s.reference ? ` · ${s.reference}` : ""}
                            {s.balance != null ? ` · saldo banco ${fmtCLP.format(s.balance)}` : ""}
                          </p>
                        </div>
                        <span
                          className={`font-mono text-[13px] tabular-nums shrink-0 ${
                            s.amount >= 0 ? "text-status-ok-fg" : "text-status-danger-fg"
                          }`}
                        >
                          {fmtCLP.format(s.amount)}
                        </span>
                      </div>
                      {canManage && (
                        <div className="mt-2 flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-10 sm:h-9 flex-1"
                            disabled={resolvingDup === s.id}
                            onClick={() => handleResolveDup(s.id, "hide")}
                          >
                            Es copia · ocultar
                          </Button>
                          <Button
                            size="sm"
                            className="h-10 sm:h-9 flex-1"
                            disabled={resolvingDup === s.id}
                            onClick={() => handleResolveDup(s.id, "keep")}
                          >
                            <CopyCheck className="h-4 w-4 mr-1.5" />
                            Es real · mantener
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {contentGroups.length > 0 && (
              <section className="mt-6 space-y-2">
                <p className="text-[12px] font-mono uppercase tracking-[0.08em] text-ds-text-3">
                  Filas idénticas ({contentGroups.length} grupos)
                </p>
                <p className="text-[12px] text-ds-text-3">
                  Informativo: dos transferencias iguales el mismo día son normales.
                  Solo es copia si el banco muestra el mismo saldo tras ambas.
                </p>
                <ul className="space-y-1.5">
                  {contentGroups.slice(0, 12).map((g) => (
                    <li
                      key={g.key}
                      className="flex items-center justify-between gap-2 rounded-md border border-ds-border-subtle px-3 py-2 text-[12px]"
                    >
                      <span className="min-w-0 truncate">
                        {fmtYmd(g.transactionDate, "dd MMM")} · {g.description}
                      </span>
                      <span className="shrink-0 flex items-center gap-2">
                        <span className="font-mono tabular-nums">{fmtCLP.format(g.amount)}</span>
                        <Tag variant={g.sameBalance ? "danger" : "neutral"} size="sm">
                          ×{g.txIds.length}{g.sameBalance ? " mismo saldo" : ""}
                        </Tag>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Registrar lectura */}
            {canManage && (
              <section className="mt-6 space-y-3 rounded-lg border border-ds-border-default bg-ds-surface-2 p-4">
                <p className="text-[12px] font-mono uppercase tracking-[0.08em] text-ds-text-3">
                  Registrar lectura del banco
                </p>
                <p className="text-[12px] text-ds-text-3">
                  Saldo que muestra el banco a una fecha. Se compara con OPAI; no
                  modifica el saldo.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="bal-date">Fecha</Label>
                    <DatePickerField
                      value={readingDate || null}
                      onChange={(ymd) => setReadingDate(ymd ?? "")}
                      id="bal-date"
                      triggerClassName="h-10 sm:h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bal-amount">Saldo banco (CLP)</Label>
                    <Input
                      id="bal-amount"
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      className="h-10 sm:h-9 font-mono"
                      value={readingStr}
                      onChange={(e) => setReadingStr(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bal-note">
                    {readingNoteRequired ? "Nota (obligatoria)" : "Nota (opcional)"}
                  </Label>
                  <Input
                    id="bal-note"
                    type="text"
                    placeholder="Ej. app Office Banking 11:36"
                    className="h-10 sm:h-9"
                    value={readingNote}
                    onChange={(e) => setReadingNote(e.target.value)}
                    maxLength={500}
                  />
                </div>
                {readingLiveDelta != null && readingLiveDelta !== 0 && (
                  <p
                    className={`text-[12px] tabular-nums ${
                      Math.abs(readingLiveDelta) >= thresholdClp
                        ? "text-status-warn-fg"
                        : "text-ds-text-3"
                    }`}
                  >
                    Diferencia banco − OPAI: {fmtCLP.format(readingLiveDelta)}
                  </p>
                )}
                <Button
                  onClick={handleSubmitReading}
                  disabled={savingReading || readingNoteRequired || !readingStr}
                  size="sm"
                  className="h-10 sm:h-9"
                >
                  {savingReading ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 mr-1.5" />
                  )}
                  Registrar lectura
                </Button>
              </section>
            )}

            {/* Historial */}
            <section className="mt-6 space-y-2">
              <p className="text-[12px] font-mono uppercase tracking-[0.08em] text-ds-text-3">
                Historial
              </p>
              {history.length === 0 ? (
                <p className="text-sm text-ds-text-3 py-4">
                  Sin registros de saldo todavía.
                </p>
              ) : (
                <ul className="space-y-2">
                  {history.map((s) => {
                    const Icon = SOURCE_ICON[s.source] ?? Wallet;
                    const balanceNum =
                      typeof s.balance === "string" ? Number(s.balance) : s.balance;
                    const liveDelta = liveDeltaById.get(s.id);
                    const storedDelta =
                      s.deltaClp == null || s.deltaClp === "" ? null : Number(s.deltaClp);
                    const deltaNum = liveDelta !== undefined ? liveDelta : storedDelta;
                    const isOpening = s.source === "OPENING";
                    const isActiveOpening = isOpening && report?.opening?.id === s.id;
                    return (
                      <li
                        key={s.id}
                        className={`rounded-lg border p-3 ${
                          isActiveOpening
                            ? "border-primary/30 bg-primary/5"
                            : "border-ds-border-default bg-card"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">{fmtYmd(s.asOfDate)}</span>
                              <Tag variant={SOURCE_TAG[s.source] ?? "neutral"} size="sm">
                                <Icon className="h-3 w-3 mr-1" />
                                {bankBalanceSourceLabel(s.source)}
                                {isActiveOpening ? " · activo" : ""}
                              </Tag>
                            </div>
                            <p className="font-mono text-sm font-semibold mt-1">
                              {fmtCLP.format(balanceNum)}
                            </p>
                            {!isOpening && deltaNum != null && Number.isFinite(deltaNum) && (
                              <div className="mt-1">
                                <Tag
                                  variant={Math.abs(deltaNum) >= 1 ? "warn" : "ok"}
                                  size="md"
                                >
                                  {Math.abs(deltaNum) >= 1
                                    ? `Diferencia ${fmtCLP.format(deltaNum)}`
                                    : "Cuadra"}
                                </Tag>
                              </div>
                            )}
                            {s.note && (
                              <p className="text-[12px] text-ds-text-3 mt-1.5">{s.note}</p>
                            )}
                            <p className="text-[12px] text-ds-text-4 mt-1">
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
                              className="h-10 w-10 sm:h-9 sm:w-9 shrink-0 text-destructive hover:text-destructive"
                              onClick={() => handleDelete(s)}
                              disabled={deleting === s.id}
                              aria-label="Eliminar registro"
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
            </section>

            {/* Ajuste explícito */}
            {canManage && report?.opening && (
              <section className="mt-6 mb-4 space-y-2">
                {adjustOpen ? (
                  <div className="space-y-3 rounded-lg border border-status-danger-border bg-status-danger-soft p-4">
                    <p className="text-[12px] font-mono uppercase tracking-[0.08em] text-status-danger-fg">
                      Ajuste de cuadratura
                    </p>
                    <p className="text-[12px] text-ds-text-2">
                      Último recurso: crea un movimiento visible que suma (positivo) o
                      resta (negativo) al saldo, con motivo y auditado. Antes, revisá
                      si falta importar una cartola o si hay un duplicado.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="adj-date">Fecha</Label>
                        <DatePickerField
                          value={adjustDate || null}
                          onChange={(ymd) => setAdjustDate(ymd ?? "")}
                          id="adj-date"
                          triggerClassName="h-10 sm:h-9"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="adj-amount">Monto (± CLP)</Label>
                        <Input
                          id="adj-amount"
                          type="text"
                          inputMode="numeric"
                          placeholder="-100000"
                          className="h-10 sm:h-9 font-mono"
                          value={adjustStr}
                          onChange={(e) => setAdjustStr(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="adj-reason">Motivo (obligatorio)</Label>
                      <Input
                        id="adj-reason"
                        type="text"
                        placeholder="Ej. comisión no informada por el banco"
                        className="h-10 sm:h-9"
                        value={adjustReason}
                        onChange={(e) => setAdjustReason(e.target.value)}
                        maxLength={400}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-10 sm:h-9"
                        disabled={savingAdjust || !adjustStr || adjustReason.trim().length < 5}
                        onClick={handleSubmitAdjust}
                      >
                        {savingAdjust ? (
                          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                        ) : (
                          <Scale className="h-4 w-4 mr-1.5" />
                        )}
                        Crear ajuste
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-10 sm:h-9"
                        onClick={() => setAdjustOpen(false)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-10 sm:h-9 text-ds-text-3"
                    onClick={() => setAdjustOpen(true)}
                  >
                    <Scale className="h-4 w-4 mr-1.5" />
                    Registrar ajuste explícito (último recurso)
                  </Button>
                )}
              </section>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
