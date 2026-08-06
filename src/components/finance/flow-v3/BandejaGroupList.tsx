"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
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
  hasCategory: boolean;
  categoryId: string | null;
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
  /** Abrir diálogo de categoría para una fila destino. */
  onAssignCategory?: (flowRowId: string) => void;
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
  /** Si true, enfatiza creación de regla (RUT/DESCRIPTION). */
  learnMode: boolean;
  onConfirm: (flowRowId: string, needle: string | null) => void;
  onCancel: () => void;
}) {
  const [needle, setNeedle] = useState(group.needle ?? "");
  const categoryCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of flowRows) {
      if (!r.categoryId) continue;
      m.set(r.categoryId, (m.get(r.categoryId) ?? 0) + 1);
    }
    return m;
  }, [flowRows]);

  const needleNorm = normalizeMerchantText(needle).trim();
  const needleOk =
    group.kind !== "MERCHANT" ||
    (needleNorm.length >= MERCHANT_NEEDLE_MIN_LEN && !isForbiddenNeedle(needleNorm));

  return (
    <Surface elevation={1} padding="sm" className="space-y-2">
      <p className="text-[12px] text-ds-text-3">
        {learnMode ? "Elegir fila y crear regla" : "Elegir fila destino"}
      </p>
      {group.kind === "RUT" && group.needle && (
        <p className="text-[12px] text-ds-text-3">
          {learnMode
            ? `Se creará la regla: RUT es ${group.label}`
            : "Clasificación puntual (sin aprender regla)."}
        </p>
      )}
      {group.kind === "MERCHANT" && (
        <div className="space-y-1">
          <label className="text-[12px] text-ds-text-3" htmlFor={`needle-${group.key}`}>
            {learnMode
              ? "Regla a aprender: la descripción contiene"
              : "Patrón de glosa (solo si aprendés regla)"}
          </label>
          <Input
            id={`needle-${group.key}`}
            value={needle}
            onChange={(e) => setNeedle(e.target.value)}
            className="h-10 sm:h-9"
            disabled={busy}
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
          Estos movimientos se clasifican una sola vez; no se creará una regla.
        </p>
      )}
      {flowRows.map((row) => {
        const shared =
          row.categoryId != null && (categoryCounts.get(row.categoryId) ?? 0) > 1;
        const disabled =
          busy ||
          !row.hasCategory ||
          (learnMode && group.kind === "MERCHANT" && !needleOk);
        return (
          <div key={row.id}>
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
              {!row.hasCategory && (
                <span className="text-[12px] text-status-warn-fg">sin cuenta contable</span>
              )}
            </button>
            {shared && row.hasCategory && (
              <p className="px-2 pb-1 text-[12px] text-status-warn-fg">
                Otra fila comparte esta categoría; el movimiento puede aparecer en ella.
              </p>
            )}
          </div>
        );
      })}
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

function SuggestionBlock({
  result,
  flowRow,
  onAssignCategory,
  onCreateRow,
}: {
  result: BandejaTxSuggestionResult | undefined;
  flowRow: BandejaFlowRowOption | undefined;
  onAssignCategory?: (flowRowId: string) => void;
  onCreateRow?: () => void;
}) {
  const s = result?.suggestion;
  const destino = formatSuggestionDestino(s);
  const motivo = formatSuggestionMotivo(s);
  const hasDest = suggestionHasFlowDestination(s);
  const rowSinCat = hasDest && flowRow != null && !flowRow.hasCategory;
  const conflict =
    (result?.identity.alsoRegisteredAs?.length ?? 0) > 1
      ? result!.identity.alsoRegisteredAs
      : null;

  return (
    <div className="mt-1 space-y-1 sm:mt-0">
      <p
        className={
          hasDest
            ? "text-[12px] font-medium text-ds-text-1"
            : "text-[12px] font-medium text-ds-text-3"
        }
      >
        {destino}
      </p>
      <p className="text-[12px] text-ds-text-3">{motivo}</p>
      {rowSinCat && hasDest && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[12px] text-status-warn-fg">
            La fila destino no tiene categoría; no puede recibir el movimiento.
          </p>
          {onAssignCategory && (
            <button
              type="button"
              onClick={() => onAssignCategory(s.flowRowId)}
              className="min-h-11 rounded-md px-2 text-[12px] font-medium text-status-warn-fg underline-offset-2 hover:underline sm:min-h-9"
            >
              Asignar categoría
            </button>
          )}
        </div>
      )}
      {!hasDest && s?.kind === "NONE" && onCreateRow && /sin fila|no hay fila/i.test(motivo) && (
        <button
          type="button"
          onClick={onCreateRow}
          className="min-h-11 rounded-md px-2 text-[12px] font-medium text-status-warn-fg underline-offset-2 hover:underline sm:min-h-9"
        >
          Crear fila
        </button>
      )}
      {conflict && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[12px] text-status-warn-fg">
            RUT también registrado como {alsoRegisteredAsLabel(conflict)}.
          </p>
          <button
            type="button"
            onClick={() =>
              toast.message("Revisá los registros", {
                description: `Este RUT aparece como: ${alsoRegisteredAsLabel(conflict)}.`,
              })
            }
            className="min-h-11 rounded-md px-2 text-[12px] font-medium text-status-warn-fg underline-offset-2 hover:underline sm:min-h-9"
          >
            Revisar registros
          </button>
        </div>
      )}
    </div>
  );
}

