"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { AccountOption } from "./types";

const INPUT =
  "h-10 w-full rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] sm:h-9";

export function AccountField({
  value,
  onSelect,
  onClear,
}: {
  value: AccountOption | null;
  onSelect: (a: AccountOption) => void;
  onClear: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AccountOption[]>([]);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (value) return; // sin búsqueda mientras haya cuenta elegida
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const mine = ++seq.current;
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/agenda/cuentas?q=${encodeURIComponent(term)}`)
        .then((r) => r.json())
        .then((j) => {
          if (mine === seq.current) setResults(j.items ?? []);
        })
        .catch(() => undefined)
        .finally(() => {
          if (mine === seq.current) setLoading(false);
        });
    }, 300);
    return () => clearTimeout(t);
  }, [q, value]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-ds-text-1">{value.name}</p>
          {value.rut && <p className="truncate text-[12px] text-ds-text-4">{value.rut}</p>}
        </div>
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 text-[12px] text-primary ds-tap"
        >
          Cambiar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ds-text-4" />
        <input
          className={`${INPUT} pl-9 pr-9`}
          placeholder="Buscar cuenta…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label="Limpiar"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ds-text-4 ds-tap"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {q.trim().length >= 2 && (
        <ul className="max-h-44 overflow-y-auto rounded-xl border border-ds-border-subtle bg-ds-surface-1">
          {loading && <li className="px-3 py-2 text-[12px] text-ds-text-4">Buscando…</li>}
          {!loading && results.length === 0 && (
            <li className="px-3 py-2 text-[12px] text-ds-text-4">Sin resultados</li>
          )}
          {results.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onSelect(a)}
                className="flex w-full flex-col items-start px-3 py-2 text-left ds-tap hover:bg-ds-surface-2"
              >
                <span className="text-[13px] text-ds-text-1">{a.name}</span>
                {a.rut && <span className="text-[12px] text-ds-text-4">{a.rut}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
