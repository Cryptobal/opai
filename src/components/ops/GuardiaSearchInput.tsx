"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

export type GuardiaSearchResult = {
  id: string;
  nombreCompleto: string;
  code?: string;
  rut?: string;
};

interface GuardiaSearchInputProps {
  value: string;
  onChange: (patch: { guardiaNombre: string; guardiaId?: string | null }) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const DEBOUNCE_MS = 250;

export function GuardiaSearchInput({
  value,
  onChange,
  placeholder = "Buscar o escribir nombre",
  className = "",
  disabled = false,
}: GuardiaSearchInputProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<GuardiaSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const fetchResults = useCallback(async (q: string) => {
    if (!q || q.length < 2) {
      setResults([]);
      setOpen(false);
      setPosition(null);
      return;
    }
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    try {
      const res = await fetch(
        `/api/ops/guardias-active-search?q=${encodeURIComponent(q)}`,
        { signal: abortRef.current.signal, credentials: "include" }
      );
      const json = await res.json();
      if (res.ok && json.success && Array.isArray(json.data)) {
        setResults(json.data);
        setHighlightIdx(-1);
        if (json.data.length > 0) {
          setOpen(true);
        } else {
          setOpen(false);
        }
      } else {
        setResults([]);
        setOpen(false);
      }
    } catch {
      setResults([]);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setQuery(v);
      onChange({ guardiaNombre: v, guardiaId: null });

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        fetchResults(v);
      }, DEBOUNCE_MS);
    },
    [onChange, fetchResults]
  );

  const handleSelect = useCallback(
    (g: GuardiaSearchResult) => {
      setQuery(g.nombreCompleto);
      onChange({ guardiaNombre: g.nombreCompleto, guardiaId: g.id });
      setOpen(false);
      setResults([]);
      inputRef.current?.blur();
    },
    [onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open || results.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIdx((prev) => (prev < results.length - 1 ? prev + 1 : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIdx((prev) => (prev > 0 ? prev - 1 : results.length - 1));
      } else if (e.key === "Enter" && highlightIdx >= 0 && results[highlightIdx]) {
        e.preventDefault();
        handleSelect(results[highlightIdx]);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    },
    [open, results, highlightIdx, handleSelect]
  );

  useEffect(() => {
    const handleClickOutside = (ev: MouseEvent) => {
      const target = ev.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (document.querySelector("[data-guardia-dropdown]")?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const dropdown =
    open &&
    results.length > 0 && (
      <ul
        data-guardia-dropdown
        role="listbox"
        className="absolute left-0 right-0 top-full z-[9999] mt-1 max-h-52 overflow-auto rounded-lg border border-border bg-popover py-1 text-sm shadow-xl"
      >
        {results.map((g, idx) => (
          <li
            key={g.id}
            role="option"
            aria-selected={idx === highlightIdx}
            className={`cursor-pointer px-3 py-2.5 ${
              idx === highlightIdx ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"
            }`}
            onClick={() => handleSelect(g)}
          >
            <span className="font-medium">{g.nombreCompleto}</span>
            {g.code && (
              <span className="ml-2 text-xs text-muted-foreground">Cód. {g.code}</span>
            )}
          </li>
        ))}
      </ul>
    );

  return (
    <div ref={containerRef} className="relative flex-1">
      <Input
        ref={inputRef}
        value={query}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
      />
      {dropdown}
      {loading && query.length >= 2 && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
          Buscando…
        </div>
      )}
    </div>
  );
}
