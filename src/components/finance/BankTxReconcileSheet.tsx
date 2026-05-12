"use client";

/**
 * Drawer de conciliación manual de un movimiento bancario.
 *
 * Estructura: Sheet lateral con dos tabs:
 *   1. "Comparar transacciones" — lista de DTEs candidatos sugeridos
 *      (por monto + fecha). El usuario selecciona uno o varios; abajo se
 *      muestra el resumen con la diferencia respecto al monto del mov.
 *      Si queda resto, se prompt para asignarlo a una cuenta contable
 *      (split). Botón "Coincidir" guarda como links.
 *   2. "Categorizar de forma manual" — categorización rápida sin entidad:
 *      cuenta contable + nota. Útil para comisiones, intereses, gastos
 *      que no están en DTE.
 *
 * Soporta split N:N porque usa el endpoint de links que reemplaza atómico.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  formatCLPInput,
  parseCLPInput,
} from "@/lib/finance/format-clp-input";
import { AccountPlanCombobox } from "./AccountPlanCombobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  CheckCircle2,
  Circle,
  Trash2,
  Layers,
  Receipt,
  Search,
  Filter,
  Pencil,
  Link2Off,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CashflowCandidatesPanel } from "./cashflow/CashflowCandidatesPanel";
import { CategoryMappingDialog } from "./cashflow/CategoryMappingDialog";

// ── Tipos ──

interface Tx {
  id: string;
  transactionDate: string;
  description: string;
  reference: string | null;
  amount: number;
}

interface Candidate {
  id: string;
  direction: "ISSUED" | "RECEIVED";
  documentType: string;
  folio: number | null;
  issuerName: string;
  receiverName: string;
  receiverRut: string | null;
  issuerRut: string | null;
  total: number;
  amountPaid: number;
  amountPending: number;
  issuedAt: string;
  paymentStatus: string;
}

type LocalLinkType =
  | "DTE_ISSUED"
  | "DTE_RECEIVED"
  | "EXPENSE"
  | "INCOME"
  | "FACTORING_OPERATION";

interface FactoringCandidate {
  id: string;
  code: string;
  factoringCompanyName: string;
  fechaCesion: string;
  fechaVencimiento: string;
  invoiceAmount: number;
  expectedDeposit: number;
  expectedDepositSource: "simulation" | "computed";
  status: string;
  dteFolio: number | null;
  dteReceiverName: string | null;
}

interface LocalLink {
  /** Identificador local para el render. Si es DTE, es el id del DTE. */
  key: string;
  targetType: LocalLinkType;
  targetId: string | null;
  amount: number;
  accountPlanId: string | null;
  note: string | null;
  /** Etiqueta para mostrar (ej. "Factura 1234 - Cliente X"). */
  label: string;
}

/** Forma del link enriquecido que devuelve GET /links (post 2026-05). */
interface ExistingLink {
  id: string;
  targetType: LocalLinkType | "PAYROLL_LIQUIDACION" | "PAYROLL_ANTICIPO" | "TE_LOTE";
  targetId: string | null;
  amount: number;
  note: string | null;
  accountPlan: { id: string; code: string; name: string } | null;
  entityLabel: string;
  dte: {
    id: string;
    direction: "ISSUED" | "RECEIVED";
    documentType: string;
    folio: number;
    counterpartyName: string;
    paymentStatus: string;
    totalAmount: number;
  } | null;
  factoring: {
    id: string;
    code: string;
    factoringCompanyName: string;
  } | null;
}

interface ExistingPaymentRecord {
  id: string;
  code: string;
  type: string;
  date: string;
  amount: number;
  status: string;
  createdAt: string;
}

/**
 * Modo del drawer:
 *   - "loading": esperando GET /links inicial.
 *   - "view": tx ya conciliada, render resumen read-only + Desconciliar + Editar.
 *   - "edit" | "create": pestañas de creación / edición de vínculos.
 *   - "stale": la tx está MATCHED/RECONCILED en BD pero no encontramos
 *     evidencia (ni links ni payment record ni reconciliation match). Mostramos
 *     un banner con CTA "Forzar desconciliar" en vez de tabs, para no permitir
 *     comparar/categorizar sobre algo ya marcado como conciliado.
 */
type SheetMode = "loading" | "view" | "edit" | "create" | "stale";

interface AccountPlanOption {
  id: string;
  code: string;
  name: string;
  /** Tipo contable. */
  type?: string;
}

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  EXPENSE: "Gastos",
  COST: "Costos",
  REVENUE: "Ingresos",
  ASSET: "Activos",
  LIABILITY: "Pasivos",
  EQUITY: "Patrimonio",
};

/**
 * Para egresos priorizamos gastos/costos arriba; para ingresos los ingresos.
 * El resto se ordena alfabéticamente.
 */
