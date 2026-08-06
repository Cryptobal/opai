"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Surface, Spinner, Tag } from "@/components/opai-ds";
import { fmtClp, fmtShortDate } from "./format";

interface TemplateOpt {
  id: string;
  name: string;
  suggestedBillingPeriod: string;
  periodHasOtherDte: boolean;
  isActive: boolean;
}

interface DteRow {
  dteId: string;
  folio: number | null;
  receiverName: string | null;
  receiverRut: string | null;
  amountClp: number;
  issueDate?: string | null;
  dueDate?: string | null;
  overdueDays?: number;
  crmAccountId?: string | null;
  templates: TemplateOpt[];
}

interface GroupRow {
  key: string;
  crmAccountId: string | null;
  receiverName: string | null;
  receiverRut: string | null;
  subtotalClp: number;
  items: DteRow[];
  templates: TemplateOpt[];
}

interface BankTxRow {
  bankTransactionId: string;
  amountClp: number;
  dateYmd: string;
  description: string;
  reference: string | null;
  beneficiaryRut: string | null;
}

function groupStatus(g: GroupRow): { label: string; variant: "ok" | "warn" | "neutral" } {
  if (g.crmAccountId && g.templates.length > 0) {
    return {
      label: `tiene cuenta y ${g.templates.length} programación${g.templates.length === 1 ? "" : "es"}`,
      variant: "ok",
    };
  }
  if (g.crmAccountId) {
    return { label: "tiene cuenta en CRM", variant: "neutral" };
  }
  return { label: "sin cuenta en CRM", variant: "warn" };
}

/**
 * Bandeja / panel de ingresos sin clasificar.
 * - `mode="bandeja"`: solo abonos bancarios (cartola-first).
 * - `mode="unrouted"`: solo facturas emitidas sin fila.
 * - `mode="all"`: ambos (deep-link / legacy).
 */
