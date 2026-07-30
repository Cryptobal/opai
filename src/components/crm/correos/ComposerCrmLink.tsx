"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, Link2, Search, X } from "lucide-react";
import { SimpleSelect, SimpleSelectItem } from "@/components/ui/simple-select";
import { cn } from "@/lib/utils";

type AccountOpt = { id: string; name: string; rut?: string | null };
type DealOpt = { id: string; title: string; status: string };

export type ComposerCrmLinkValue = {
  accountId: string | null;
  accountName: string | null;
  dealId: string | null;
};

type Props = {
  value: ComposerCrmLinkValue;
  onChange: (next: ComposerCrmLinkValue) => void;
  disabled?: boolean;
};

/**
 * Fila compacta De/Para/Asunto para asociar el correo saliente a cuenta y
 * (opcional) negocio CRM. No abre modales: búsqueda inline + chips.
 */
export function ComposerCrmLink({ value, onChange, disabled }: Props) {
  const { accountId, accountName, dealId } = value;
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AccountOpt[]>([]);
  const [deals, setDeals] = useState<DealOpt[]>([]);
  const [loadingDeals, setLoadingDeals] = useState(false);
  const seq = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!searching) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setSearching(false);
        setQ("");
        setResults([]);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setSearching(false);
        setQ("");
        setResults([]);
      }
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [searching]);

  useEffect(() => {
    const term = q.trim();
    if (!searching || term.length < 2) {
      setResults([]);
      return;
    }
    const mine = ++seq.current;
    const t = setTimeout(() => {
      fetch(`/api/agenda/cuentas?q=${encodeURIComponent(term)}`)
        .then((r) => r.json())
        .then((j) => {
          if (mine === seq.current) setResults(j.items ?? []);
        })
        .catch(() => undefined);
    }, 280);
    return () => clearTimeout(t);
  }, [q, searching]);

  useEffect(() => {
    if (!accountId) {
      setDeals([]);
      return;
    }
    let alive = true;
    setLoadingDeals(true);
    fetch(`/api/crm/correos/deals-for-account?accountId=${encodeURIComponent(accountId)}`)
      .then((r) => r.json())
      .then((j) => {
        if (alive) setDeals(j.items ?? []);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setLoadingDeals(false);
      });
    return () => {
      alive = false;
    };
  }, [accountId]);

  const openDeals = deals.filter((d) => d.status === "open");
  const closedDeals = deals.filter((d) => d.status !== "open");

  return (
    <div ref={rootRef} className="relative border-b border-ds-border-subtle py-1">
      <div className="flex min-h-10 items-center gap-2 sm:min-h-9">
        <span className="w-10 shrink-0 text-[12px] text-ds-text-3">CRM</span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {!accountId && !searching && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => setSearching(true)}
              className={cn(
                "inline-flex min-h-10 items-center gap-1.5 rounded-md px-1 text-ds-body ds-tap sm:min-h-9",
                "text-ds-text-4 hover:text-ds-text-2 disabled:opacity-50",
              )}
            >
              <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Asociar a cuenta o negocio
            </button>
          )}

          {accountId && (
            <>
              <span
                className={cn(
                  "inline-flex max-w-[min(100%,14rem)] items-center gap-1 rounded-full border px-2 py-1",
                  "border-ds-border-default bg-ds-surface-2 text-[12px] text-ds-text-1",
                )}
                title={accountName || "Cuenta"}
              >
                <Building2 className="h-3 w-3 shrink-0 text-ds-text-3" aria-hidden />
                <span className="truncate">{accountName || "Cuenta"}</span>
                <button
                  type="button"
                  disabled={disabled}
                  aria-label="Quitar cuenta"
                  title="Quitar cuenta"
                  onClick={() =>
                    onChange({ accountId: null, accountName: null, dealId: null })
                  }
                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-ds-text-3 ds-tap hover:bg-ds-surface-3 hover:text-ds-text-1 disabled:opacity-50"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
              <SimpleSelect
                className="h-10 min-w-0 max-w-[14rem] flex-1 border-0 bg-transparent px-0 text-ds-body sm:h-9"
                value={dealId ?? ""}
                disabled={disabled || loadingDeals}
                aria-label="Negocio asociado"
                onValueChange={(v) =>
                  onChange({
                    accountId,
                    accountName,
                    dealId: v || null,
                  })
                }
              >
                <SimpleSelectItem value="">Sin negocio</SimpleSelectItem>
                {openDeals.map((d) => (
                  <SimpleSelectItem key={d.id} value={d.id}>
                    {d.title}
                  </SimpleSelectItem>
                ))}
                {closedDeals.map((d) => (
                  <SimpleSelectItem key={d.id} value={d.id}>
                    <span className="text-ds-text-3">{d.title}</span>
                  </SimpleSelectItem>
                ))}
              </SimpleSelect>
              <button
                type="button"
                disabled={disabled}
                onClick={() => setSearching(true)}
                className="ml-auto shrink-0 text-[12px] text-ds-text-3 hover:text-ds-text-1 ds-tap disabled:opacity-50"
              >
                Cambiar
              </button>
            </>
          )}

          {searching && (
            <div className="relative flex min-w-0 flex-1 items-center">
              <Search
                className="pointer-events-none absolute left-0 h-3.5 w-3.5 text-ds-text-4"
                aria-hidden
              />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter") {
                    e.stopPropagation();
                  }
                }}
                placeholder="Buscar cuenta…"
                autoFocus
                autoComplete="off"
                disabled={disabled}
                aria-label="Buscar cuenta CRM"
                className={cn(
                  "h-10 w-full min-w-0 border-0 bg-transparent pl-5 pr-2 text-[16px] text-ds-text-1 outline-none",
                  "placeholder:text-ds-text-4 sm:h-9 sm:text-ds-body",
                  "focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0",
                )}
              />
            </div>
          )}
        </div>
      </div>

      {searching && q.trim().length >= 2 && (
        <ul
          role="listbox"
          aria-label="Cuentas"
          className="absolute left-10 right-0 z-20 mt-0.5 max-h-44 overflow-y-auto rounded-xl border border-ds-border-subtle bg-background shadow-lg"
        >
          {results.length === 0 && (
            <li className="px-3 py-2 text-[12px] text-ds-text-4">Sin resultados</li>
          )}
          {results.map((a) => (
            <li key={a.id} role="option">
              <button
                type="button"
                onClick={() => {
                  onChange({
                    accountId: a.id,
                    accountName: a.name,
                    dealId: null,
                  });
                  setSearching(false);
                  setQ("");
                  setResults([]);
                }}
                className="flex w-full flex-col items-start px-3 py-2 text-left ds-tap hover:bg-ds-surface-2"
              >
                <span className="text-ds-body text-ds-text-1">{a.name}</span>
                {a.rut && <span className="text-[12px] text-ds-text-4">{a.rut}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