function groupAccounts(
  plans: AccountPlanOption[],
  amountSign: "income" | "expense"
): { type: string; label: string; items: AccountPlanOption[] }[] {
  const buckets = new Map<string, AccountPlanOption[]>();
  for (const p of plans) {
    const t = p.type ?? "OTHER";
    if (!buckets.has(t)) buckets.set(t, []);
    buckets.get(t)!.push(p);
  }
  const order: string[] =
    amountSign === "income"
      ? ["REVENUE", "ASSET", "LIABILITY", "EQUITY", "COST", "EXPENSE", "OTHER"]
      : ["EXPENSE", "COST", "ASSET", "LIABILITY", "EQUITY", "REVENUE", "OTHER"];
  return order
    .filter((t) => buckets.has(t))
    .map((t) => ({
      type: t,
      label: ACCOUNT_TYPE_LABEL[t] ?? "Otros",
      items: buckets
        .get(t)!
        .slice()
        .sort((a, b) => a.code.localeCompare(b.code)),
    }));
}

interface BankTxReconcileSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tx: Tx | null;
  accountPlans: AccountPlanOption[];
  onSaved: () => void;
  /**
   * Modo "cola" (post 2026-05): cuando viene definido, el sheet muestra
   * "Movimiento N de M" en el header y permite "Saltar" para avanzar al
   * siguiente sin guardar. Se setea desde la barra masiva de Bancos al
   * iniciar una sesión de conciliación uno-por-uno.
   */
  queueInfo?: {
    index: number;
    total: number;
    onNext: () => void;
    onCancel: () => void;
  };
}

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

