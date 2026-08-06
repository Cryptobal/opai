"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Tag } from "@/components/opai-ds";
import type { AccountOption } from "./cashflow-config-types";

export interface RowAccountMapping {
  accountPlanId: string;
  code: string;
  name: string;
  isPrimary: boolean;
  isDefaultTarget: boolean;
}

interface Props {
  rowId: string;
  accountOptions: AccountOption[];
  /** Cuentas iniciales (evita fetch si el padre ya las tiene). */
  initialAccounts?: RowAccountMapping[];
  canEdit?: boolean;
  compact?: boolean;
  onChange?: (accounts: RowAccountMapping[]) => void;
}

/**
 * Editor de cuentas contables de un renglón (reemplaza CategoryAccountsEditor en config).
 */
export function RowAccountsEditor({
  rowId,
  accountOptions,
  initialAccounts,
  canEdit = true,
  compact = false,
  onChange,
}: Props) {
  const [mappings, setMappings] = useState<RowAccountMapping[]>(initialAccounts ?? []);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(!initialAccounts);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/finance/flow-v3/rows/${rowId}/accounts`, {
        cache: "no-store",
      });
      const j = await r.json();
      if (!j?.success) {
        setError(j?.error ?? "Error al cargar");
        return;
      }
      const next = (j.data as Array<{
        accountPlanId: string;
        isPrimary: boolean;
        isDefaultTarget: boolean;
        accountPlan: { code: string; name: string };
      }>).map((m) => ({
        accountPlanId: m.accountPlanId,
        code: m.accountPlan.code,
        name: m.accountPlan.name,
        isPrimary: m.isPrimary,
        isDefaultTarget: m.isDefaultTarget,
      }));
      setMappings(next);
      onChange?.(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, [rowId, onChange]);

  useEffect(() => {
    if (initialAccounts) {
      setMappings(initialAccounts);
      setLoading(false);
      return;
    }
    void load();
  }, [rowId, initialAccounts, load]);

  async function save(
    nextIds: string[],
    defaultTargetAccountPlanId?: string | null,
  ) {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/finance/flow-v3/rows/${rowId}/accounts`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountPlanIds: nextIds,
          defaultTargetAccountPlanId: defaultTargetAccountPlanId ?? null,
        }),
      });
      const j = await r.json();
      if (!j?.success) {
        setError(j?.error ?? "Error al guardar");
        return;
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setSaving(false);
    }
  }

  function removeAccount(accountPlanId: string) {
    const nextIds = mappings
      .filter((m) => m.accountPlanId !== accountPlanId)
      .map((m) => m.accountPlanId);
    void save(nextIds);
  }

  async function setDefaultTarget(accountPlanId: string) {
    const nextIds = mappings.map((m) => m.accountPlanId);
    await save(nextIds, accountPlanId);
  }

  if (loading) {
    return <span className="text-[12px] text-ds-text-3">Cargando…</span>;
  }

  const available = accountOptions.filter(
    (o) => !mappings.some((m) => m.accountPlanId === o.id),
  );

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${compact ? "" : "mt-1"}`}>
      {mappings.length === 0 && (
        <span className="text-[12px] text-status-warn-fg">Sin cuentas</span>
      )}
      {mappings.map((m) => (
        <span
          key={m.accountPlanId}
          className={`inline-flex items-center gap-1 rounded-ds-sm px-2 py-1 text-[12px] ${
            m.isPrimary
              ? "bg-status-info-soft text-status-info-fg"
              : "bg-ds-surface-2 text-ds-text-2"
          }`}
          title={`${m.code} — ${m.name}`}
        >
          <span className="font-mono">{m.code}</span>
          {!compact && (
            <>
              <span className="text-ds-text-3">·</span>
              <span className="truncate max-w-[140px]">{m.name}</span>
            </>
          )}
          {m.isDefaultTarget && (
            <Tag variant="ok" size="sm">
              destino
            </Tag>
          )}
          {canEdit && mappings.length > 1 && !m.isDefaultTarget && (
            <button
              type="button"
              className="text-[12px] text-ds-text-3 hover:text-primary underline-offset-2 hover:underline"
              onClick={() => void setDefaultTarget(m.accountPlanId)}
              disabled={saving}
            >
              destino
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              aria-label={`Quitar cuenta ${m.code}`}
              onClick={() => removeAccount(m.accountPlanId)}
              disabled={saving}
              className="hover:text-status-warn-fg disabled:opacity-50"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
      {canEdit && available.length > 0 && (
        <div className="relative">
          <div className="flex items-center gap-1.5 h-8 sm:h-7 min-w-[200px] rounded-ds-sm border border-ds-border-default bg-ds-surface-1 px-2">
            <Search className="h-3.5 w-3.5 text-ds-text-3 shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              placeholder="Agregar cuenta…"
              className="flex-1 bg-transparent border-0 outline-none text-[12px] min-h-[28px]"
            />
          </div>
          {open && (() => {
            const q = query.trim().toLowerCase();
            const filtered = q
              ? available.filter(
                  (a) =>
                    a.code.toLowerCase().includes(q) ||
                    a.name.toLowerCase().includes(q),
                )
              : available;
            return (
              <ul className="absolute top-full left-0 mt-1 w-[260px] max-h-[240px] overflow-y-auto rounded-ds-sm border border-ds-border-default bg-popover shadow-lg z-20">
                {filtered.slice(0, 80).map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        void save([...mappings.map((m) => m.accountPlanId), a.id]);
                        setQuery("");
                        setOpen(false);
                      }}
                      className="w-full text-left px-2 py-2 text-[12px] hover:bg-ds-surface-2 flex items-center gap-2 min-h-11"
                    >
                      <span className="font-mono text-ds-text-3 shrink-0">{a.code}</span>
                      <span className="truncate">{a.name}</span>
                    </button>
                  </li>
                ))}
                {filtered.length === 0 && (
                  <li className="px-2 py-2 text-[12px] text-ds-text-3">Sin resultados</li>
                )}
              </ul>
            );
          })()}
        </div>
      )}
      {error && <span className="text-[12px] text-status-warn-fg">{error}</span>}
    </div>
  );
}