export function UnmatchedIncomeList({
  weekStart,
  onCreated,
  focusDteId,
  onViewDte,
  onExcludeGroup,
  mode = "all",
}: {
  weekStart: string;
  onCreated: () => void;
  focusDteId?: string | null;
  onViewDte?: (dteId: string) => void;
  /** Excluye todas las facturas del grupo (opcional, desde planilla). */
  onExcludeGroup?: (dteIds: string[]) => Promise<void>;
  mode?: "bandeja" | "unrouted" | "all";
}) {
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [bankTxs, setBankTxs] = useState<BankTxRow[]>([]);
  const [classifyBusyId, setClassifyBusyId] = useState<string | null>(null);
  const [classifyHint, setClassifyHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [linkPickerKey, setLinkPickerKey] = useState<string | null>(null);
  const [oldPortfolio, setOldPortfolio] = useState<{
    cutoffYmd: string;
    count: number;
    totalClp: number;
    dteIds: string[];
  } | null>(null);
  const [excludingOld, setExcludingOld] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetch(`/api/finance/flow-v3/unmatched-income?week=${weekStart}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!j.success) throw new Error(j.error ?? "Error");
        if (cancelled) return;
        setBankTxs(Array.isArray(j.bankTxs) ? (j.bankTxs as BankTxRow[]) : []);
        // Panel "Facturas sin fila": preferir unroutedDtes (excluye OTHER_INCOME).
        // groups del API incluye ruteados a propósito (drill de Otros ingresos).
        const unroutedItems: DteRow[] = Array.isArray(j.unroutedDtes)
          ? (j.unroutedDtes as DteRow[])
          : Array.isArray(j.data)
            ? (j.data as DteRow[])
            : [];
        if (unroutedItems.length > 0 || mode === "unrouted" || mode === "all") {
          const byKey = new Map<string, GroupRow>();
          for (const it of unroutedItems) {
            const accId = it.crmAccountId ?? null;
            const key = accId
              ? `acc:${accId}`
              : it.receiverRut
                ? `rut:${it.receiverRut}`
                : `dte:${it.dteId}`;
            const existing = byKey.get(key);
            const g: GroupRow = existing ?? {
              key,
              crmAccountId: accId,
              receiverName: it.receiverName,
              receiverRut: it.receiverRut,
              subtotalClp: 0,
              items: [],
              templates: [],
            };
            if (!existing) byKey.set(key, g);
            g.items.push(it);
            g.subtotalClp += it.amountClp;
            if (g.templates.length === 0 && (it.templates?.length ?? 0) > 0) {
              g.templates = it.templates;
            }
          }
          const next = [...byKey.values()];
          setGroups(next);
          setExpanded(new Set(next.map((g) => g.key)));
        } else if (Array.isArray(j.groups) && j.groups.length > 0) {
          setGroups(j.groups as GroupRow[]);
          setExpanded(new Set((j.groups as GroupRow[]).map((g) => g.key)));
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [weekStart]);

  useEffect(() => {
    if (!focusDteId) return;
    for (const g of groups) {
      const hit = g.items.find((i) => i.dteId === focusDteId);
      if (hit) {
        setExpanded((s) => new Set(s).add(g.key));
        setLinkPickerKey(g.key);
        break;
      }
    }
  }, [focusDteId, groups]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/finance/flow-v3/old-portfolio", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!j.success || cancelled) return;
        const d = j.data as {
          cutoffYmd: string;
          count: number;
          totalClp: number;
          dteIds: string[];
        };
        if (d.count > 0) setOldPortfolio(d);
        else setOldPortfolio(null);
      })
      .catch(() => { /* no-op */ });
    return () => { cancelled = true; };
  }, [weekStart, groups.length]);

  const createRow = async (dteId: string) => {
    setBusyKey(dteId);
    setError(null);
    try {
      const res = await fetch("/api/finance/flow-v3/unmatched-income", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dteId }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error ?? "Error");
      setGroups((prev) =>
        prev
          .map((g) => ({
            ...g,
            items: g.items.filter((x) => x.dteId !== dteId),
            subtotalClp: g.items
              .filter((x) => x.dteId !== dteId)
              .reduce((s, x) => s + x.amountClp, 0),
          }))
          .filter((g) => g.items.length > 0),
      );
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusyKey(null);
    }
  };

  const linkTemplate = async (dteIds: string[], templateId: string, warn: boolean) => {
    if (warn) {
      const ok = window.confirm(
        "Este período ya tiene otra factura de la misma programación. ¿Vincular de todos modos? (ambas F° conviven; se suprime la cuota proyectada).",
      );
      if (!ok) return;
    }
    const key = dteIds.join(",");
    setBusyKey(key);
    setError(null);
    try {
      const body =
        dteIds.length === 1
          ? { dteId: dteIds[0], templateId }
          : { dteIds, templateId };
      const res = await fetch("/api/finance/flow-v3/unmatched-income/link-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error ?? "Error");
      const linkedIds = new Set(
        dteIds.length === 1
          ? [dteIds[0]!]
          : ((j.data?.linked as Array<{ dteId: string }> | undefined) ?? []).map(
              (x) => x.dteId,
            ),
      );
      if (dteIds.length === 1) linkedIds.add(dteIds[0]!);
      const skipped = (j.data?.skipped as Array<{ dteId: string; reason: string }> | undefined) ?? [];
      if (skipped.length > 0) {
        setError(
          `Omitidas ${skipped.length}: ${skipped.map((s) => s.reason).join("; ")}`,
        );
      }
      setGroups((prev) =>
        prev
          .map((g) => ({
            ...g,
            items: g.items.filter((x) => !linkedIds.has(x.dteId)),
            subtotalClp: g.items
              .filter((x) => !linkedIds.has(x.dteId))
              .reduce((s, x) => s + x.amountClp, 0),
          }))
          .filter((g) => g.items.length > 0),
      );
      setLinkPickerKey(null);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusyKey(null);
    }
  };

  const excludeGroup = async (g: GroupRow) => {
    const ids = g.items.map((i) => i.dteId);
    if (onExcludeGroup) {
      setBusyKey(g.key);
      setError(null);
      try {
        await onExcludeGroup(ids);
        setGroups((prev) => prev.filter((x) => x.key !== g.key));
        onCreated();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      } finally {
        setBusyKey(null);
      }
      return;
    }
    setBusyKey(g.key);
    setError(null);
    try {
      for (const id of ids) {
        const res = await fetch("/api/finance/flow-v3/income-exclusions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dteId: id, reason: "Excluidas desde Otros ingresos" }),
        });
        const j = await res.json();
        if (!j.success) throw new Error(j.error ?? "Error");
      }
      setGroups((prev) => prev.filter((x) => x.key !== g.key));
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusyKey(null);
    }
  };

  const showBank = mode === "bandeja" || mode === "all";
  const showUnrouted = mode === "unrouted" || mode === "all";
  const visibleGroups = showUnrouted ? groups : [];
  const visibleBank = showBank ? bankTxs : [];

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-5 py-3 text-[12px] text-ds-text-4">
        <Spinner size="sm" />{" "}
        {mode === "bandeja" ? "Cargando abonos…" : "Cargando facturas…"}
      </div>
    );
  }
  if (visibleGroups.length === 0 && visibleBank.length === 0 && !error) return null;

  const clientLabel = (g: GroupRow) => g.receiverName ?? g.receiverRut ?? "Cliente";

  const classifyBankTx = async (txId: string) => {
    setClassifyBusyId(txId);
    setClassifyHint(null);
    setError(null);
    try {
      const res = await fetch(
        `/api/finance/banking/transactions/${txId}/classify-suggestions`,
        { cache: "no-store" },
      );
      const j = await res.json();
      if (!j.success) throw new Error(j.error ?? "Error");
      const suggestions = (j.data?.suggestions ?? []) as Array<{
        kind: string;
        label?: string;
        flowRowId?: string;
        options?: string[];
        source?: "rule" | "payroll" | "te" | "heuristic";
        reason?: string;
      }>;
      const top = suggestions[0];
      if (!top || top.kind === "NONE") {
        setClassifyHint("Sin sugerencia automática — clasificá en Bancos.");
        return;
      }
      if (top.kind === "TGR_PICK") {
        setClassifyHint(`TGR: elegí ${ (top.options ?? []).join(" / ") } en Bancos.`);
        return;
      }
      if (top.kind === "FLOW_ROW" && top.flowRowId) {
        const payrollKind =
          top.source === "payroll" &&
          /finiquito/i.test(top.reason ?? top.label ?? "")
            ? "FINIQUITO"
            : top.source === "payroll"
              ? "LIQUIDACION"
              : undefined;
        const conf = await fetch(
          `/api/finance/banking/transactions/${txId}/classify-suggestions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: "FLOW_ROW",
              flowRowId: top.flowRowId,
              source: top.source ?? "heuristic",
              payrollKind,
            }),
          },
        );
        const cj = await conf.json();
        if (!cj.success) throw new Error(cj.error ?? "Error");
        setClassifyHint(
          cj.data?.stub
            ? `Sugerido: ${top.label ?? "fila"} (completar cuenta en Bancos)`
            : `Clasificado → ${top.label ?? "fila"}`,
        );
        setBankTxs((prev) => prev.filter((t) => t.bankTransactionId !== txId));
        onCreated();
        return;
      }
      setClassifyHint(`Sugerencia: ${top.kind} — revisá en Bancos.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setClassifyBusyId(null);
    }
  };

  return (
    <div className="border-t border-ds-border-subtle px-5 py-3">
      {visibleBank.length > 0 && (
        <div className="mb-4 space-y-2">
          <p className="text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
            Abonos bancarios sin clasificar ({visibleBank.length})
          </p>
          {classifyHint && (
            <p className="text-[12px] text-status-info-fg">{classifyHint}</p>
          )}
          <ul className="space-y-2">
            {visibleBank.map((tx) => (
              <li
                key={tx.bankTransactionId}
                className="flex flex-col gap-2 rounded-lg border border-ds-border-subtle bg-ds-surface-2 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] text-ds-text-1">
                    {fmtShortDate(tx.dateYmd)} · {tx.description || "Sin glosa"}
                  </p>
                  <p className="text-[12px] text-ds-text-4">
                    {tx.beneficiaryRut ? `RUT ${tx.beneficiaryRut}` : "Sin RUT"}
                    {" · "}
                    <span className="tabular-nums">{fmtClp(tx.amountClp)}</span>
                  </p>
                </div>
                <button
                  type="button"
                  disabled={classifyBusyId === tx.bankTransactionId}
                  onClick={() => void classifyBankTx(tx.bankTransactionId)}
                  className="h-11 shrink-0 rounded-ds-md bg-primary px-3 text-[13px] font-medium text-primary-foreground disabled:opacity-50 sm:h-10"
                >
                  {classifyBusyId === tx.bankTransactionId ? "…" : "Clasificar…"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {showUnrouted && visibleGroups.length > 0 && (
      <p className="mb-2 text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
        Facturas sin fila ({visibleGroups.length})
      </p>
      )}
      {error && <p className="mb-2 text-[12px] text-status-danger-fg">{error}</p>}
      {showUnrouted && (
      <ul className="ds-list-cascade space-y-2">
        {visibleGroups.map((g) => {
          const st = groupStatus(g);
          const isOpen = expanded.has(g.key);
          const templates = g.templates.length > 0 ? g.templates : g.items[0]?.templates ?? [];
          const showPicker = linkPickerKey === g.key && templates.length > 0;
          return (
            <li key={g.key}>
              <Surface elevation={1} padding="sm" className="space-y-2">
                <button
                  type="button"
                  className="flex w-full items-start gap-2 text-left"
                  onClick={() =>
                    setExpanded((s) => {
                      const n = new Set(s);
                      if (n.has(g.key)) n.delete(g.key);
                      else n.add(g.key);
                      return n;
                    })
                  }
                  aria-expanded={isOpen}
                >
                  {isOpen ? (
                    <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-ds-text-3" />
                  ) : (
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-ds-text-3" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-[13px] font-medium text-ds-text-1">
                        {clientLabel(g)}
                      </span>
                      <span className="shrink-0 tabular-nums text-[13px] text-ds-text-1">
                        {fmtClp(g.subtotalClp)}
                      </span>
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-2">
                      <Tag size="sm" variant={st.variant === "ok" ? "ok" : st.variant === "warn" ? "warn" : "neutral"}>
                        {st.label}
                      </Tag>
                      <span className="text-[12px] text-ds-text-3">
                        {g.items.length} factura{g.items.length === 1 ? "" : "s"}
                      </span>
                    </span>
                  </span>
                </button>

                {isOpen && (
                  <>
                    <ul className="space-y-1 border-t border-ds-border-subtle pt-2">
                      {g.items.map((d) => (
                        <li
                          key={d.dteId}
                          className="flex items-center justify-between gap-2 rounded-md px-1 py-1 text-[13px]"
                        >
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left text-ds-text-2 hover:text-primary"
                            onClick={() => onViewDte?.(d.dteId)}
                            disabled={!onViewDte}
                          >
                            <span className="font-medium">
                              {d.folio != null ? `F°${d.folio}` : "Sin folio"}
                            </span>
                            {d.issueDate && (
                              <span className="ml-1.5 text-[12px] text-ds-text-3">
                                {fmtShortDate(d.issueDate)}
                                {(d.overdueDays ?? 0) > 0 && (
                                  <span className="text-status-warn-fg">
                                    {" "}· vencida hace {d.overdueDays}d
                                  </span>
                                )}
                              </span>
                            )}
                          </button>
                          <span className="shrink-0 tabular-nums text-ds-text-2">
                            {fmtClp(d.amountClp)}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <div className="flex flex-wrap gap-2 border-t border-ds-border-subtle pt-2">
                      {templates.length > 0 && g.items.length >= 1 && (
                        <button
                          type="button"
                          disabled={busyKey != null}
                          onClick={() =>
                            setLinkPickerKey((k) => (k === g.key ? null : g.key))
                          }
                          className="min-h-10 shrink-0 rounded-full bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground"
                        >
                          Vincular las {g.items.length} a…
                        </button>
                      )}
                      {!g.crmAccountId && g.items.length === 1 && (
                        <button
                          type="button"
                          disabled={busyKey === g.items[0]!.dteId}
                          onClick={() => void createRow(g.items[0]!.dteId)}
                          className="min-h-10 shrink-0 rounded-full border border-ds-border-default bg-ds-surface-1 px-3 py-1.5 text-[12px] font-medium text-ds-text-1"
                        >
                          {busyKey === g.items[0]!.dteId ? "Creando…" : "Crear fila…"}
                        </button>
                      )}
                      {!g.crmAccountId && g.items.length > 1 && (
                        <span className="self-center text-[12px] text-ds-text-3">
                          Crear fila… (una por factura)
                        </span>
                      )}
                      {g.items.length >= 1 && (
                        <button
                          type="button"
                          disabled={busyKey === g.key}
                          onClick={() => void excludeGroup(g)}
                          className="min-h-10 shrink-0 rounded-full border border-ds-border-default px-3 py-1.5 text-[12px] font-medium text-status-danger-fg"
                        >
                          {busyKey === g.key ? "Excluyendo…" : `Excluir las ${g.items.length}`}
                        </button>
                      )}
                    </div>

                    {showPicker && (
                      <ul className="space-y-1.5 border-t border-ds-border-subtle pt-2">
                        {templates.map((t) => (
                          <li key={t.id}>
                            <button
                              type="button"
                              disabled={busyKey != null}
                              onClick={() =>
                                void linkTemplate(
                                  g.items.map((i) => i.dteId),
                                  t.id,
                                  t.periodHasOtherDte,
                                )
                              }
                              className="flex min-h-11 w-full flex-col items-start gap-0.5 rounded-xl border border-ds-border-subtle bg-ds-surface-2 px-3 py-2 text-left transition-colors hover:border-primary/40"
                            >
                              <span className="text-[13px] font-medium text-ds-text-1">{t.name}</span>
                              <span className="text-[12px] text-ds-text-3">
                                Período {t.suggestedBillingPeriod}
                                {!t.isActive ? " · pausada" : ""}
                                {t.periodHasOtherDte ? " · ya hay F° en el período" : ""}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </Surface>
            </li>
          );
        })}
      </ul>
      )}

      {showUnrouted && oldPortfolio && oldPortfolio.count > 0 && (
        <Surface elevation={1} padding="md" className="mt-4 space-y-2">
          <p className="text-[13px] text-ds-text-2">
            🧹 Cartera antigua: {oldPortfolio.count} factura
            {oldPortfolio.count === 1 ? "" : "s"} anteriores a{" "}
            {fmtShortDate(oldPortfolio.cutoffYmd)} · {fmtClp(oldPortfolio.totalClp)}
          </p>
          <button
            type="button"
            disabled={excludingOld}
            className="min-h-10 rounded-full border border-ds-border-default bg-ds-surface-1 px-3 py-1.5 text-[12px] font-medium text-ds-text-1 disabled:opacity-50"
            onClick={() => {
              const { count, totalClp, dteIds, cutoffYmd } = oldPortfolio;
              if (
                !window.confirm(
                  `Excluir ${count} factura(s) anteriores a ${fmtShortDate(cutoffYmd)} por ${fmtClp(totalClp)}?\n\nReversible desde exclusiones del flujo.`,
                )
              ) {
                return;
              }
              setExcludingOld(true);
              void fetch("/api/finance/flow-v3/income-exclusions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  dteIds,
                  reason: `Cartera antigua anterior a ${cutoffYmd}`,
                }),
              })
                .then(async (r) => {
                  const j = await r.json();
                  if (!j.success) throw new Error(j.error ?? "Error");
                  setOldPortfolio(null);
                  onCreated();
                })
                .catch((e: unknown) => {
                  setError(e instanceof Error ? e.message : "Error");
                })
                .finally(() => setExcludingOld(false));
            }}
          >
            Excluir anteriores a {fmtShortDate(oldPortfolio.cutoffYmd)}
          </button>
        </Surface>
      )}
    </div>
  );
}
