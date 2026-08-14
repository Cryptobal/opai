"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ChevronDown, ChevronRight, Loader2, Search, X,
} from "lucide-react";
import { Surface, Spinner, Tag } from "@/components/opai-ds";
import { toast } from "sonner";
import type { BandejaGroup, BandejaGroupItem } from "@/modules/finance/flow-v3/unmatched-count";
import {
  MERCHANT_NEEDLE_MIN_LEN,
  isForbiddenNeedle,
  normalizeMerchantText,
} from "@/modules/finance/banking/merchant-key";
import { fmtClp, fmtShortDate } from "./format";
import {
  alsoRegisteredAsLabel,
  fetchBandejaSuggestionsBatch,
  formatGuardiaStateBadge,
  formatSuggestionDestino,
  formatSuggestionMotivo,
  identityKindLabel,
  suggestionHasFlowDestination,
  type BandejaTxSuggestionResult,
  type ClassifySuggestionSource,
} from "./bandeja-suggestions";

export interface BandejaFlowRowOption {
  id: string;
  name: string;
  section: string;
  hasAccounts: boolean;
}

export interface BandejaApplyItem {
  bankTransactionId: string;
  flowRowId: string;
  source: ClassifySuggestionSource | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  section: string;
  groups: BandejaGroup[];
  flowRows: BandejaFlowRowOption[];
  /** Asignación manual de un grupo (o subconjunto) a una fila. */
  onClassifyGroup: (args: {
    group: BandejaGroup;
    flowRowId: string;
    needle: string | null;
    /** Si se omite, se clasifican todos los ítems del grupo. */
    bankTransactionIds?: string[];
    /** Forzar aprendizaje; default según kind del grupo. */
    learnRule?: "RUT" | "DESCRIPTION" | "NONE";
  }) => Promise<void>;
  /** Aceptar sugerencias FLOW_ROW ya marcadas. */
  onApplySuggestions: (items: BandejaApplyItem[]) => Promise<void>;
  /** Descartar de la bandeja (excluye del flujo; el movimiento sigue en Bancos). */
  onDismiss?: (bankTransactionIds: string[]) => Promise<void>;
  /** Abrir diálogo de cuentas para un renglón destino. */
  onAssignAccounts?: (flowRowId: string) => void;
  /** Abrir alta de fila en la sección. */
  onCreateRow?: () => void;
}

const KIND_BADGE: Record<BandejaGroup["kind"], string> = {
  RUT: "RUT",
  MERCHANT: "Glosa",
  OTHER: "Sin patrón",
};

