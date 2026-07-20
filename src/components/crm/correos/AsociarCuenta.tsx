"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

type AccountOpt = { id: string; name: string; rut?: string | null };

/** Combobox buscador de cuentas → onSelect(accountId). Reusa /api/agenda/cuentas. */
export function AsociarCuenta({
  onSelect,
  disabled,
}: {
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AccountOpt[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
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
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="h-9 rounded-xl border border-ds-border-default px-3 text-[13px] text-ds-text-2 ds-tap disabled:opacity-50"
      >
        Asociar a cuenta…
      </button>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ds-text-4" />
        <input
          className="h-9 w-full rounded-xl border border-ds-border-default bg-ds-surface-1 pl-9 pr-3 text-[13px]"
          placeholder="Buscar cuenta…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          autoComplete="off"
        />
      </div>
      {q.trim().length >= 2 && (
        <ul className="max-h-44 overflow-y-auto rounded-xl border border-ds-border-subtle bg-ds-surface-1">
          {results.length === 0 && (
            <li className="px-3 py-2 text-[12px] text-ds-text-4">Sin resultados</li>
          )}
          {results.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(a.id);
                  setOpen(false);
                  setQ("");
                }}
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
