"use client";

import { useEffect, useRef, useState } from "react";
import { Briefcase, Building2, FileText, MapPin, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type CrmLinkOption = {
  id: string;
  label: string;
  sub?: string | null;
  accountId?: string | null;
  dealId?: string | null;
  installationId?: string | null;
};

type LinkType = "accounts" | "deals" | "quotes" | "installations";

const ICONS = {
  accounts: Building2,
  deals: Briefcase,
  quotes: FileText,
  installations: MapPin,
} as const;

/** Combobox buscador de un nivel de la cascada CRM (cuenta/negocio/cotización/instalación). */
export function TareaCrmLinkPicker({
  type,
  label,
  placeholder,
  value,
  selectedLabel,
  disabled,
  accountId,
  dealId,
  onSelect,
  onClear,
}: {
  type: LinkType;
  label: string;
  placeholder: string;
  value: string | null;
  selectedLabel: string | null;
  disabled?: boolean;
  accountId?: string | null;
  dealId?: string | null;
  onSelect: (opt: CrmLinkOption) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CrmLinkOption[]>([]);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const Icon = ICONS[type];

  useEffect(() => {
    if (!open || disabled) return;
    const mine = ++seq.current;
    const t = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ type });
      if (q.trim()) params.set("q", q.trim());
      if (accountId) params.set("accountId", accountId);
      if (dealId) params.set("dealId", dealId);
      fetch(`/api/crm/tasks/crm-links?${params}`)
        .then((r) => r.json())
        .then((j) => {
          if (mine === seq.current) setResults(Array.isArray(j.items) ? j.items : []);
        })
        .catch(() => {
          if (mine === seq.current) setResults([]);
        })
        .finally(() => {
          if (mine === seq.current) setLoading(false);
        });
    }, q.trim() ? 250 : 0);
    return () => clearTimeout(t);
  }, [open, q, type, accountId, dealId, disabled]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQ("");
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (disabled && !value) {
    return (
      <div className="space-y-1.5">
        <span className="px-1 text-[12px] font-medium text-ds-text-4">{label}</span>
        <div className="opai-glass-soft flex min-h-[44px] items-center gap-2 rounded-2xl px-3 text-[13px] text-ds-text-4">
          <Icon className="h-4 w-4 shrink-0" />
          <span>Selecciona una cuenta primero</span>
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="space-y-1.5">
      <span className="px-1 text-[12px] font-medium text-ds-text-4">{label}</span>
      {!open ? (
        <div className="opai-glass-soft flex min-h-[44px] items-center gap-2 rounded-2xl px-3">
          <Icon className="h-4 w-4 shrink-0 text-ds-text-4" />
          <button
            type="button"
            disabled={disabled}
            onClick={() => !disabled && setOpen(true)}
            className={cn(
              "min-h-[44px] min-w-0 flex-1 truncate text-left text-[13px] sm:min-h-0 sm:py-2",
              value ? "text-ds-text-1" : "text-ds-text-4",
              disabled && "opacity-70",
            )}
          >
            {selectedLabel?.trim() || placeholder}
          </button>
          {value && !disabled && (
            <button
              type="button"
              aria-label={`Quitar ${label.toLowerCase()}`}
              onClick={onClear}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ds-text-4 hover:bg-ds-surface-2 hover:text-ds-text-2"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ds-text-4" />
            <input
              className="h-10 w-full rounded-2xl border border-ds-border-default bg-ds-surface-1 pl-9 pr-3 text-[13px] text-ds-text-1 placeholder:text-ds-text-4 focus:outline-none focus:ring-1 focus:ring-primary/40 sm:h-9"
              placeholder={placeholder}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
              autoComplete="off"
            />
          </div>
          <ul className="max-h-44 overflow-y-auto rounded-2xl border border-ds-border-subtle bg-ds-surface-1">
            {loading && (
              <li className="px-3 py-2 text-[12px] text-ds-text-4">Buscando…</li>
            )}
            {!loading && results.length === 0 && (
              <li className="px-3 py-2 text-[12px] text-ds-text-4">
                {type === "accounts" && q.trim().length < 2
                  ? "Escribe al menos 2 caracteres"
                  : "Sin resultados"}
              </li>
            )}
            {!loading &&
              results.map((opt) => (
                <li key={opt.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(opt);
                      setOpen(false);
                      setQ("");
                    }}
                    className="flex w-full min-h-[44px] flex-col items-start justify-center px-3 py-2 text-left hover:bg-ds-surface-2"
                  >
                    <span className="text-[13px] text-ds-text-1">{opt.label}</span>
                    {opt.sub && <span className="text-[12px] text-ds-text-4">{opt.sub}</span>}
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