export function BankTxReconcileSheet({
  open,
  onOpenChange,
  tx,
  accountPlans,
  onSaved,
  queueInfo,
}: BankTxReconcileSheetProps) {
  const [mode, setMode] = useState<SheetMode>("loading");
  const [existingLinks, setExistingLinks] = useState<ExistingLink[]>([]);
  const [existingPaymentRecord, setExistingPaymentRecord] =
    useState<ExistingPaymentRecord | null>(null);
  const [unreconciling, setUnreconciling] = useState(false);
  const [tab, setTab] = useState<"cashflow" | "compare" | "manual">("cashflow");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [factoringCandidates, setFactoringCandidates] = useState<
    FactoringCandidate[]
  >([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  // Filtros del tab "Comparar transacciones" (estilo Zoho)
  const [filterText, setFilterText] = useState("");
  const [filterMinAmount, setFilterMinAmount] = useState("");
  const [filterMaxAmount, setFilterMaxAmount] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterDirection, setFilterDirection] = useState<"all" | "ISSUED" | "RECEIVED">("all");
  const [links, setLinks] = useState<LocalLink[]>([]);
  const [saving, setSaving] = useState(false);
  // Form de "categorizar manual"
  const [manualAccountType, setManualAccountType] = useState<string>("");
  const [manualAccountId, setManualAccountId] = useState<string>("");
  const [manualAmount, setManualAmount] = useState<string>("");
  const [manualNote, setManualNote] = useState("");
  const [manualDate, setManualDate] = useState<string>("");
  // Cuenta contable de "resto" cuando la suma de DTEs no cubre el total
  const [restAccountType, setRestAccountType] = useState<string>("");
  const [restAccountId, setRestAccountId] = useState<string>("");
  const [restNote, setRestNote] = useState("");
  // Cola de cuentas que el PUT devolvió como sin mapeo. Se procesan una por una.
  const [unmappedQueue, setUnmappedQueue] = useState<
    Array<{ id: string; code: string; name: string }>
  >([]);

  const txAmountAbs = tx ? Math.abs(tx.amount) : 0;
  const linksTotal = useMemo(
    () => links.reduce((s, l) => s + l.amount, 0),
    [links]
  );
  const remaining = Math.max(0, txAmountAbs - linksTotal);

  const loadCandidates = useCallback(async () => {
    if (!tx) return;
    setLoadingCandidates(true);
    try {
      const res = await fetch(
        `/api/finance/banking/transactions/${tx.id}/candidates`
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setCandidates(json.data ?? []);
      setFactoringCandidates(json.factoring ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al cargar");
    } finally {
      setLoadingCandidates(false);
    }
  }, [tx]);

  // Reset + carga inicial al abrir.
  // Decide entre "view" (ya conciliado) y "create" (sin links) según GET.
  useEffect(() => {
    if (!open || !tx) return;
    setMode("loading");
    setExistingLinks([]);
    setExistingPaymentRecord(null);
    setTab("cashflow");
    setLinks([]);
    setManualAccountType("");
    setManualAccountId("");
    setManualAmount(formatCLPInput(String(Math.abs(tx.amount))));
    setManualNote("");
    setManualDate(tx.transactionDate.slice(0, 10));
    setRestAccountType("");
    setRestAccountId("");
    setRestNote("");
    setFilterText("");
    setFilterMinAmount("");
    setFilterMaxAmount("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterDirection("all");
    setShowFilters(false);

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/finance/banking/transactions/${tx.id}/links`
        );
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.success) {
          throw new Error(json.error ?? "Error al cargar conciliación");
        }
        const data = json.data as {
          links: ExistingLink[];
          paymentRecord: ExistingPaymentRecord | null;
          reconciliationStatus: string;
        };
        setExistingLinks(data.links ?? []);
        setExistingPaymentRecord(data.paymentRecord);
        if ((data.links ?? []).length > 0) {
          setMode("view");
          // Pre-cargar candidatos en background para que "Editar" sea
          // instantáneo (no bloquea el render del resumen).
          loadCandidates();
        } else if (
          data.reconciliationStatus &&
          data.reconciliationStatus !== "UNMATCHED"
        ) {
          // Tx marcada como conciliada en BD pero sin evidencia de links/payment.
          // NO mostramos tabs de comparar/categorizar — el usuario debe forzar
          // desconciliar primero. Evita conciliar dos veces el mismo mov.
          setMode("stale");
        } else {
          setMode("create");
          loadCandidates();
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(
            err instanceof Error ? err.message : "Error al cargar"
          );
          // Fallback: dejamos al usuario crear como antes.
          setMode("create");
          loadCandidates();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, tx, loadCandidates]);

  /** Carga los links existentes en `links` (state local) y entra a modo edit. */
  const handleStartEdit = () => {
    if (!tx) return;
    const localLinks: LocalLink[] = existingLinks.map((l) => {
      let label = l.entityLabel;
      // Mantenemos compatibilidad de tipos: PAYROLL_* y TE_LOTE no son
      // editables hoy desde el sheet — los pintamos pero el toggle de
      // pestañas no los muestra como candidatos. Si alguien edita una
      // tx con esos links, el resumen los preserva como un link "exotic"
      // — lo guardamos con su key y monto para no perderlos.
      const targetType = (l.targetType as LocalLinkType) ?? "EXPENSE";
      return {
        key: l.targetId ?? `existing-${l.id}`,
        targetType,
        targetId: l.targetId,
        amount: l.amount,
        accountPlanId: l.accountPlan?.id ?? null,
        note: l.note,
        label,
      };
    });
    setLinks(localLinks);
    // Si todos los links son DTE → arrancamos en "compare". Si hay
    // EXPENSE/INCOME → "manual". Default "compare".
    const onlyManual = localLinks.every(
      (l) => l.targetType === "EXPENSE" || l.targetType === "INCOME"
    );
    setTab(onlyManual ? "manual" : "compare");
    setMode("edit");
  };

  /** Desconcilia: DELETE /links + cierra. */
  const handleUnreconcile = async () => {
    if (!tx) return;
    if (
      !window.confirm(
        "Vas a desconciliar este movimiento y revertir el pago asociado a los DTE. ¿Confirmás?"
      )
    ) {
      return;
    }
    setUnreconciling(true);
    try {
      const res = await fetch(
        `/api/finance/banking/transactions/${tx.id}/links`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Error al desconciliar");
      }
      toast.success("Conciliación deshecha");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al desconciliar");
    } finally {
      setUnreconciling(false);
    }
  };

  // Filtrado client-side de los candidatos según los filtros del usuario.
  // El endpoint trae sugerencias por monto cercano + fecha; los filtros
  // permiten al usuario afinar (ej. ver solo emitidos, expandir el rango).
  const filteredCandidates = useMemo(() => {
    return candidates.filter((c) => {
      if (filterDirection !== "all" && c.direction !== filterDirection)
        return false;
      if (filterText.trim()) {
        const q = filterText.trim().toLowerCase();
        const txt = [
          c.documentType,
          String(c.folio ?? ""),
          c.issuerName,
          c.receiverName,
          c.issuerRut ?? "",
          c.receiverRut ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!txt.includes(q)) return false;
      }
      if (filterMinAmount) {
        const min = parseCLPInput(filterMinAmount);
        if (min != null && c.amountPending < min) return false;
      }
      if (filterMaxAmount) {
        const max = parseCLPInput(filterMaxAmount);
        if (max != null && c.amountPending > max) return false;
      }
      if (filterDateFrom) {
        if (c.issuedAt.slice(0, 10) < filterDateFrom) return false;
      }
      if (filterDateTo) {
        if (c.issuedAt.slice(0, 10) > filterDateTo) return false;
      }
      return true;
    });
  }, [
    candidates,
    filterText,
    filterMinAmount,
    filterMaxAmount,
    filterDateFrom,
    filterDateTo,
    filterDirection,
  ]);

  const toggleCandidate = (c: Candidate) => {
    const isLinked = links.some((l) => l.key === c.id);
    if (isLinked) {
      setLinks((prev) => prev.filter((l) => l.key !== c.id));
      return;
    }
    // Monto sugerido: el menor entre el pendiente del DTE y el remaining
    const suggested = Math.min(c.amountPending, remaining || c.amountPending);
    setLinks((prev) => [
      ...prev,
      {
        key: c.id,
        targetType: c.direction === "ISSUED" ? "DTE_ISSUED" : "DTE_RECEIVED",
        targetId: c.id,
        amount: suggested,
        accountPlanId: null,
        note: null,
        label: `${c.documentType} ${c.folio ?? ""} - ${
          c.direction === "ISSUED" ? c.receiverName : c.issuerName
        }`,
      },
    ]);
  };

  const toggleFactoring = (c: FactoringCandidate) => {
    const isLinked = links.some((l) => l.key === c.id);
    if (isLinked) {
      setLinks((prev) => prev.filter((l) => l.key !== c.id));
      return;
    }
    // Monto sugerido: el expected del factoring (cap al remaining).
    const suggested = Math.min(
      c.expectedDeposit,
      remaining || c.expectedDeposit,
    );
    setLinks((prev) => [
      ...prev,
      {
        key: c.id,
        targetType: "FACTORING_OPERATION",
        targetId: c.id,
        amount: suggested,
        accountPlanId: null,
        note: null,
        label: `Cesión ${c.code} · ${c.factoringCompanyName}${
          c.dteFolio ? ` · Factura ${c.dteFolio}` : ""
        }`,
      },
    ]);
  };

  const updateLinkAmount = (key: string, amount: number) => {
    setLinks((prev) =>
      prev.map((l) => (l.key === key ? { ...l, amount } : l))
    );
  };

  const removeLink = (key: string) => {
    setLinks((prev) => prev.filter((l) => l.key !== key));
  };

  const handleAddManualLine = () => {
    if (!manualAccountId) {
      toast.error("Seleccioná una cuenta contable");
      return;
    }
    const amt = parseCLPInput(manualAmount) ?? 0;
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Monto inválido");
      return;
    }
    if (!tx) return;
    const isIncome = tx.amount > 0;
    const account = accountPlans.find((a) => a.id === manualAccountId);
    const noteWithDate =
      manualDate && manualDate !== tx.transactionDate.slice(0, 10)
        ? `${manualNote.trim() ? manualNote.trim() + " · " : ""}Fecha: ${manualDate}`
        : manualNote.trim() || null;
    setLinks((prev) => [
      ...prev,
      {
        key: `manual-${Date.now()}`,
        targetType: isIncome ? "INCOME" : "EXPENSE",
        targetId: null,
        amount: amt,
        accountPlanId: manualAccountId,
        note: noteWithDate,
        label: `${isIncome ? "Ingreso manual" : "Gasto manual"}: ${account?.code ?? ""} ${account?.name ?? ""}`,
      },
    ]);
    setManualAmount(formatCLPInput(String(remaining > 0 ? remaining - amt : 0)));
    setManualNote("");
    toast.success("Línea agregada");
    setTab("compare"); // volver para ver el resumen
  };

  const handleSave = async () => {
    if (!tx) return;
    if (links.length === 0) {
      toast.error("Agregá al menos un vínculo o categorización");
      return;
    }
    // Si queda diferencia, exigir cuenta contable de resto
    let finalLinks = [...links];
    if (remaining > 0.01) {
      if (!restAccountId) {
        toast.error(
          `Falta asignar $${remaining.toLocaleString("es-CL")}. Seleccioná una cuenta contable para el resto, o categorizá manual.`
        );
        return;
      }
      const isIncome = tx.amount > 0;
      const account = accountPlans.find((a) => a.id === restAccountId);
      finalLinks.push({
        key: "rest",
        targetType: isIncome ? "INCOME" : "EXPENSE",
        targetId: null,
        amount: remaining,
        accountPlanId: restAccountId,
        note: restNote.trim() || "Resto sin asignar",
        label: `Resto: ${account?.code ?? ""} ${account?.name ?? ""}`,
      });
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/finance/banking/transactions/${tx.id}/links`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            links: finalLinks.map((l) => ({
              targetType: l.targetType,
              targetId: l.targetId,
              amount: l.amount,
              accountPlanId: l.accountPlanId,
              note: l.note,
            })),
          }),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Movimiento conciliado");
      const unmapped: Array<{ id: string; code: string; name: string }> =
        json.data?.unmappedAccounts ?? [];
      if (unmapped.length > 0) {
        // Encolar cuentas sin mapping. NO cerramos el sheet todavía;
        // el dialog se abrirá automáticamente y procesará una por una.
        setUnmappedQueue(unmapped);
      } else {
        onSaved();
        onOpenChange(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  if (!tx) return null;

  const sheetTitle =
    mode === "view"
      ? "Movimiento conciliado"
      : mode === "stale"
      ? "Conciliación inconsistente"
      : mode === "edit"
        ? "Editar conciliación"
        : "Conciliar movimiento";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{sheetTitle}</SheetTitle>
        </SheetHeader>

        {/* Header de cola (post 2026-05): cuando el usuario abrió el sheet
            en modo cola desde la barra masiva, mostramos el progreso y
            botones para saltar/cancelar la cola completa. */}
        {queueInfo && (
          <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                Cola: movimiento {queueInfo.index + 1} de {queueInfo.total}
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={queueInfo.onNext}
                  disabled={unreconciling || saving}
                  title="Saltar al siguiente sin guardar"
                >
                  Saltar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-status-danger-fg"
                  onClick={queueInfo.onCancel}
                  disabled={unreconciling || saving}
                  title="Cancelar la cola completa"
                >
                  Cancelar cola
                </Button>
              </div>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{
                  width: `${((queueInfo.index + 1) / queueInfo.total) * 100}%`,
                }}
              />
            </div>
          </div>
        )}
        {/* Preview de la tx — fuera de SheetDescription para no romper la
            regla de DOM (DialogDescription es <p>; los <div> internos
            disparaban hydration warning). */}
        <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3 text-sm space-y-1">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-foreground font-medium">{tx.description}</span>
            <span
              className={cn(
                "font-mono font-semibold",
                tx.amount >= 0
                  ? "text-status-ok-fg"
                  : "text-status-danger-fg"
              )}
            >
              {fmtCLP.format(tx.amount)}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            {format(new Date(tx.transactionDate), "dd MMM yyyy", {
              locale: es,
            })}
            {tx.reference && (
              <>
                {" · "}
                <span className="font-mono">{tx.reference}</span>
              </>
            )}
          </div>
        </div>

        {/* Loading inicial: GET /links en curso. */}
        {mode === "loading" && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Vista RESUMEN read-only de la conciliación existente. */}
        {mode === "view" && (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-status-ok-border bg-status-ok-soft/40 p-3 text-sm">
              <div className="flex items-center gap-2 text-status-ok-fg">
                <CheckCircle2 className="h-4 w-4" />
                <span className="font-medium">Conciliado</span>
              </div>
              {existingPaymentRecord ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Pago{" "}
                  <span className="font-mono">
                    {existingPaymentRecord.code}
                  </span>{" "}
                  registrado el{" "}
                  {format(
                    new Date(existingPaymentRecord.date),
                    "dd MMM yyyy",
                    { locale: es }
                  )}{" "}
                  por{" "}
                  <span className="font-mono">
                    {fmtCLP.format(existingPaymentRecord.amount)}
                  </span>
                  .
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  Vínculos creados manualmente. (Sin recibo de pago formal:
                  conciliación previa al fix de coherencia. Re-conciliá para
                  generar recibo.)
                </p>
              )}
            </div>

            <div>
              <p className="text-xs font-mono uppercase tracking-[0.08em] text-muted-foreground mb-2">
                Vínculos ({existingLinks.length})
              </p>
              <ul className="space-y-2">
                {existingLinks.map((l) => {
                  // Si el vínculo es un DTE, lo hacemos clickeable: link
                  // cross-módulo a la página de DTEs (emitidos o recibidos)
                  // pre-filtrada por folio del DTE. Así desde el drawer de
                  // banco se navega directo al detalle del documento.
                  const dteHref = l.dte
                    ? l.dte.direction === "ISSUED"
                      ? `/finanzas/facturacion/dtes?openDteId=${l.dte.id}`
                      : `/finanzas/facturacion/recibidos?openDteId=${l.dte.id}`
                    : null;
                  const Wrapper = dteHref
                    ? ({ children }: { children: React.ReactNode }) => (
                        <a
                          href={dteHref}
                          className="flex items-start gap-3 rounded-lg border border-border p-3 hover:bg-muted/30 transition-colors group"
                          aria-label={`Ver ${l.entityLabel}`}
                        >
                          {children}
                        </a>
                      )
                    : ({ children }: { children: React.ReactNode }) => (
                        <div className="flex items-start gap-3 rounded-lg border border-border p-3">
                          {children}
                        </div>
                      );
                  return (
                    <li key={l.id}>
                      <Wrapper>
                        <div className="shrink-0 pt-0.5">
                          {l.dte ? (
                            <Receipt className="h-4 w-4 text-primary" />
                          ) : l.factoring ? (
                            <Layers className="h-4 w-4 text-primary" />
                          ) : (
                            <Circle className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium truncate">
                              {l.entityLabel}
                            </span>
                            {l.dte ? (
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-xs",
                                  l.dte.paymentStatus === "PAID"
                                    ? "bg-status-ok-soft text-status-ok-fg border-status-ok-border"
                                    : l.dte.paymentStatus === "PARTIAL"
                                      ? "bg-status-warn-soft text-status-warn-fg border-status-warn-border"
                                      : "bg-muted"
                                )}
                              >
                                {l.dte.paymentStatus}
                              </Badge>
                            ) : null}
                            {dteHref && (
                              <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            )}
                          </div>
                          {l.note ? (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {l.note}
                            </p>
                          ) : null}
                          {l.accountPlan ? (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {l.accountPlan.code} {l.accountPlan.name}
                            </p>
                          ) : null}
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-sm font-medium">
                            {fmtCLP.format(l.amount)}
                          </p>
                        </div>
                      </Wrapper>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Footer del modo view */}
            <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <Button onClick={handleStartEdit} variant="outline">
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Editar vínculos
              </Button>
              <Button
                onClick={handleUnreconcile}
                variant="outline"
                disabled={unreconciling}
                className="text-status-danger-fg hover:bg-status-danger-soft"
              >
                {unreconciling ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Link2Off className="h-3.5 w-3.5 mr-1.5" />
                )}
                Desconciliar
              </Button>
              {existingPaymentRecord ? (
                <Button
                  variant="ghost"
                  onClick={() =>
                    window.open(
                      `/finanzas/pagos/${existingPaymentRecord.id}`,
                      "_blank"
                    )
                  }
                  className="ml-auto"
                >
                  Ver recibo
                  <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                </Button>
              ) : null}
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={unreconciling}
              >
                Cerrar
              </Button>
            </div>
          </div>
        )}

        {/* Conciliación inconsistente: tx marcada conciliada en BD pero
            no hay links/payment/match. Forzar desconciliar es la única acción
            válida — NO permitimos comparar/categorizar sobre algo conciliado. */}
        {mode === "stale" && (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-status-warn-border bg-status-warn-soft/40 p-3 text-sm">
              <p className="font-medium text-status-warn-fg">
                Este movimiento está marcado como conciliado pero no
                encontramos los vínculos asociados.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Probablemente una conciliación previa quedó corrupta o se
                eliminó el recibo de pago manualmente. Forzá la desconciliación
                para limpiar el estado y volver a conciliar correctamente.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <Button
                onClick={handleUnreconcile}
                variant="outline"
                disabled={unreconciling}
                className="text-status-danger-fg hover:bg-status-danger-soft"
              >
                {unreconciling ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Link2Off className="h-3.5 w-3.5 mr-1.5" />
                )}
                Forzar desconciliar
              </Button>
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={unreconciling}
              >
                Cerrar
              </Button>
            </div>
          </div>
        )}

        {/* Tabs (solo en modo create / edit) */}
        {(mode === "create" || mode === "edit") && (
        <>
        <div className="mt-4 border-b border-border">
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setTab("cashflow")}
              className={cn(
                "px-1 py-2 text-sm font-medium transition-colors border-b-2",
                tab === "cashflow"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              Flujo de caja
            </button>
            <button
              type="button"
              onClick={() => setTab("compare")}
              className={cn(
                "px-1 py-2 text-sm font-medium transition-colors border-b-2",
                tab === "compare"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Layers className="h-3.5 w-3.5 inline-block mr-1.5" />
              Comparar transacciones
            </button>
            <button
              type="button"
              onClick={() => setTab("manual")}
              className={cn(
                "px-1 py-2 text-sm font-medium transition-colors border-b-2",
                tab === "manual"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Receipt className="h-3.5 w-3.5 inline-block mr-1.5" />
              Categorizar manual
            </button>
          </div>
        </div>

        {/* Content */}
        {tab === "cashflow" && tx && (
          <div className="mt-4 space-y-3">
            <p className="text-xs font-mono uppercase tracking-[0.08em] text-muted-foreground">
              Cuotas proyectadas similares
            </p>
            <CashflowCandidatesPanel
              bankTransactionId={tx.id}
              onMatched={() => {
                onSaved();
                onOpenChange(false);
              }}
            />
          </div>
        )}

        {tab === "compare" && (
          <div className="mt-4 space-y-4">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-xs font-mono uppercase tracking-[0.08em] text-muted-foreground">
                  Coincidencias posibles
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setShowFilters((v) => !v)}
                >
                  <Filter className="h-3 w-3 mr-1" />
                  {showFilters ? "Ocultar filtros" : "Filtrar"}
                </Button>
              </div>

              {showFilters && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 mb-3 space-y-2.5">
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por contraparte, RUT, folio…"
                      value={filterText}
                      onChange={(e) => setFilterText(e.target.value)}
                      className="h-9 pl-8 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {/* CLP con separador de miles. Almacenamos el string
                        formateado en state; el filtrado parsea on-the-fly. */}
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        $
                      </span>
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder="Monto desde"
                        value={filterMinAmount}
                        onChange={(e) =>
                          setFilterMinAmount(formatCLPInput(e.target.value))
                        }
                        className="h-9 text-sm pl-5 font-mono"
                      />
                    </div>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        $
                      </span>
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder="Monto hasta"
                        value={filterMaxAmount}
                        onChange={(e) =>
                          setFilterMaxAmount(formatCLPInput(e.target.value))
                        }
                        className="h-9 text-sm pl-5 font-mono"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="date"
                      value={filterDateFrom}
                      onChange={(e) => setFilterDateFrom(e.target.value)}
                      className="h-9 text-sm"
                    />
                    <Input
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                  <Select
                    value={filterDirection}
                    onValueChange={(v) =>
                      setFilterDirection(v as "all" | "ISSUED" | "RECEIVED")
                    }
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los tipos</SelectItem>
                      <SelectItem value="ISSUED">Solo ventas</SelectItem>
                      <SelectItem value="RECEIVED">Solo compras</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {filteredCandidates.length} de {candidates.length} candidatos
                  </p>
                </div>
              )}

              {/* Cesiones a factoring (Fase 4 — conciliación con monto a girar) */}
              {factoringCandidates.length > 0 && (
                <div className="mb-4 space-y-2">
                  <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-primary">
                    Cesiones a factoring ({factoringCandidates.length})
                  </p>
                  <ul className="space-y-2">
                    {factoringCandidates.map((c) => {
                      const selected = links.some((l) => l.key === c.id);
                      return (
                        <li
                          key={c.id}
                          className={cn(
                            "flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                            selected
                              ? "border-primary bg-primary/5"
                              : "border-border hover:bg-muted/30",
                          )}
                          onClick={() => toggleFactoring(c)}
                        >
                          <div className="shrink-0 pt-0.5">
                            {selected ? (
                              <CheckCircle2 className="h-5 w-5 text-primary" />
                            ) : (
                              <Circle className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">
                                Cesión {c.code}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {c.factoringCompanyName}
                              </Badge>
                              {c.expectedDepositSource === "simulation" ? (
                                <Badge
                                  variant="outline"
                                  className="text-xs bg-status-ok-soft text-status-ok-fg border-status-ok-border"
                                >
                                  desde PDF
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs">
                                  estimado
                                </Badge>
                              )}
                            </div>
                            {c.dteFolio ? (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Factura {c.dteFolio} · {c.dteReceiverName}
                              </p>
                            ) : null}
                            <div className="flex items-center justify-between mt-1.5">
                              <span className="text-xs text-muted-foreground">
                                Cedida{" "}
                                {format(new Date(c.fechaCesion), "dd MMM yyyy", {
                                  locale: es,
                                })}
                              </span>
                              <p className="font-mono text-sm font-medium">
                                {fmtCLP.format(c.expectedDeposit)}
                              </p>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {loadingCandidates ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredCandidates.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  {candidates.length === 0 && factoringCandidates.length === 0
                    ? "No se encontraron facturas candidatas. Probá con “Categorizar manual” o ajustá la fecha."
                    : "Ninguno de los candidatos coincide con tus filtros. Limpiá los filtros para ver todos."}
                </p>
              ) : (
                <ul className="space-y-2">
                  {filteredCandidates.map((c) => {
                    const selected = links.some((l) => l.key === c.id);
                    const txAmountAbs = tx ? Math.abs(tx.amount) : 0;
                    const delta = c.amountPending - txAmountAbs;
                    const deltaPct = txAmountAbs > 0 ? Math.abs(delta) / txAmountAbs : 0;
                    const isExact = Math.abs(delta) <= 1;
                    const isFactoringLike = !isExact && delta > 0 && deltaPct <= 0.3;
                    return (
                      <li
                        key={c.id}
                        className={cn(
                          "flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                          selected
                            ? "border-primary bg-primary/5"
                            : isExact
                              ? "border-status-ok-border bg-status-ok-soft/30 hover:bg-status-ok-soft/50"
                              : "border-border hover:bg-muted/30"
                        )}
                        onClick={() => toggleCandidate(c)}
                      >
                        <div className="shrink-0 pt-0.5">
                          {selected ? (
                            <CheckCircle2 className="h-5 w-5 text-primary" />
                          ) : (
                            <Circle className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">
                              {c.documentType} {c.folio ?? ""}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {c.direction === "ISSUED"
                                ? "Venta"
                                : "Compra"}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-xs",
                                c.paymentStatus === "PARTIAL"
                                  ? "bg-status-warn-soft text-status-warn-fg border-status-warn-border"
                                  : c.paymentStatus === "OVERDUE"
                                    ? "bg-status-danger-soft text-status-danger-fg border-status-danger-border"
                                    : "bg-muted"
                              )}
                            >
                              {c.paymentStatus}
                            </Badge>
                            {isExact && (
                              <Badge
                                variant="outline"
                                className="text-[11px] bg-status-ok-soft text-status-ok-fg border-status-ok-border"
                              >
                                Match exacto
                              </Badge>
                            )}
                            {isFactoringLike && (
                              <Badge
                                variant="outline"
                                className="text-[11px] bg-status-info-soft text-status-info-fg border-status-info-border"
                                title="La diferencia puede ser comisión de factoring/descuento"
                              >
                                +{fmtCLP.format(delta)} (posible comisión)
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {c.direction === "ISSUED"
                              ? c.receiverName
                              : c.issuerName}
                          </p>
                          <div className="flex items-center justify-between mt-1.5">
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(c.issuedAt), "dd MMM yyyy", {
                                locale: es,
                              })}
                            </span>
                            <div className="text-right">
                              <p className="font-mono text-sm font-medium">
                                {fmtCLP.format(c.amountPending)}
                              </p>
                              {c.amountPending !== c.total && (
                                <p className="text-[11px] text-muted-foreground">
                                  de {fmtCLP.format(c.total)}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Resumen */}
            {links.length > 0 && (
              <div className="space-y-2 rounded-lg border border-border bg-card p-3">
                <p className="text-xs font-mono uppercase tracking-[0.08em] text-muted-foreground">
                  Vínculos seleccionados
                </p>
                <ul className="space-y-1.5">
                  {links.map((l) => (
                    <li
                      key={l.key}
                      className="flex items-center gap-2 text-sm"
                    >
                      <span className="flex-1 truncate">{l.label}</span>
                      <Input
                        type="text"
                        inputMode="numeric"
                        className="h-8 w-32 font-mono text-right"
                        value={formatCLPInput(String(l.amount))}
                        onChange={(e) =>
                          updateLinkAmount(
                            l.key,
                            parseCLPInput(e.target.value) ?? 0,
                          )
                        }
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 shrink-0"
                        onClick={() => removeLink(l.key)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-border pt-2 space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Asignado</span>
                    <span className="font-mono font-medium">
                      {fmtCLP.format(linksTotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      Monto del movimiento
                    </span>
                    <span className="font-mono">
                      {fmtCLP.format(txAmountAbs)}
                    </span>
                  </div>
                  <div
                    className={cn(
                      "flex items-center justify-between font-medium",
                      remaining > 0.01
                        ? "text-status-warn-fg"
                        : "text-status-ok-fg"
                    )}
                  >
                    <span>{remaining > 0.01 ? "Falta asignar" : "Cuadrado"}</span>
                    <span className="font-mono">
                      {remaining > 0.01 ? fmtCLP.format(remaining) : "✓"}
                    </span>
                  </div>
                </div>
                {remaining > 0.01 && (
                  <div className="space-y-2 pt-2 border-t border-border">
                    <p className="text-xs text-muted-foreground">
                      Asigná el resto a una cuenta contable (ej. costos
                      factoring, comisión, gastos varios):
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <Select
                        value={restAccountType}
                        onValueChange={(v) => {
                          setRestAccountType(v);
                          setRestAccountId("");
                        }}
                      >
                        <SelectTrigger className="h-10 sm:h-9">
                          <SelectValue placeholder="Tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          {groupAccounts(
                            accountPlans,
                            tx && tx.amount > 0 ? "income" : "expense"
                          ).map((g) => (
                            <SelectItem key={g.type} value={g.type}>
                              {g.label}{" "}
                              <span className="text-muted-foreground text-xs">
                                ({g.items.length})
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <AccountPlanCombobox
                        items={
                          groupAccounts(
                            accountPlans,
                            tx && tx.amount > 0 ? "income" : "expense"
                          ).find((g) => g.type === restAccountType)?.items ?? []
                        }
                        value={restAccountId}
                        onChange={setRestAccountId}
                        disabled={!restAccountType}
                        placeholder="Buscar por código o nombre…"
                        emptyLabel={
                          restAccountType ? "Seleccionar cuenta" : "Tipo primero"
                        }
                      />
                    </div>
                    <Input
                      placeholder="Nota (opcional)"
                      value={restNote}
                      onChange={(e) => setRestNote(e.target.value)}
                      maxLength={300}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "manual" && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Categorizá este movimiento sin vincular a una factura. Útil para
              comisiones, intereses, transferencias entre cuentas, etc.
            </p>
            {/* Step 1: tipo contable. Step 2: cuenta filtrada por tipo.
                Esto baja el ruido cuando el plan tiene muchas cuentas. */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo *</Label>
                <Select
                  value={manualAccountType}
                  onValueChange={(v) => {
                    setManualAccountType(v);
                    setManualAccountId(""); // reset al cambiar tipo
                  }}
                >
                  <SelectTrigger className="h-10 sm:h-9">
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {groupAccounts(
                      accountPlans,
                      tx && tx.amount > 0 ? "income" : "expense"
                    ).map((g) => (
                      <SelectItem key={g.type} value={g.type}>
                        {g.label}{" "}
                        <span className="text-muted-foreground text-xs">
                          ({g.items.length})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Cuenta contable *</Label>
                <AccountPlanCombobox
                  items={
                    groupAccounts(
                      accountPlans,
                      tx && tx.amount > 0 ? "income" : "expense"
                    ).find((g) => g.type === manualAccountType)?.items ?? []
                  }
                  value={manualAccountId}
                  onChange={setManualAccountId}
                  disabled={!manualAccountType}
                  placeholder="Buscar por código o nombre…"
                  emptyLabel={
                    manualAccountType
                      ? "Seleccionar cuenta"
                      : "Elige el tipo primero"
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="manual-date">Fecha *</Label>
                <Input
                  id="manual-date"
                  type="date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  className="h-10 sm:h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="manual-amount">Monto *</Label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    $
                  </span>
                  <Input
                    id="manual-amount"
                    type="text"
                    inputMode="numeric"
                    value={manualAmount}
                    onChange={(e) =>
                      setManualAmount(formatCLPInput(e.target.value))
                    }
                    className="font-mono h-10 sm:h-9 pl-5"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manual-note">Nota</Label>
              <Input
                id="manual-note"
                value={manualNote}
                onChange={(e) => setManualNote(e.target.value)}
                placeholder="Ej. Comisión bancaria mensual"
                maxLength={300}
                className="h-10 sm:h-9"
              />
            </div>
            <Button onClick={handleAddManualLine} size="sm">
              Agregar a vínculos
            </Button>
          </div>
        )}

        {/* Footer (solo en modo create / edit) */}
        <div className="mt-6 flex items-center gap-2 border-t border-border pt-4">
          <Button
            onClick={handleSave}
            disabled={saving || links.length === 0}
          >
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {mode === "edit" ? "Guardar cambios" : "Coincidir"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (mode === "edit") {
                // Volver al resumen sin guardar.
                setLinks([]);
                setMode("view");
              } else {
                onOpenChange(false);
              }
            }}
            disabled={saving}
          >
            {mode === "edit" ? "Cancelar edición" : "Cancelar"}
          </Button>
        </div>
        </>
        )}

        {unmappedQueue.length > 0 && tx && (
          <CategoryMappingDialog
            open={true}
            onOpenChange={(open) => {
              if (!open) {
                // El usuario cerró sin mapear: procedemos como si no quedaran
                setUnmappedQueue([]);
                onSaved();
                onOpenChange(false);
              }
            }}
            accountPlanId={unmappedQueue[0].id}
            accountCode={unmappedQueue[0].code}
            accountName={unmappedQueue[0].name}
            preferredKind={tx.amount > 0 ? "INCOME" : "EXPENSE"}
            onMapped={() => {
              // Avanza al siguiente. Si era el último, cerramos el sheet.
              setUnmappedQueue((q) => {
                const rest = q.slice(1);
                if (rest.length === 0) {
                  onSaved();
                  onOpenChange(false);
                }
                return rest;
              });
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