function MovementRow({
  item,
  selected,
  onToggle,
  result,
  flowRowById,
  onAssignCategory,
  onCreateRow,
}: {
  item: BandejaGroupItem;
  selected: boolean;
  onToggle: () => void;
  result: BandejaTxSuggestionResult | undefined;
  flowRowById: Map<string, BandejaFlowRowOption>;
  onAssignCategory?: (flowRowId: string) => void;
  onCreateRow?: () => void;
}) {
  const flowRowId = result?.suggestion?.kind === "FLOW_ROW"
    ? result.suggestion.flowRowId
    : undefined;
  const flowRow = flowRowId ? flowRowById.get(flowRowId) : undefined;

  return (
    <li className="rounded-md bg-ds-surface-2 px-2 py-2 sm:px-3">
      <div className="flex gap-2">
        <label className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="h-5 w-5 accent-primary"
            aria-label={`Seleccionar movimiento del ${fmtShortDate(item.fecha)}`}
          />
        </label>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[12px] text-ds-text-3">{fmtShortDate(item.fecha)}</span>
            <span className="tabular-nums text-[13px] text-ds-text-1">{fmtClp(item.monto)}</span>
          </div>
          <p className="mt-0.5 truncate text-[12px] text-ds-text-3" title={item.label}>
            {item.label}
          </p>
          {/* Móvil: sugerencia apilada bajo glosa */}
          <div className="sm:hidden">
            <SuggestionBlock
              result={result}
              flowRow={flowRow}
              onAssignCategory={onAssignCategory}
              onCreateRow={onCreateRow}
            />
          </div>
        </div>
        {/* Desktop: sugerencia a la derecha */}
        <div className="hidden min-w-[10rem] max-w-[14rem] shrink-0 sm:block">
          <SuggestionBlock
            result={result}
            flowRow={flowRow}
            onAssignCategory={onAssignCategory}
            onCreateRow={onCreateRow}
          />
        </div>
      </div>
    </li>
  );
}

function GroupHeaderMeta({
  group,
  suggestions,
  loading,
}: {
  group: BandejaGroup;
  suggestions: Map<string, BandejaTxSuggestionResult>;
  loading: boolean;
}) {
  const sample = group.items
    .map((it) => suggestions.get(it.bankTransactionId))
    .find(Boolean);
  const name =
    sample?.identity.name?.trim() ||
    (group.kind === "RUT" ? group.label : group.label);
  const stateChip =
    sample?.identity.kind === "guardia" && sample.identity.guardiaState
      ? formatGuardiaStateBadge(sample.identity.guardiaState)
      : sample
        ? identityKindLabel(sample.identity.kind)
        : null;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
      <span className="min-w-0 truncate text-[13px] text-ds-text-1">{name}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        <Tag size="sm" variant="neutral">{KIND_BADGE[group.kind]}</Tag>
        {loading ? (
          <span className="inline-flex items-center gap-1 text-[12px] text-ds-text-3">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Cargando…
          </span>
        ) : (
          stateChip && (
            <Tag
              size="sm"
              variant={
                sample?.identity.kind === "guardia" &&
                (sample.identity.guardiaState?.terminatedAt ||
                  sample.identity.guardiaState?.lifecycleStatus === "inactivo")
                  ? "warn"
                  : "info"
              }
            >
              {stateChip}
            </Tag>
          )
        )}
      </div>
    </div>
  );
}

