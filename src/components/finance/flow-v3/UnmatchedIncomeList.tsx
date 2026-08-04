"use client";

import { useEffect, useState } from "react";
import { fmtClp } from "./format";
import { Spinner } from "@/components/opai-ds";

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

/** Lista DTEs de "Otros ingresos" agrupados por cliente + vincular unitario/masivo. */
export function UnmatchedIncomeList({
  weekStart,
  onCreated,
  focusDteId,
}: {
  weekStart: string;
  onCreated: () => void;
  /** Si viene, abre el picker de vincular para ese DTE. */
  focusDteId?: string | null;
}) {
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState<{
    mode: "one" | "bulk";
    dteIds: string[];
    label: string;
    templates: TemplateOpt[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetch(`/api/finance/flow-v3/unmatched-income?week=${weekStart}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!j.success) throw new Error(j.error ?? "Error");
        if (cancelled) return;
        if (Array.isArray(j.groups) && j.groups.length > 0) {
          setGroups(j.groups as GroupRow[]);
        } else {
          // Fallback: agrupar plano en cliente.
          const items = (j.data as DteRow[]) ?? [];
          const byKey = new Map<string, GroupRow>();
          for (const it of items) {
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
          setGroups([...byKey.values()]);
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
        setLinking({
          mode: "one",
          dteIds: [hit.dteId],
          label: hit.folio != null ? `F°${hit.folio}` : "factura",
          templates: hit.templates?.length ? hit.templates : g.templates,
        });
        break;
      }
    }
  }, [focusDteId, groups]);

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
      // En unitario, linkedIds tiene el único; en bulk, los vinculados (no skipped).
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
      setLinking(null);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusyKey(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-5 py-3 text-[12px] text-ds-text-4">
        <Spinner size="sm" /> Cargando facturas…
      </div>
    );
  }
  if (groups.length === 0 && !error) return null;

  const clientLabel = (g: GroupRow) => g.receiverName ?? g.receiverRut ?? "Cliente";

  return (
    <div className="border-t border-ds-border-subtle px-5 py-3">
      <p className="mb-2 text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
        Facturas en Otros ingresos
      </p>
      {error && <p className="mb-2 text-[12px] text-status-danger-fg">{error}</p>}
      <ul className="space-y-3">
        {groups.map((g) => (
          <li
            key={g.key}
            className="rounded-lg border border-ds-border-subtle bg-ds-surface-2 px-3 py-2"
          >
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-[13px] font-medium text-ds-text-1">
                {clientLabel(g)}
                <span className="ml-1.5 font-normal text-ds-text-3">
                  · {g.items.length} F°
                </span>
              </span>
              <span className="shrink-0 tabular-nums text-[13px] text-ds-text-1">
                {fmtClp(g.subtotalClp)}
              </span>
            </div>

            <ul className="mb-2 space-y-1.5">
              {g.items.map((d) => (
                <li
                  key={d.dteId}
                  className="flex flex-col gap-1 rounded-md bg-ds-surface-1/60 px-2 py-1.5"
                >
                  <div className="flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="min-w-0 truncate text-ds-text-2">
                      {d.folio != null ? `F°${d.folio}` : "Sin folio"}
                    </span>
                    <span className="shrink-0 tabular-nums text-ds-text-2">
                      {fmtClp(d.amountClp)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {(d.templates?.length ?? g.templates?.length ?? 0) > 0 && (
                      <button
                        type="button"
                        disabled={busyKey === d.dteId}
                        onClick={() =>
                          setLinking({
                            mode: "one",
                            dteIds: [d.dteId],
                            label: d.folio != null ? `F°${d.folio}` : "factura",
                            templates: d.templates?.length ? d.templates : g.templates,
                          })
                        }
                        className="min-h-10 shrink-0 rounded-full border border-ds-border-default bg-ds-surface-1 px-3 py-1.5 text-[12px] font-medium text-ds-text-1"
                      >
                        Vincular…
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busyKey === d.dteId}
                      onClick={() => void createRow(d.dteId)}
                      className="min-h-10 shrink-0 rounded-full border border-ds-border-default bg-ds-surface-1 px-3 py-1.5 text-[12px] font-medium text-ds-text-1"
                    >
                      {busyKey === d.dteId ? "Creando…" : "Crear fila"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {g.items.length >= 2 && (g.templates?.length ?? 0) > 0 && (
              <button
                type="button"
                disabled={busyKey != null}
                onClick={() =>
                  setLinking({
                    mode: "bulk",
                    dteIds: g.items.map((i) => i.dteId),
                    label: `las ${g.items.length} de ${clientLabel(g)}`,
                    templates: g.templates,
                  })
                }
                className="min-h-10 w-full rounded-full bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground"
              >
                Vincular las {g.items.length} de {clientLabel(g)} a…
              </button>
            )}
          </li>
        ))}
      </ul>

      {linking && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Vincular a programación"
          onClick={() => setLinking(null)}
        >
          <div
            className="opai-glass-strong w-full max-w-md rounded-t-2xl border border-ds-border-subtle bg-ds-surface-1 p-4 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-1 text-[13px] font-medium text-ds-text-1">
              Vincular {linking.label}
            </p>
            <p className="mb-3 text-[12px] text-ds-text-3">
              Elegí UNA programación — se aplica a {linking.dteIds.length} factura
              {linking.dteIds.length === 1 ? "" : "s"}
            </p>
            <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
              {linking.templates.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    disabled={busyKey != null}
                    onClick={() =>
                      void linkTemplate(linking.dteIds, t.id, t.periodHasOtherDte)
                    }
                    className="flex min-h-11 w-full flex-col items-start gap-0.5 rounded-xl border border-ds-border-subtle bg-ds-surface-2 px-3 py-2.5 text-left transition-colors hover:border-primary/40"
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
            <button
              type="button"
              onClick={() => setLinking(null)}
              className="mt-3 min-h-10 w-full rounded-full text-[13px] text-ds-text-3"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
