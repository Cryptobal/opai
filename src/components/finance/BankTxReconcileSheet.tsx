"use client";

/**
 * Drawer de conciliación manual de un movimiento bancario.
 *
 * Estructura: Sheet lateral con dos tabs:
 *   1. "Comparar transacciones" — lista de DTEs candidatos sugeridos
 *      (por monto + fecha). El usuario selecciona uno o varios; abajo se
 *      muestra el resumen con la diferencia respecto al monto del mov.
 *      Si queda resto, se prompt para asignarlo a una cuenta contable
 *      (split). Botón "Coincidir" (barra sticky bajo tabs) guarda como links.
 *   2. "Categorizar de forma manual" — categorización rápida sin entidad:
 *      cuenta contable + nota. Útil para comisiones, intereses, gastos
 *      que no están en DTE.
 *
 * Soporta split N:N porque usa el endpoint de links que reemplaza atómico.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Plus,
  AlertTriangle,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobileViewport } from "@/hooks/useIsMobileViewport";
import { CategoryMappingDialog } from "./cashflow/CategoryMappingDialog";
import { SaveAsRuleModal } from "./SaveAsRuleModal";
import { Tag } from "@/components/opai-ds";

const FACTORING_SIGNAL_LABELS: Record<string, string> = {
  monto_simulacion: "Monto simulación",
  banda_factura_bruta: "Banda vs factura bruta",
  fecha_cesion: "Fecha cesión",
  rut_factoring: "RUT de factoring",
  folio_en_glosa: "Folio en glosa",
};

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
  factoringCompanyId?: string | null;
  fechaCesion: string;
  fechaVencimiento: string;
  invoiceAmount: number;
  expectedDeposit: number;
  expectedDepositSource: "simulation" | "computed";
  status: string;
  dteFolio: number | null;
  dteReceiverName: string | null;
  confidence: number;
  matchSignals: string[];
  isSuggested: boolean;
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
  targetType:
    | LocalLinkType
    | "PAYROLL_LIQUIDACION"
    | "PAYROLL_ANTICIPO"
    | "TE_LOTE"
    | "TE_ITEM"
    | "TE_TURNO";
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
  /**
   * Movimiento primario. En modo single-tx (click en fila) es el único.
   * En modo multi-tx (checkboxes) es `txs[0]` y se usa para el modo
   * "view"/"edit" que solo aplica si N === 1.
   */
  tx: Tx | null;
  /**
   * Lote completo del sidebar. Si no se pasa, default a `[tx]` (modo
   * single legacy). Si N > 1, el header y preview cambian a "N
   * movimientos · $sumatoria" y el guardado usa siempre el endpoint
   * bulk-reconcile-dtes.
   */
  txs?: Tx[];
  accountPlans: AccountPlanOption[];
  onSaved: () => void;
  /**
   * Modo "cola" (legacy, antes de multi-tx): el sidebar acumula
   * movimientos en `txs`, así que la cola/uno-por-uno queda obsoleta.
   * Se mantiene la prop por compatibilidad con call sites pero no se
   * usa en flujos nuevos.
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
  txs: txsProp,
  accountPlans,
  onSaved,
  queueInfo,
}: BankTxReconcileSheetProps) {
  const isMobile = useIsMobileViewport();
  // Lote efectivo. Mantiene compatibilidad con call sites legacy que solo
  // pasan `tx`: si no viene `txs`, derivamos `[tx]` (o `[]` si null).
  const txs = useMemo<Tx[]>(() => {
    if (txsProp && txsProp.length > 0) return txsProp;
    return tx ? [tx] : [];
  }, [tx, txsProp]);
  const isMulti = txs.length > 1;
  const totalAmountSigned = useMemo(
    () => txs.reduce((s, t) => s + t.amount, 0),
    [txs],
  );
  const totalAmountAbs = useMemo(
    () => txs.reduce((s, t) => s + Math.abs(t.amount), 0),
    [txs],
  );
  const [mode, setMode] = useState<SheetMode>("loading");
  const [existingLinks, setExistingLinks] = useState<ExistingLink[]>([]);
  const [existingPaymentRecord, setExistingPaymentRecord] =
    useState<ExistingPaymentRecord | null>(null);
  const [unreconciling, setUnreconciling] = useState(false);
  const [tab, setTab] = useState<"compare" | "manual">("compare");
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
  const [manualAccountId, setManualAccountId] = useState<string>("");
  const [manualAmount, setManualAmount] = useState<string>("");
  const [manualNote, setManualNote] = useState("");
  const [manualDate, setManualDate] = useState<string>("");
  // Cuenta contable de "resto" cuando la suma de DTEs no cubre el total
  const [restAccountId, setRestAccountId] = useState<string>("");
  const [restNote, setRestNote] = useState("");
  // Diff/shortfall: cuando sum(DTEs seleccionados) > banco (típico factoring).
  // (Antes vivía en un modal aparte; ahora todo en el sidebar.)
  const [diffMode, setDiffMode] = useState<"prorate" | "single" | "manual">(
    "prorate"
  );
  const [diffAccountPlanId, setDiffAccountPlanId] = useState<string>("");
  const [diffLabel, setDiffLabel] = useState("");
  // Cola de cuentas que el PUT devolvió como sin mapeo. Se procesan una por una.
  const [unmappedQueue, setUnmappedQueue] = useState<
    Array<{ id: string; code: string; name: string }>
  >([]);
  // Modal "Guardar como regla" (wizard pre-llenado con datos de la tx).
  const [saveAsRuleOpen, setSaveAsRuleOpen] = useState(false);
  // Ocupantes del RUT detectado en la tx (cliente / guardia / proveedor /
  // factoring). Si hay más de uno, mostramos banner de aviso.
  const [rutConflicts, setRutConflicts] = useState<
    Array<{ kind: string; entityId: string; entityName: string }> | null
  >(null);
  const factoringPrefillAppliedRef = useRef<string | null>(null);

  // Para el lote (1..N movs) la "tx amount abs" pasa a ser la suma. La
  // lógica de remaining/overflow opera sobre el lote completo, no sobre
  // un mov individual.
  const txAmountAbs = totalAmountAbs;
  const linksTotal = useMemo(
    () => links.reduce((s, l) => s + l.amount, 0),
    [links]
  );
  const remaining = Math.max(0, txAmountAbs - linksTotal);
  // Shortfall: la suma de facturas seleccionadas supera el banco (típico
  // depósito de factoring: banco trae el NETO post-comisión; las facturas
  // se asignan al BRUTO; diferencia = costo factoring). Para soportar este
  // caso ruteamos al endpoint bulk-reconcile-dtes (que sabe crear el asiento
  // contable de la diferencia). Sólo aplica cuando todos los vínculos son
  // DTE — si hay factoring/manual mezclado, el flujo correcto es ajustar
  // montos manualmente.
  const overflow = Math.max(0, linksTotal - txAmountAbs);
  const hasShortfall = overflow > 1;
  // El bloque "manejar diferencia" aplica cuando todos los links son
  // reconciliables vía bulk (DTE o factoring). Si hay links manuales
  // (INCOME/EXPENSE puros) mezclados, el bulk endpoint los rechaza y
  // pedimos al user que los quite primero.
  const allLinksAreReconcilable =
    links.length > 0 &&
    links.every(
      (l) =>
        l.targetType === "DTE_ISSUED" ||
        l.targetType === "DTE_RECEIVED" ||
        l.targetType === "FACTORING_OPERATION",
    );
  // Sentido contable de la cuenta para el SHORTFALL (banco < facturas):
  //   - tx income → diferencia es un GASTO (comisión, descuento) → EXPENSE/COST
  //   - tx expense → diferencia es un INGRESO (descuento proveedor) → REVENUE/LIABILITY/INCOME
  // El signo del lote: todos los movs deben tener mismo signo (validado por
  // el endpoint bulk). Usamos la suma firmada para inferirlo.
  // Ver `eligibleRemainderAccounts` para el caso simétrico (banco > facturas).
  const isIncomeTx = totalAmountSigned > 0;
  const eligibleShortfallAccounts = useMemo(() => {
    if (!accountPlans.length) return [];
    return accountPlans.filter((ap) => {
      if (!ap.type) return true;
      if (isIncomeTx) return ["EXPENSE", "COST"].includes(ap.type);
      return ["REVENUE", "LIABILITY", "INCOME"].includes(ap.type);
    });
  }, [accountPlans, isIncomeTx]);
  // Cuentas elegibles cuando hay REMAINDER (banco > facturas, sobra plata
  // sin asignar). Simétrico a eligibleShortfallAccounts:
  //   - tx income + remainder → cliente pagó de más → es un INGRESO
  //     (otros ingresos, anticipo cliente). Cuentas REVENUE/LIABILITY/INCOME.
  //   - tx expense + remainder → pagué de más → es un GASTO (cargo
  //     bancario, anticipo proveedor). Cuentas EXPENSE/COST/ASSET.
  // El handler de save (líneas ~884-904) crea el link con targetType
  // INCOME/EXPENSE basado en tx.amount, así que la cuenta elegida acá
  // debe ser coherente con esa dirección.
  const eligibleRemainderAccounts = useMemo(() => {
    if (!accountPlans.length) return [];
    return accountPlans.filter((ap) => {
      if (!ap.type) return true;
      if (isIncomeTx) return ["REVENUE", "LIABILITY", "INCOME"].includes(ap.type);
      return ["EXPENSE", "COST", "ASSET"].includes(ap.type);
    });
  }, [accountPlans, isIncomeTx]);

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

  useEffect(() => {
    factoringPrefillAppliedRef.current = null;
  }, [tx?.id]);

  // Detectar RUTs ocupantes para mostrar banner de aviso cuando hay duplicados
  // cross-tabla (mismo RUT en cliente + guardia, etc.).
  useEffect(() => {
    if (!tx) {
      setRutConflicts(null);
      return;
    }
    const extractRut = (text: string | null): string | null => {
      if (!text) return null;
      const m = text.match(/\d{1,2}\.?\d{3}\.?\d{3}-?[\dKk]/);
      return m ? m[0] : null;
    };
    const rut = extractRut(tx.description) ?? extractRut(tx.reference);
    if (!rut) {
      setRutConflicts(null);
      return;
    }
    const ctrl = new AbortController();
    fetch(`/api/finance/banking/rut-occupants?rut=${encodeURIComponent(rut)}`, {
      signal: ctrl.signal,
    })
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) setRutConflicts(j.data);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [tx]);

  /** Una sola cesión sugerida (≥90%) en modo crear → pre-selección sin guardar. */
  useEffect(() => {
    if (!open || !tx || mode !== "create" || loadingCandidates) return;
    if (links.length > 0) return;
    const suggestedOnes = factoringCandidates.filter((c) => c.isSuggested);
    if (suggestedOnes.length !== 1) return;
    if (factoringPrefillAppliedRef.current === tx.id) return;
    factoringPrefillAppliedRef.current = tx.id;
    const c = suggestedOnes[0]!;
    // Pre-cargamos el monto BRUTO esperado del PDF (sin clamp al banco).
    // Si el banco trae menos (merma factoring) aparece el bloque
    // "manejar diferencia" para imputar contablemente el costo. Antes
    // se clampaba al banco y la merma quedaba invisible.
    const suggestedAmt = c.expectedDeposit;
    setLinks([
      {
        key: c.id,
        targetType: "FACTORING_OPERATION",
        targetId: c.id,
        amount: suggestedAmt,
        accountPlanId: null,
        note: null,
        label: `Cesión ${c.code} · ${c.factoringCompanyName}${
          c.dteFolio ? ` · Factura ${c.dteFolio}` : ""
        }`,
      },
    ]);
  }, [
    open,
    tx,
    mode,
    loadingCandidates,
    links.length,
    factoringCandidates,
  ]);

  // Reset + carga inicial al abrir.
  // Decide entre "view" (ya conciliado) y "create" (sin links) según GET.
  useEffect(() => {
    if (!open || !tx) return;
    setMode("loading");
    setExistingLinks([]);
    setExistingPaymentRecord(null);
    setTab("compare");
    setLinks([]);
    setManualAccountId("");
    setManualAmount(formatCLPInput(String(Math.abs(tx.amount))));
    setManualNote("");
    setManualDate(tx.transactionDate.slice(0, 10));
    setRestAccountId("");
    setRestNote("");
    setDiffMode("prorate");
    setDiffAccountPlanId("");
    setDiffLabel("");
    setFilterText("");
    setFilterMinAmount("");
    setFilterMaxAmount("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterDirection("all");
    setShowFilters(false);
    setCandidates([]);
    setFactoringCandidates([]);

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
    // Monto sugerido: el amountPending REAL de la factura. Si la suma
    // termina excediendo el banco (típico factoring), el UI muestra el
    // bloque de shortfall para que el usuario elija cómo manejar la
    // diferencia (Prorratear / Cuenta única / Manual).
    const suggested = c.amountPending;
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
    // Monto sugerido: el expected BRUTO del PDF (sin clamp al banco).
    // La diferencia banco vs expected aparece como shortfall y se imputa
    // contablemente vía el bloque "manejar diferencia".
    const suggested = c.expectedDeposit;
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
    if (!tx || txs.length === 0) return;
    if (links.length === 0) {
      toast.error("Agregá al menos un vínculo o categorización");
      return;
    }

    const hasFactoringLinks = links.some(
      (l) => l.targetType === "FACTORING_OPERATION",
    );
    const hasManualLinks = links.some(
      (l) => l.targetType === "EXPENSE" || l.targetType === "INCOME",
    );

    // En multi-tx el endpoint bulk no acepta links manuales (INCOME/EXPENSE
    // puros sin entidad). Si el usuario armó un lote con esos, le pedimos
    // que los quite — la categorización manual aplica a 1 mov a la vez.
    if (isMulti && hasManualLinks) {
      toast.error(
        "En conciliación multi-movimiento sólo se permiten facturas o cesiones. Quitá los ítems de categorización manual o procesá los movs uno a uno.",
      );
      return;
    }

    // Path bulk-reconcile-dtes: cubre multi-tx, shortfall (DTE o factoring)
    // y cualquier caso que tenga links de factoring (el módulo factoring
    // sólo se actualiza vía este endpoint). El path PUT /[id]/links queda
    // como fallback para single-tx con DTE+manual sin diff contable.
    const useBulk = isMulti || hasShortfall || hasFactoringLinks;

    if (useBulk) {
      if (hasShortfall && diffMode !== "manual" && !diffAccountPlanId) {
        toast.error(
          "Seleccioná una cuenta contable para la diferencia, o elegí modo Manual.",
        );
        return;
      }
      // Construimos allocations a partir de los links DTE/factoring;
      // los manuales no aplican acá (validado arriba para multi-tx; en
      // single-tx vendrían capturados por el path PUT más abajo).
      let allocations = links
        .filter(
          (l) =>
            l.targetType === "DTE_ISSUED" ||
            l.targetType === "DTE_RECEIVED" ||
            l.targetType === "FACTORING_OPERATION",
        )
        .map((l) =>
          l.targetType === "FACTORING_OPERATION"
            ? {
                factoringOperationId: l.targetId as string,
                amount: l.amount,
              }
            : { dteId: l.targetId as string, amount: l.amount },
        );
      // En modo manual de shortfall, rescaleamos las allocations para
      // que su suma == sumatoria del banco. Las facturas quedan PARTIAL
      // por su porción real cobrada y el usuario registra el costo
      // aparte después.
      if (hasShortfall && diffMode === "manual") {
        const sum = allocations.reduce((s, a) => s + a.amount, 0);
        if (sum > 0) {
          const scale = txAmountAbs / sum;
          allocations = allocations.map((a) => ({
            ...a,
            amount: Math.round(a.amount * scale),
          }));
          const newSum = allocations.reduce((s, a) => s + a.amount, 0);
          const residue = Math.round(txAmountAbs) - newSum;
          if (allocations.length > 0) {
            allocations[allocations.length - 1].amount += residue;
          }
        }
      }
      const body: Record<string, unknown> = {
        bankTransactionIds: txs.map((t) => t.id),
        allocations,
      };
      if (hasShortfall && diffMode !== "manual") {
        body.differenceAllocation = {
          accountPlanId: diffAccountPlanId,
          amount: Math.round(overflow),
          label: diffLabel.trim() || null,
          prorateAcrossDteLines: diffMode === "prorate",
          direction: "shortfall",
        };
      }
      setSaving(true);
      try {
        const res = await fetch(
          "/api/finance/banking/transactions/bulk-reconcile-dtes",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error);
        toast.success(
          isMulti
            ? `${txs.length} movimientos conciliados`
            : "Movimiento conciliado",
        );
        onSaved();
        onOpenChange(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al guardar");
      } finally {
        setSaving(false);
      }
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
        : isMulti
          ? `Conciliar ${txs.length} movimientos`
          : "Conciliar movimiento";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={cn(
          "overflow-y-auto",
          isMobile
            ? "w-full max-h-[92dvh] rounded-t-2xl"
            : "w-full sm:max-w-2xl",
        )}
      >
        <SheetHeader>
          <SheetTitle>{sheetTitle}</SheetTitle>
        </SheetHeader>

        {rutConflicts && rutConflicts.length > 1 && (
          <div className="mt-3 rounded-md border border-status-warn-border bg-status-warn-soft p-2.5 text-[12px]">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-status-warn-fg shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-status-warn-fg font-medium">
                  RUT registrado en más de una entidad
                </p>
                <ul className="text-status-warn-fg/80 text-[12px] mt-1 space-y-0.5">
                  {rutConflicts.map((o, i) => (
                    <li key={i}>
                      ·{" "}
                      <b>
                        {o.kind === "client"
                          ? "Cliente"
                          : o.kind === "guardia"
                            ? "Guardia"
                            : o.kind === "supplier"
                              ? "Proveedor"
                              : "Factoring"}
                        :
                      </b>{" "}
                      {o.entityName}
                    </li>
                  ))}
                </ul>
                <p className="text-status-warn-fg/80 text-[12px] mt-1.5">
                  El sistema usó{" "}
                  <b>
                    {rutConflicts[0].kind === "client"
                      ? "Cliente"
                      : rutConflicts[0].kind === "guardia"
                        ? "Guardia"
                        : rutConflicts[0].kind === "supplier"
                          ? "Proveedor"
                          : "Factoring"}
                  </b>
                  . Si es incorrecto, categorizá manualmente.
                </p>
              </div>
            </div>
          </div>
        )}

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
        {/* Preview del/los movimiento(s). Single-tx muestra el detalle
            individual; multi-tx muestra una sumatoria con la lista de
            cada mov en una caja compacta. */}
        {isMulti ? (
          <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3 text-sm space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-foreground font-medium">
                {txs.length} {isIncomeTx ? "ingresos" : "egresos"}
              </span>
              <span
                className={cn(
                  "font-mono font-semibold",
                  isIncomeTx
                    ? "text-status-ok-fg"
                    : "text-status-danger-fg",
                )}
              >
                {fmtCLP.format(totalAmountSigned)}
              </span>
            </div>
            <ul className="space-y-1 max-h-40 overflow-y-auto pr-1">
              {txs.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-muted-foreground mr-1.5">
                      {format(new Date(t.transactionDate), "dd MMM", {
                        locale: es,
                      })}
                    </span>
                    {t.description}
                  </span>
                  <span
                    className={cn(
                      "font-mono shrink-0",
                      t.amount >= 0
                        ? "text-status-ok-fg"
                        : "text-status-danger-fg",
                    )}
                  >
                    {fmtCLP.format(t.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
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
        )}

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

        {/* Acciones primarias debajo del tab — sticky para que "Coincidir"
            siga visible al hacer scroll por la lista de candidatos. */}
        <div className="sticky top-0 z-[40] -mx-6 flex flex-wrap items-center gap-2 border-b border-ds-border-default bg-background/98 px-6 py-3 backdrop-blur-sm">
          <Button
            onClick={handleSave}
            disabled={saving || links.length === 0}
            className="h-10 sm:h-9"
          >
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {mode === "edit" ? "Guardar cambios" : "Coincidir"}
          </Button>
          <Button
            variant="outline"
            className="h-10 sm:h-9"
            onClick={() => {
              if (mode === "edit") {
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

        {/* Content */}
        {tab === "compare" && (
          <div className="mt-4 space-y-4">
            {/* Resumen: vínculos y diferencias arriba; la lista de candidatos queda debajo. */}
            {links.length > 0 && (
              <div className="sticky top-[5.25rem] z-[15] space-y-2 rounded-lg border border-ds-border-default bg-background/95 backdrop-blur-sm p-3 shadow-sm">
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
                      remaining > 0.01 || hasShortfall
                        ? "text-status-warn-fg"
                        : "text-status-ok-fg"
                    )}
                  >
                    <span>
                      {hasShortfall
                        ? "Diferencia (banco < facturas)"
                        : remaining > 0.01
                          ? "Falta asignar"
                          : "Cuadrado"}
                    </span>
                    <span className="font-mono">
                      {hasShortfall
                        ? `−${fmtCLP.format(overflow)}`
                        : remaining > 0.01
                          ? fmtCLP.format(remaining)
                          : "✓"}
                    </span>
                  </div>
                </div>
                {/* Shortfall block: las facturas suman MÁS que el banco
                    (típico factoring). (Antes vivía en un modal aparte; ahora todo en el sidebar.)
                    Sólo aplica cuando todos los vínculos son DTE. */}
                {hasShortfall && allLinksAreReconcilable && (
                  <div className="rounded-lg border border-status-warn-border bg-status-warn-soft/10 p-3 space-y-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">
                        ¿Cómo manejar la diferencia de{" "}
                        <span className="font-mono tabular-nums">
                          {fmtCLP.format(overflow)}
                        </span>
                        ?
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {isIncomeTx
                          ? "El banco recibió menos que el bruto de las facturas (típico: comisión factoring, retención)."
                          : "Las facturas suman más que el egreso bancario (descuento recibido)."}
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="flex items-start gap-2 text-xs cursor-pointer p-2 rounded-md hover:bg-muted/40">
                        <input
                          type="radio"
                          name="reconcile-diff-mode"
                          checked={diffMode === "prorate"}
                          onChange={() => setDiffMode("prorate")}
                          className="mt-0.5 accent-primary"
                        />
                        <span>
                          <span className="font-medium text-foreground">
                            Prorratear por centro de costo
                          </span>
                          <span className="block text-muted-foreground mt-0.5">
                            Reparte la diferencia entre los centros de costo
                            de las líneas de cada factura, ponderado por
                            subtotal × asignación.
                          </span>
                        </span>
                      </label>
                      <label className="flex items-start gap-2 text-xs cursor-pointer p-2 rounded-md hover:bg-muted/40">
                        <input
                          type="radio"
                          name="reconcile-diff-mode"
                          checked={diffMode === "single"}
                          onChange={() => setDiffMode("single")}
                          className="mt-0.5 accent-primary"
                        />
                        <span>
                          <span className="font-medium text-foreground">
                            Todo a una sola cuenta (sin prorrateo)
                          </span>
                          <span className="block text-muted-foreground mt-0.5">
                            Imputa los {fmtCLP.format(overflow)} completos a
                            la cuenta elegida abajo.
                          </span>
                        </span>
                      </label>
                      <label className="flex items-start gap-2 text-xs cursor-pointer p-2 rounded-md hover:bg-muted/40">
                        <input
                          type="radio"
                          name="reconcile-diff-mode"
                          checked={diffMode === "manual"}
                          onChange={() => setDiffMode("manual")}
                          className="mt-0.5 accent-primary"
                        />
                        <span>
                          <span className="font-medium text-foreground">
                            Manual (asignar después)
                          </span>
                          <span className="block text-muted-foreground mt-0.5">
                            No asignar costo ahora. Las facturas quedan
                            PARTIAL y registrás el costo en un asiento aparte.
                          </span>
                        </span>
                      </label>
                    </div>
                    {diffMode !== "manual" && (
                      <div className="space-y-2 pt-1">
                        <AccountPlanCombobox
                          items={eligibleShortfallAccounts}
                          value={diffAccountPlanId}
                          onChange={setDiffAccountPlanId}
                          placeholder={
                            isIncomeTx
                              ? "Buscar cuenta de gasto / costo factoring…"
                              : "Buscar cuenta de ingreso / descuento…"
                          }
                          emptyLabel="Seleccionar cuenta"
                          triggerClassName="w-full"
                        />
                        <Input
                          value={diffLabel}
                          onChange={(e) => setDiffLabel(e.target.value)}
                          placeholder={
                            isIncomeTx
                              ? "Nota del asiento (ej. 'Comisión factoring AMIFACTOR')"
                              : "Nota del asiento (ej. 'Descuento proveedor')"
                          }
                          className="h-11 sm:h-9 text-base sm:text-sm"
                        />
                      </div>
                    )}
                  </div>
                )}
                {hasShortfall && !allLinksAreReconcilable && (
                  <p className="text-xs text-status-danger-fg pt-2">
                    Para imputar la diferencia contablemente hay ítems
                    manuales en el lote. Quitálos o procesá la
                    categorización manual aparte.
                  </p>
                )}
                {remaining > 0.01 && (
                  <div className="rounded-lg border border-status-info-border bg-status-info-soft/10 p-3 space-y-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">
                        {isIncomeTx ? "Sobra " : "Falta cubrir "}
                        <span className="font-mono tabular-nums">
                          {fmtCLP.format(remaining)}
                        </span>
                        {isIncomeTx ? " del depósito" : " del egreso"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {isIncomeTx
                          ? "El banco trajo más que el total de facturas asignadas. Probablemente: anticipo, pago duplicado, o ingreso no facturado."
                          : "El egreso bancario supera el total de facturas/pagos asignados. Probablemente: cargo bancario, comisión, o pago no documentado."}
                      </p>
                    </div>
                    <AccountPlanCombobox
                      items={eligibleRemainderAccounts}
                      value={restAccountId}
                      onChange={setRestAccountId}
                      placeholder={
                        isIncomeTx
                          ? "Buscar cuenta de ingreso…"
                          : "Buscar cuenta de gasto…"
                      }
                      emptyLabel="Seleccionar cuenta"
                      triggerClassName="w-full"
                    />
                    <Input
                      placeholder={
                        isIncomeTx
                          ? "Nota del asiento (ej. 'Anticipo cliente RUT 12345678-9')"
                          : "Nota del asiento (ej. 'Cargo bancario por mantención')"
                      }
                      value={restNote}
                      onChange={(e) => setRestNote(e.target.value)}
                      maxLength={300}
                      className="h-11 sm:h-9 text-base sm:text-sm"
                    />
                  </div>
                )}
              </div>
            )}
            {/* Sugerencia destacada: la cesión con mayor confidence se
                renderiza prominente sobre el search para que el usuario no
                la confunda con los DTEs del listado. Aparece solo en modo
                crear/editar y cuando hay ≥1 cesión con confidence ≥ 90.
                Si está seleccionada, el banner cambia a estado OK. Si el
                expectedDeposit del PDF supera el monto del banco se
                advierte la merma (queda sin imputar contablemente — el
                manejo de ese costo se agrega en PR2). */}
            {(() => {
              const topSuggested = factoringCandidates.find(
                (c) => c.isSuggested,
              );
              if (!topSuggested) return null;
              const isSelected = links.some(
                (l) => l.key === topSuggested.id,
              );
              const merma = topSuggested.expectedDeposit - txAmountAbs;
              const hasMerma = merma > 1;
              return (
                <div
                  className={cn(
                    "rounded-lg border-2 p-4 transition-colors",
                    isSelected
                      ? "border-status-ok-border bg-status-ok-soft/30"
                      : "border-primary/60 bg-primary/[0.06]",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 pt-0.5">
                      {isSelected ? (
                        <CheckCircle2 className="h-5 w-5 text-status-ok-fg" />
                      ) : (
                        <Layers className="h-5 w-5 text-primary" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="brand" className="text-xs">
                          Sugerencia · {topSuggested.confidence}% coincidencia
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {topSuggested.factoringCompanyName}
                        </Badge>
                        {topSuggested.expectedDepositSource ===
                        "simulation" ? (
                          <Badge
                            variant="outline"
                            className="text-xs bg-status-ok-soft text-status-ok-fg border-status-ok-border"
                          >
                            desde PDF
                          </Badge>
                        ) : null}
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          Cesión {topSuggested.code}
                          {topSuggested.dteFolio
                            ? ` · Factura ${topSuggested.dteFolio}`
                            : ""}
                        </p>
                        {topSuggested.dteReceiverName ? (
                          <p className="text-xs text-muted-foreground truncate">
                            {topSuggested.dteReceiverName}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="text-xs text-muted-foreground">
                          Cedida{" "}
                          {format(
                            new Date(topSuggested.fechaCesion),
                            "dd MMM yyyy",
                            { locale: es },
                          )}
                          {" · Esperado "}
                          <span className="font-mono text-foreground">
                            {fmtCLP.format(topSuggested.expectedDeposit)}
                          </span>
                        </div>
                        {!isSelected ? (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => toggleFactoring(topSuggested)}
                            className="shrink-0"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                            Usar esta cesión
                          </Button>
                        ) : (
                          <span className="text-xs text-status-ok-fg font-medium">
                            Seleccionada · revisá el monto abajo
                          </span>
                        )}
                      </div>
                      {hasMerma ? (
                        <p className="text-xs text-status-warn-fg bg-status-warn-soft/40 border border-status-warn-border rounded px-2 py-1">
                          El banco trajo {fmtCLP.format(merma)} menos que el
                          PDF. Hoy la merma queda sin imputar contablemente
                          al conciliar la cesión — se contabilizará desde la
                          próxima versión.
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })()}

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

              {/* Buscador siempre visible — el usuario no debe abrir
                  "Filtrar" para tipear un folio / cliente / instalación. */}
              <div className="relative mb-3">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por folio, cliente o RUT…"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  className="h-11 sm:h-9 pl-8 text-base sm:text-sm"
                />
              </div>

              {showFilters && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 mb-3 space-y-2.5">
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
                      className="h-11 sm:h-9 text-sm"
                    />
                    <Input
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                      className="h-11 sm:h-9 text-sm"
                    />
                  </div>
                  <Select
                    value={filterDirection}
                    onValueChange={(v) =>
                      setFilterDirection(v as "all" | "ISSUED" | "RECEIVED")
                    }
                  >
                    <SelectTrigger className="h-11 sm:h-9 text-sm">
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
                  <p className="text-xs font-mono uppercase tracking-wide text-primary">
                    Cesiones a factoring ({factoringCandidates.length})
                  </p>
                  <ul className="space-y-2">
                    {factoringCandidates.map((c) => {
                      const selected = links.some((l) => l.key === c.id);
                      const suggested = c.isSuggested ?? false;
                      const confidence = c.confidence ?? 0;
                      const signals = c.matchSignals ?? [];
                      return (
                        <li
                          key={c.id}
                          className={cn(
                            "flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                            selected
                              ? "border-primary bg-primary/5"
                              : suggested
                                ? "border-primary/50 bg-primary/[0.04]"
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
                              {suggested ? (
                                <>
                                  <Badge variant="brand" className="text-xs">
                                    Sugerido
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {confidence}% de coincidencia
                                  </span>
                                </>
                              ) : null}
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
                            {signals.length > 0 ? (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {signals.map((sig) => (
                                  <Tag key={sig} variant="neutral" size="sm">
                                    {FACTORING_SIGNAL_LABELS[sig] ?? sig}
                                  </Tag>
                                ))}
                              </div>
                            ) : null}
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

          </div>
        )}

        {tab === "manual" && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Categorizá este movimiento sin vincular a una factura. Útil para
              comisiones, intereses, transferencias entre cuentas, etc.
            </p>
            <div className="space-y-1.5">
              <Label>Cuenta contable *</Label>
              <AccountPlanCombobox
                items={groupAccounts(
                  accountPlans,
                  tx && tx.amount > 0 ? "income" : "expense"
                ).flatMap((g) => g.items)}
                value={manualAccountId}
                onChange={setManualAccountId}
                placeholder="Buscar por código o nombre…"
                emptyLabel="Seleccionar cuenta"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="manual-date">Fecha *</Label>
                <Input
                  id="manual-date"
                  type="date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  className="h-11 sm:h-9"
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
                    className="font-mono h-11 sm:h-9 pl-5"
                    style={{ fontSize: 16 }}
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
                className="h-11 sm:h-9 text-base sm:text-sm"
              />
            </div>
            <CashflowImpactIndicator
              accountPlanId={manualAccountId || null}
              amount={tx?.amount ?? 0}
              transactionDate={manualDate}
            />
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <Button
                onClick={handleAddManualLine}
                size="sm"
                className="h-10 sm:h-9 w-full sm:w-auto"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Agregar línea
              </Button>
              {manualAccountId && tx && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSaveAsRuleOpen(true)}
                  className="h-10 sm:h-9 w-full sm:w-auto"
                >
                  <Sparkles className="h-4 w-4 mr-1.5" />
                  Guardar como regla
                </Button>
              )}
            </div>
          </div>
        )}
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
        {tx && (
          <SaveAsRuleModal
            open={saveAsRuleOpen}
            onOpenChange={setSaveAsRuleOpen}
            sourceTx={{
              id: tx.id,
              description: tx.description,
              reference: tx.reference,
              amount: tx.amount,
            }}
            accountPlans={accountPlans}
            preselectedAccountId={manualAccountId || null}
            detectedRut={
              // Extracción local rápida del RUT visible en la descripción/ref.
              ((): string | null => {
                const extract = (text: string | null): string | null => {
                  if (!text) return null;
                  const m = text.match(/\d{1,2}\.?\d{3}\.?\d{3}-?[\dKk]/);
                  return m ? m[0] : null;
                };
                return extract(tx.description) ?? extract(tx.reference);
              })()
            }
            onCreated={(_ruleId, ruleName, historicalCount) => {
              toast.success(
                `Regla "${ruleName}" creada${
                  historicalCount > 0
                    ? ` · ${historicalCount} movimientos históricos procesados`
                    : ""
                }`,
              );
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

interface CashflowImpactProps {
  accountPlanId: string | null;
  /** Monto con signo (positivo = ingreso, negativo = egreso). */
  amount: number;
  /** YYYY-MM-DD. */
  transactionDate: string;
}

/**
 * Indicador en vivo: muestra cómo impactará la conciliación manual sobre el
 * flujo de caja. Cuatro estados:
 *   - DTE_PAID: el pago aparecerá vinculado al DTE proyectado.
 *   - MATCHED_OCCURRENCE: se vinculará a un item proyectado existente.
 *   - REALIZED_AGGREGATE: se categoriza pero no calza con item proyectado,
 *     queda como realizado agregado del mes.
 *   - UNMAPPED: la cuenta no tiene mapping a categoría → se preguntará al
 *     guardar.
 */
function CashflowImpactIndicator({
  accountPlanId,
  amount,
  transactionDate,
}: CashflowImpactProps) {
  const [loading, setLoading] = useState(false);
  const [impact, setImpact] = useState<{
    status: "DTE_PAID" | "MATCHED_OCCURRENCE" | "REALIZED_AGGREGATE" | "UNMAPPED";
    categoryCode: string | null;
    categoryName: string | null;
    matchedOccurrenceDate: string | null;
  } | null>(null);

  useEffect(() => {
    if (!accountPlanId) {
      setImpact(null);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    fetch(`/api/finance/banking/cashflow-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({ accountPlanId, amount, transactionDate }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) setImpact(j.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [accountPlanId, amount, transactionDate]);

  if (!accountPlanId) return null;
  if (loading) {
    return (
      <div className="rounded-md border border-ds-border-subtle bg-ds-surface-2 px-3 py-2 text-[12px] text-ds-text-3 flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Calculando impacto en flujo de caja…
      </div>
    );
  }
  if (!impact) return null;

  const isOk =
    impact.status === "DTE_PAID" || impact.status === "MATCHED_OCCURRENCE";
  const isWarn = impact.status === "REALIZED_AGGREGATE";
  const isDanger = impact.status === "UNMAPPED";

  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 text-[12.5px] flex items-start gap-2",
        isOk &&
          "border-status-ok-border bg-status-ok-soft text-status-ok-fg",
        isWarn &&
          "border-status-warn-border bg-status-warn-soft text-status-warn-fg",
        isDanger &&
          "border-status-danger-border bg-status-danger-soft text-status-danger-fg",
      )}
    >
      {isOk && <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />}
      {isWarn && <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />}
      {isDanger && <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
      <div className="min-w-0 flex-1">
        {impact.status === "DTE_PAID" && (
          <span>Aparecerá en flujo de caja como pago de la factura vinculada.</span>
        )}
        {impact.status === "MATCHED_OCCURRENCE" && (
          <span>
            Se vinculará al item proyectado en <b>{impact.categoryName}</b>
            {impact.matchedOccurrenceDate &&
              ` del ${impact.matchedOccurrenceDate}`}
            .
          </span>
        )}
        {impact.status === "REALIZED_AGGREGATE" && (
          <span>
            Se categorizará como <b>{impact.categoryName}</b>, pero no hay un
            ítem proyectado en esa fecha. Quedará sumado al realizado del mes
            sin aparecer como ítem individual.
          </span>
        )}
        {impact.status === "UNMAPPED" && (
          <span>
            La cuenta seleccionada no está mapeada a una categoría de flujo de
            caja. Se te preguntará al guardar.
          </span>
        )}
      </div>
    </div>
  );
}