/** Sheet: grupos de bandeja con sugerencia por movimiento y aceptación masiva. */
export function BandejaGroupList({
  open,
  onOpenChange,
  section,
  groups,
  flowRows,
  onClassifyGroup,
  onApplySuggestions,
  onAssignCategory,
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
  const abortRef = useRef<AbortController | null>(null);

  const flowRowById = useMemo(
    () => new Map(flowRows.map((r) => [r.id, r])),
    [flowRows],
  );

  const title = section === "INGRESOS" ? "Otros ingresos · cartola" : "Otros egresos · cartola";
  const totalClp = useMemo(
    () => groups.reduce((s, g) => s + g.totalClp, 0),
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

  // Al abrir: cargar sugerencias en lotes de 300.
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
      `${suggestableIds.length} sugerencia${suggestableIds.length === 1 ? "" : "s"} marcada${suggestableIds.length === 1 ? "" : "s"} — revisá y clasificá`,
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

  /** Inferir grupo dominante de la selección para Asignar / Crear regla. */
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

  const isLoading = loadingIds.size > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex h-[100dvh] max-h-[100dvh] flex-col gap-0 rounded-none p-0 sm:h-auto sm:max-h-[85vh] sm:rounded-t-2xl"
      >
        <div className="mx-auto mt-2 hidden h-1 w-10 rounded-full bg-ds-border-default sm:block" aria-hidden />
        <SheetHeader className="shrink-0 px-5 pt-4 pb-3 text-left">
          <SheetTitle className="text-base text-ds-text-1">{title}</SheetTitle>
          <SheetDescription className="text-[13px] text-ds-text-3">
            {groups.length === 0
              ? "Sin movimientos pendientes"
              : `${groups.length} grupos · ${fmtClp(totalClp)} en cartola`}
            {loadProgress && (
              <span className="ml-1">
                · sugerencias {loadProgress.loaded}/{loadProgress.total}
              </span>
            )}
          </SheetDescription>
          {groups.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isLoading || suggestableIds.length === 0}
                onClick={acceptSuggestions}
                className="flex min-h-11 items-center justify-center rounded-lg border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] font-medium text-ds-text-1 hover:bg-ds-surface-2 disabled:opacity-50"
              >
                {isLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner size="sm" /> Cargando sugerencias…
                  </span>
                ) : (
                  `Aceptar ${suggestableIds.length} sugerencia${suggestableIds.length === 1 ? "" : "s"}`
                )}
              </button>
            </div>
          )}
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto border-t border-ds-border-subtle">
          {groups.length === 0 ? (
            <p className="px-5 py-6 text-[13px] text-ds-text-4">No hay movimientos pendientes.</p>
          ) : (
            <ul className="ds-list-cascade">
              {groups.map((g) => {
                const isOpen = expanded.has(g.key);
                const picking = pickKey === g.key;
                const groupLoading = g.items.some((it) =>
                  loadingIds.has(it.bankTransactionId),
                );
                return (
                  <li key={g.key} className="border-b border-ds-border-subtle last:border-b-0">
                    <button
                      type="button"
                      onClick={() => toggle(g.key)}
                      className="flex min-h-11 w-full items-center gap-2 px-5 py-3 text-left hover:bg-ds-surface-2"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-ds-text-3" aria-hidden />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-ds-text-3" aria-hidden />
                      )}
                      <GroupHeaderMeta
                        group={g}
                        suggestions={suggestions}
                        loading={groupLoading}
                      />
                      <span className="shrink-0 text-[12px] text-ds-text-3">
                        {g.items.length} mov
                      </span>
                      <span className="shrink-0 tabular-nums text-[13px] text-ds-text-2">
                        {fmtClp(g.totalClp)}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="space-y-2 px-5 pb-3">
                        <ul className="space-y-1">
                          {g.items.map((it) => (
                            <MovementRow
                              key={`${it.bankTransactionId}:${it.weekStart}`}
                              item={it}
                              selected={selected.has(it.bankTransactionId)}
                              onToggle={() => toggleSelected(it.bankTransactionId)}
                              result={suggestions.get(it.bankTransactionId)}
                              flowRowById={flowRowById}
                              onAssignCategory={onAssignCategory}
                              onCreateRow={onCreateRow}
                            />
                          ))}
                        </ul>
                        {!picking ? (
                          <button
                            type="button"
                            disabled={busyKey === g.key || flowRows.length === 0}
                            onClick={() => {
                              setPickKey(g.key);
                              setPickLearn(true);
                            }}
                            className="flex min-h-11 w-full items-center justify-center rounded-lg border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] font-medium text-ds-text-1 hover:bg-ds-surface-2 disabled:opacity-50"
                          >
                            Asignar a fila…
                          </button>
                        ) : (
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
                {selectionStats.count} mov · {fmtClp(selectionStats.monto)}
              </p>
              <div className="flex flex-wrap gap-2">
                {selectionStats.withDest > 0 && (
                  <button
                    type="button"
                    disabled={applying}
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
                  disabled={applying || !!busyKey}
                  onClick={() => openPickForSelection(false)}
                  className="flex min-h-11 items-center justify-center rounded-lg border border-ds-border-default px-3 text-[13px] font-medium text-ds-text-1 hover:bg-ds-surface-2 disabled:opacity-50"
                >
                  Asignar a fila…
                </button>
                <button
                  type="button"
                  disabled={applying || !!busyKey}
                  onClick={() => openPickForSelection(true)}
                  className="flex min-h-11 items-center justify-center rounded-lg border border-ds-border-default px-3 text-[13px] font-medium text-ds-text-1 hover:bg-ds-surface-2 disabled:opacity-50"
                >
                  Crear regla…
                </button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