function GroupAssignPanel({
  group,
  flowRows,
  busy,
  learnMode,
  onConfirm,
  onCancel,
}: {
  group: BandejaGroup;
  flowRows: BandejaFlowRowOption[];
  busy: boolean;
  learnMode: boolean;
  onConfirm: (flowRowId: string, needle: string | null) => void;
  onCancel: () => void;
}) {
  const [needle, setNeedle] = useState(group.needle ?? "");

  const needleNorm = normalizeMerchantText(needle).trim();
  const needleOk =
    group.kind !== "MERCHANT" ||
    (needleNorm.length >= MERCHANT_NEEDLE_MIN_LEN && !isForbiddenNeedle(needleNorm));

  return (
    <Surface elevation={1} padding="sm" className="space-y-2">
      <p className="text-[12px] font-medium text-ds-text-2">
        {learnMode ? "Crear regla y clasificar" : "Clasificar una sola vez"}
      </p>
      {group.kind === "RUT" && group.needle && (
        <p className="text-[12px] text-ds-text-3">
          {learnMode
            ? `Se creará la regla: RUT es ${group.label}`
            : "Sin aprender regla — solo estos movimientos."}
        </p>
      )}
      {group.kind === "MERCHANT" && (
        <div className="space-y-1">
          <label className="text-[12px] text-ds-text-3" htmlFor={`needle-${group.key}`}>
            {learnMode
              ? "Regla: la descripción contiene"
              : "Patrón de glosa (solo si creás regla)"}
          </label>
          <Input
            id={`needle-${group.key}`}
            value={needle}
            onChange={(e) => setNeedle(e.target.value)}
            className="h-10 sm:h-9"
            disabled={busy || !learnMode}
          />
          {learnMode && (
            <p className="text-[12px] text-ds-text-3">
              Se creará la regla: descripción contiene «{needleNorm || "…"}»
            </p>
          )}
          {learnMode && !needleOk && (
            <p className="text-[12px] text-status-warn-fg">
              Mínimo {MERCHANT_NEEDLE_MIN_LEN} caracteres; evitá términos genéricos.
            </p>
          )}
        </div>
      )}
      {group.kind === "OTHER" && (
        <p className="text-[12px] text-ds-text-3">
          Sin patrón estable — se clasifica una sola vez, no se crea regla.
        </p>
      )}
      <ul className="max-h-48 space-y-0.5 overflow-y-auto">
        {flowRows.map((row) => {
          const disabled =
            busy ||
            !row.hasAccounts ||
            (learnMode && group.kind === "MERCHANT" && !needleOk);
          return (
            <li key={row.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  onConfirm(
                    row.id,
                    group.kind === "MERCHANT"
                      ? needleNorm
                      : group.kind === "RUT"
                        ? group.needle
                        : null,
                  )
                }
                className="flex min-h-11 w-full flex-col items-start justify-center rounded-md px-2 text-left text-[13px] text-ds-text-1 hover:bg-ds-surface-2 disabled:opacity-50"
              >
                <span>{row.name}</span>
                {!row.hasAccounts && (
                  <span className="text-[12px] text-status-warn-fg">sin cuenta contable</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={onCancel}
        className="flex min-h-11 w-full items-center justify-center text-[12px] text-ds-text-3"
      >
        Cancelar
      </button>
    </Surface>
  );
}

function CompactSuggestion({
  result,
  flowRow,
}: {
  result: BandejaTxSuggestionResult | undefined;
  flowRow: BandejaFlowRowOption | undefined;
}) {
  const s = result?.suggestion;
  const destino = formatSuggestionDestino(s);
  const motivo = formatSuggestionMotivo(s);
  const hasDest = suggestionHasFlowDestination(s);
  const rowSinCuentas = hasDest && flowRow != null && !flowRow.hasAccounts;

  return (
    <div className="min-w-0">
      <p
        className={
          hasDest
            ? "truncate text-[12px] font-medium text-ds-text-1"
            : "truncate text-[12px] font-medium text-ds-text-3"
        }
      >
        {hasDest ? `→ ${destino}` : "Sin destino"}
      </p>
      <p className="truncate text-[12px] text-ds-text-3" title={motivo}>
        {motivo}
      </p>
      {rowSinCuentas && (
        <p className="text-[12px] text-status-warn-fg">Destino sin cuentas</p>
      )}
    </div>
  );
}

/** Sheet: bandeja compacta estilo inbox (clasificar / regla / descartar). */
export function BandejaGroupList({
  open,
  onOpenChange,
  section,
  groups,
  flowRows,
  onClassifyGroup,
  onApplySuggestions,
  onDismiss,
  onAssignAccounts,
  onCreateRow,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [pickKey, setPickKey] = useState<string | null>(null);
  const [pickLearn, setPickLearn] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [suggestions, setSuggestions] = useState<Map<string, BandejaTxSuggestionResult>>(
    () => new Map(),
  );
  const [loadingIds, setLoadingIds] = useState<Set<string>>(() => new Set());
  const [loadProgress, setLoadProgress] = useState<{ loaded: number; total: number } | null>(
    null,
  );
  const [applying, setApplying] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [onlyNoDest, setOnlyNoDest] = useState(false);
  const [query, setQuery] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const flowRowById = useMemo(
    () => new Map(flowRows.map((r) => [r.id, r])),
    [flowRows],
  );

  const title = section === "INGRESOS" ? "Clasificar ingresos" : "Clasificar egresos";
  const totalClp = useMemo(
    () => groups.reduce((s, g) => s + g.totalClp, 0),
    [groups],
  );
  const itemCount = useMemo(
    () => groups.reduce((s, g) => s + g.items.length, 0),
    [groups],
  );

  const allIds = useMemo(() => {
    const ids: string[] = [];
    for (const g of groups) {
      for (const it of g.items) ids.push(it.bankTransactionId);
    }
    return [...new Set(ids)];
  }, [groups]);

  const itemById = useMemo(() => {
    const m = new Map<string, BandejaGroupItem & { group: BandejaGroup }>();
    for (const g of groups) {
      for (const it of g.items) {
        m.set(it.bankTransactionId, { ...it, group: g });
      }
    }
    return m;
  }, [groups]);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      setSuggestions(new Map());
      setLoadingIds(new Set());
      setLoadProgress(null);
      setSelected(new Set());
      setPickKey(null);
      setExpanded(new Set());
      setOnlyNoDest(false);
      setQuery("");
      return;
    }
    if (allIds.length === 0) return;

    const ac = new AbortController();
    abortRef.current = ac;
    setLoadingIds(new Set(allIds));
    setLoadProgress({ loaded: 0, total: allIds.length });

    void (async () => {
      try {
        const map = await fetchBandejaSuggestionsBatch(allIds, {
          signal: ac.signal,
          onChunk: (loaded, total) => setLoadProgress({ loaded, total }),
        });
        if (ac.signal.aborted) return;
        setSuggestions(map);
      } catch (err) {
        if (ac.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) {
          return;
        }
        const message =
          err instanceof Error ? err.message : "Error al cargar sugerencias";
        toast.error(message);
      } finally {
        if (!ac.signal.aborted) {
          setLoadingIds(new Set());
          setLoadProgress(null);
        }
      }
    })();

    return () => {
      ac.abort();
    };
  }, [open, allIds]);

  const groupHasDest = useCallback(
    (g: BandejaGroup) =>
      g.items.some((it) =>
        suggestionHasFlowDestination(suggestions.get(it.bankTransactionId)?.suggestion),
      ),
    [suggestions],
  );

  const visibleGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups.filter((g) => {
      if (onlyNoDest && groupHasDest(g)) return false;
      if (!q) return true;
      if (g.label.toLowerCase().includes(q)) return true;
      return g.items.some((it) => it.label.toLowerCase().includes(q));
    });
  }, [groups, onlyNoDest, query, groupHasDest]);

  const suggestableIds = useMemo(() => {
    const ids: string[] = [];
    for (const id of allIds) {
      const r = suggestions.get(id);
      if (suggestionHasFlowDestination(r?.suggestion)) ids.push(id);
    }
    return ids;
  }, [allIds, suggestions]);

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const acceptSuggestions = () => {
    if (suggestableIds.length === 0) {
      toast.message("No hay destinos propuestos para aceptar");
      return;
    }
    setSelected(new Set(suggestableIds));
    toast.success(
      `${suggestableIds.length} sugerencia${suggestableIds.length === 1 ? "" : "s"} marcada${suggestableIds.length === 1 ? "" : "s"} — revisá y clasifica`,
    );
  };

  const selectionStats = useMemo(() => {
    let monto = 0;
    let withDest = 0;
    for (const id of selected) {
      const it = itemById.get(id);
      if (it) monto += it.monto;
      if (suggestionHasFlowDestination(suggestions.get(id)?.suggestion)) withDest += 1;
    }
    return { count: selected.size, monto, withDest };
  }, [selected, itemById, suggestions]);

  const assign = async (
    group: BandejaGroup,
    flowRowId: string,
    needle: string | null,
    opts: { bankTransactionIds?: string[]; learnRule?: "RUT" | "DESCRIPTION" | "NONE" },
  ) => {
    setBusyKey(group.key);
    try {
      await onClassifyGroup({
        group,
        flowRowId,
        needle,
        bankTransactionIds: opts.bankTransactionIds,
        learnRule: opts.learnRule,
      });
      setPickKey(null);
      setSelected(new Set());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al clasificar";
      toast.error(message);
    } finally {
      setBusyKey(null);
    }
  };

  const applySelectedSuggestions = useCallback(async () => {
    const items: BandejaApplyItem[] = [];
    for (const id of selected) {
      const r = suggestions.get(id);
      if (!suggestionHasFlowDestination(r?.suggestion)) continue;
      items.push({
        bankTransactionId: id,
        flowRowId: r.suggestion.flowRowId,
        source: r.suggestion.source,
      });
    }
    if (items.length === 0) {
      toast.message("Seleccioná movimientos con destino propuesto");
      return;
    }
    setApplying(true);
    try {
      await onApplySuggestions(items);
      setSelected(new Set());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al clasificar";
      toast.error(message);
    } finally {
      setApplying(false);
    }
  }, [selected, suggestions, onApplySuggestions]);

  const dismissIds = useCallback(
    async (ids: string[]) => {
      if (!onDismiss || ids.length === 0) return;
      setDismissing(true);
      try {
        await onDismiss(ids);
        setSelected((prev) => {
          const next = new Set(prev);
          for (const id of ids) next.delete(id);
          return next;
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error al descartar";
        toast.error(message);
      } finally {
        setDismissing(false);
      }
    },
    [onDismiss],
  );

  const selectionGroup = useMemo((): BandejaGroup | null => {
    const keys = new Set<string>();
    let first: BandejaGroup | null = null;
    for (const id of selected) {
      const it = itemById.get(id);
      if (!it) continue;
      keys.add(it.group.key);
      if (!first) first = it.group;
    }
    if (keys.size !== 1 || !first) return null;
    return first;
  }, [selected, itemById]);

  const openPickForSelection = (learn: boolean) => {
    if (selected.size === 0) return;
    const g = selectionGroup;
    if (!g) {
      toast.error(
        learn
          ? "Para crear una regla, seleccioná movimientos del mismo grupo (mismo RUT o glosa)."
          : "Seleccioná movimientos de un solo grupo para asignar a fila.",
      );
      return;
    }
    if (learn && g.kind === "OTHER") {
      toast.error("Este grupo no tiene un patrón estable para crear una regla.");
      return;
    }
    setExpanded((prev) => new Set(prev).add(g.key));
    setPickKey(g.key);
    setPickLearn(learn);
  };

  const classifyGroupWithSuggestion = async (g: BandejaGroup) => {
    const withDest = g.items.filter((it) =>
      suggestionHasFlowDestination(suggestions.get(it.bankTransactionId)?.suggestion),
    );
    if (withDest.length === 0) {
      setExpanded((prev) => new Set(prev).add(g.key));
      setPickKey(g.key);
      setPickLearn(false);
      return;
    }
    const byRow = new Map<string, string[]>();
    const sourceByRow = new Map<string, ClassifySuggestionSource | null>();
    for (const it of withDest) {
      const s = suggestions.get(it.bankTransactionId)!.suggestion;
      if (!suggestionHasFlowDestination(s)) continue;
      const list = byRow.get(s.flowRowId) ?? [];
      list.push(it.bankTransactionId);
      byRow.set(s.flowRowId, list);
      if (!sourceByRow.has(s.flowRowId)) sourceByRow.set(s.flowRowId, s.source);
    }
    setBusyKey(g.key);
    try {
      const items: BandejaApplyItem[] = [];
      for (const [flowRowId, ids] of byRow) {
        const source = sourceByRow.get(flowRowId) ?? null;
        for (const id of ids) {
          items.push({ bankTransactionId: id, flowRowId, source });
        }
      }
      await onApplySuggestions(items);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al clasificar";
      toast.error(message);
    } finally {
      setBusyKey(null);
    }
  };

  const isLoading = loadingIds.size > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex h-[100dvh] max-h-[100dvh] flex-col gap-0 rounded-none p-0 sm:h-auto sm:max-h-[85vh] sm:rounded-t-2xl"
      >
        <div className="mx-auto mt-2 hidden h-1 w-10 rounded-full bg-ds-border-default sm:block" aria-hidden />
        <SheetHeader className="shrink-0 space-y-3 px-5 pt-4 pb-3 text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="text-base text-ds-text-1">{title}</SheetTitle>
              <SheetDescription className="text-[13px] text-ds-text-3">
                {groups.length === 0
                  ? "Sin movimientos pendientes"
                  : `${itemCount} mov · ${fmtClp(totalClp)} en cartola`}
                {loadProgress && (
                  <span className="ml-1">
                    · sugerencias {loadProgress.loaded}/{loadProgress.total}
                  </span>
                )}
              </SheetDescription>
            </div>
            {onCreateRow && (
              <button
                type="button"
                onClick={onCreateRow}
                className="shrink-0 text-[12px] font-medium text-ds-text-2 underline-offset-2 hover:underline"
              >
                Nueva fila
              </button>
            )}
          </div>

          {groups.length > 0 && (
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <button
                type="button"
                disabled={isLoading || suggestableIds.length === 0}
                onClick={acceptSuggestions}
                className="flex min-h-11 items-center justify-center rounded-lg border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] font-medium text-ds-text-1 hover:bg-ds-surface-2 disabled:opacity-50 sm:min-h-9"
              >
                {isLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner size="sm" /> Cargando…
                  </span>
                ) : (
                  `Aceptar ${suggestableIds.length} sugerencia${suggestableIds.length === 1 ? "" : "s"}`
                )}
              </button>
              <button
                type="button"
                onClick={() => setOnlyNoDest((v) => !v)}
                className={`flex min-h-11 items-center justify-center rounded-lg border px-3 text-[13px] font-medium sm:min-h-9 ${
                  onlyNoDest
                    ? "border-status-warn-border bg-status-warn-soft text-status-warn-fg"
                    : "border-ds-border-default bg-ds-surface-1 text-ds-text-2 hover:bg-ds-surface-2"
                }`}
              >
                Solo sin destino
              </button>
              <div className="relative min-w-0 flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ds-text-4" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar…"
                  className="h-10 pl-8 sm:h-9"
                />
              </div>
            </div>
          )}
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto border-t border-ds-border-subtle">
          {visibleGroups.length === 0 ? (
            <p className="px-5 py-6 text-[13px] text-ds-text-4">
              {groups.length === 0
                ? "No hay movimientos pendientes."
                : "Ningún grupo coincide con el filtro."}
            </p>
          ) : (
            <ul className="ds-list-cascade divide-y divide-ds-border-subtle">
              {visibleGroups.map((g) => {
                const isOpen = expanded.has(g.key);
                const picking = pickKey === g.key;
                const groupLoading = g.items.some((it) =>
                  loadingIds.has(it.bankTransactionId),
                );
                const sample = g.items
                  .map((it) => suggestions.get(it.bankTransactionId))
                  .find(Boolean);
                const displayName =
                  sample?.identity.name?.trim() || g.label;
                const stateChip =
                  sample?.identity.kind === "guardia" && sample.identity.guardiaState
                    ? formatGuardiaStateBadge(sample.identity.guardiaState)
                    : sample
                      ? identityKindLabel(sample.identity.kind)
                      : null;
                const destSample = g.items
                  .map((it) => suggestions.get(it.bankTransactionId))
                  .find((r) => suggestionHasFlowDestination(r?.suggestion));
                const destFlowId =
                  destSample?.suggestion &&
                  suggestionHasFlowDestination(destSample.suggestion)
                    ? destSample.suggestion.flowRowId
                    : undefined;
                const destRow = destFlowId ? flowRowById.get(destFlowId) : undefined;
                const hasDest = !!destSample;
                const conflict =
                  (sample?.identity.alsoRegisteredAs?.length ?? 0) > 1
                    ? sample!.identity.alsoRegisteredAs
                    : null;

                return (
                  <li key={g.key} className="bg-ds-surface-1">
                    <div className="flex items-stretch gap-1 px-3 py-2 sm:px-5">
                      <button
                        type="button"
                        onClick={() => toggle(g.key)}
                        className="flex min-h-11 min-w-0 flex-1 items-center gap-2 py-1 text-left hover:bg-ds-surface-2 sm:min-h-10"
                        aria-expanded={isOpen}
                      >
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-ds-text-3" aria-hidden />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-ds-text-3" aria-hidden />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-[13px] font-medium text-ds-text-1">
                              {displayName}
                            </span>
                            <Tag size="sm" variant="neutral">{KIND_BADGE[g.kind]}</Tag>
                            {groupLoading ? (
                              <span className="inline-flex items-center gap-1 text-[12px] text-ds-text-3">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                              </span>
                            ) : (
                              stateChip && (
                                <Tag size="sm" variant="info">{stateChip}</Tag>
                              )
                            )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="text-[12px] text-ds-text-3">
                              {g.items.length} mov
                            </span>
                            <span className="tabular-nums text-[13px] text-ds-text-2">
                              {fmtClp(g.totalClp)}
                            </span>
                            {!isOpen && (
                              <span className="min-w-0 truncate text-[12px] text-ds-text-3">
                                {hasDest
                                  ? `→ ${formatSuggestionDestino(destSample?.suggestion)}`
                                  : "Sin destino"}
                              </span>
                            )}
                          </div>
                          {conflict && (
                            <p className="mt-0.5 text-[12px] text-status-warn-fg">
                              También como {alsoRegisteredAsLabel(conflict)}
                            </p>
                          )}
                        </div>
                      </button>

                      <div className="flex shrink-0 flex-col items-end justify-center gap-1 sm:flex-row sm:items-center">
                        <Button
                          type="button"
                          size="sm"
                          variant={hasDest ? "default" : "outline"}
                          className="h-10 min-w-[5.5rem] px-2 text-[12px] sm:h-9"
                          disabled={busyKey === g.key || dismissing}
                          onClick={() => void classifyGroupWithSuggestion(g)}
                        >
                          {busyKey === g.key ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : hasDest ? (
                            "Clasificar"
                          ) : (
                            "Elegir fila"
                          )}
                        </Button>
                        {g.kind !== "OTHER" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-10 min-w-[4.5rem] px-2 text-[12px] sm:h-9"
                            disabled={busyKey === g.key || dismissing}
                            onClick={() => {
                              setExpanded((prev) => new Set(prev).add(g.key));
                              setPickKey(g.key);
                              setPickLearn(true);
                            }}
                          >
                            Regla
                          </Button>
                        )}
                        {onDismiss && (
                          <button
                            type="button"
                            className="flex h-10 w-10 items-center justify-center rounded-md text-ds-text-3 hover:bg-ds-surface-2 hover:text-ds-text-1 sm:h-9 sm:w-9"
                            title="Descartar de la bandeja (sigue en Bancos)"
                            aria-label={`Descartar grupo ${displayName}`}
                            disabled={dismissing || busyKey === g.key}
                            onClick={() =>
                              void dismissIds(g.items.map((i) => i.bankTransactionId))
                            }
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {isOpen && (
                      <div className="space-y-2 px-5 pb-3">
                        {!picking && destRow && onAssignAccounts && !destRow.hasAccounts && (
                          <button
                            type="button"
                            onClick={() => onAssignAccounts(destRow.id)}
                            className="text-[12px] font-medium text-status-warn-fg underline-offset-2 hover:underline"
                          >
                            Asignar cuentas al destino
                          </button>
                        )}
                        <ul className="space-y-1">
                          {g.items.map((it) => {
                            const result = suggestions.get(it.bankTransactionId);
                            const flowRowId =
                              result?.suggestion?.kind === "FLOW_ROW"
                                ? result.suggestion.flowRowId
                                : undefined;
                            const flowRow = flowRowId
                              ? flowRowById.get(flowRowId)
                              : undefined;
                            return (
                              <li
                                key={`${it.bankTransactionId}:${it.weekStart}`}
                                className="rounded-md bg-ds-surface-2 px-2 py-2 sm:px-3"
                              >
                                <div className="flex gap-2">
                                  <label className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center">
                                    <input
                                      type="checkbox"
                                      checked={selected.has(it.bankTransactionId)}
                                      onChange={() => toggleSelected(it.bankTransactionId)}
                                      className="h-5 w-5 accent-primary"
                                      aria-label={`Seleccionar movimiento del ${fmtShortDate(it.fecha)}`}
                                    />
                                  </label>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-baseline justify-between gap-2">
                                      <span className="text-[12px] text-ds-text-3">
                                        {fmtShortDate(it.fecha)}
                                      </span>
                                      <span className="tabular-nums text-[13px] text-ds-text-1">
                                        {fmtClp(it.monto)}
                                      </span>
                                    </div>
                                    <p
                                      className="mt-0.5 truncate text-[12px] text-ds-text-3"
                                      title={it.label}
                                    >
                                      {it.label}
                                    </p>
                                    <div className="mt-1 sm:hidden">
                                      <CompactSuggestion result={result} flowRow={flowRow} />
                                    </div>
                                  </div>
                                  <div className="hidden min-w-[9rem] max-w-[12rem] shrink-0 sm:block">
                                    <CompactSuggestion result={result} flowRow={flowRow} />
                                  </div>
                                  {onDismiss && (
                                    <button
                                      type="button"
                                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-ds-text-4 hover:bg-ds-surface-3 hover:text-ds-text-1 sm:h-9 sm:w-9"
                                      title="Descartar este movimiento"
                                      aria-label="Descartar movimiento"
                                      disabled={dismissing}
                                      onClick={() => void dismissIds([it.bankTransactionId])}
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                        {picking && (
                          <GroupAssignPanel
                            group={g}
                            flowRows={flowRows}
                            busy={busyKey === g.key}
                            learnMode={pickLearn}
                            onConfirm={(flowRowId, needle) => {
                              const idsFromSelection = [...selected].filter((id) =>
                                g.items.some((it) => it.bankTransactionId === id),
                              );
                              const bankTransactionIds =
                                idsFromSelection.length > 0
                                  ? idsFromSelection
                                  : undefined;
                              const learnRule: "RUT" | "DESCRIPTION" | "NONE" = pickLearn
                                ? g.kind === "RUT"
                                  ? "RUT"
                                  : g.kind === "MERCHANT"
                                    ? "DESCRIPTION"
                                    : "NONE"
                                : "NONE";
                              void assign(g, flowRowId, needle, {
                                bankTransactionIds,
                                learnRule,
                              });
                            }}
                            onCancel={() => setPickKey(null)}
                          />
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {selectionStats.count > 0 && (
          <div className="shrink-0 border-t border-ds-border-subtle bg-ds-surface-1 px-5 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[13px] text-ds-text-2">
                {selectionStats.count} seleccionados · {fmtClp(selectionStats.monto)}
              </p>
              <div className="flex flex-wrap gap-2">
                {selectionStats.withDest > 0 && (
                  <button
                    type="button"
                    disabled={applying || dismissing}
                    onClick={() => void applySelectedSuggestions()}
                    className="flex min-h-11 items-center justify-center rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {applying
                      ? "Clasificando…"
                      : `Clasificar ${selectionStats.withDest}`}
                  </button>
                )}
                <button
                  type="button"
                  disabled={applying || dismissing || !!busyKey}
                  onClick={() => openPickForSelection(false)}
                  className="flex min-h-11 items-center justify-center rounded-lg border border-ds-border-default px-3 text-[13px] font-medium text-ds-text-1 hover:bg-ds-surface-2 disabled:opacity-50"
                >
                  Asignar a fila
                </button>
                <button
                  type="button"
                  disabled={applying || dismissing || !!busyKey}
                  onClick={() => openPickForSelection(true)}
                  className="flex min-h-11 items-center justify-center rounded-lg border border-ds-border-default px-3 text-[13px] font-medium text-ds-text-1 hover:bg-ds-surface-2 disabled:opacity-50"
                >
                  Crear regla
                </button>
                {onDismiss && (
                  <button
                    type="button"
                    disabled={applying || dismissing}
                    onClick={() => void dismissIds([...selected])}
                    className="flex min-h-11 items-center justify-center rounded-lg border border-status-danger-border px-3 text-[13px] font-medium text-status-danger-fg hover:bg-status-danger-soft disabled:opacity-50"
                  >
                    {dismissing ? "Descartando…" : "Descartar"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
