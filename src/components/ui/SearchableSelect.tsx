"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type SearchableOption = {
  id: string;
  label: string;
  description?: string;
  searchText?: string;
};

interface SearchableSelectProps {
  value: string;
  options: SearchableOption[];
  placeholder: string;
  emptyText?: string;
  disabled?: boolean;
  onChange: (id: string) => void;
}

export function SearchableSelect({
  value,
  options,
  placeholder,
  emptyText = "Sin resultados",
  disabled,
  onChange,
}: SearchableSelectProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(() => options.find((opt) => opt.id === value) ?? null, [options, value]);

  useEffect(() => {
    if (!open) {
      setQuery(selected?.label ?? "");
    }
  }, [open, selected]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const filtered = useMemo(() => {
    const q = normalizeText(query);
    const ordered = [...options].sort((a, b) => a.label.localeCompare(b.label, "es"));
    if (!q) return ordered.slice(0, 60);

    const startsWith: SearchableOption[] = [];
    const includes: SearchableOption[] = [];
    for (const opt of ordered) {
      const search = normalizeText(opt.searchText ?? `${opt.label} ${opt.description ?? ""}`);
      if (search.startsWith(q)) startsWith.push(opt);
      else if (search.includes(q)) includes.push(opt);
    }
    return [...startsWith, ...includes].slice(0, 60);
  }, [options, query]);

  const displayValue = open ? query : (value ? (selected?.label ?? "") : "");

  return (
    <div ref={boxRef} className="relative">
      <Input
        value={displayValue}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          setOpen(true);
          if (value) onChange("");
        }}
        className="h-9"
      />

      {open && !disabled && (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-md">
          {filtered.length === 0 ? (
            <div className="px-2 py-2 text-sm text-muted-foreground">{emptyText}</div>
          ) : (
            filtered.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className="w-full rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(opt.id);
                  setQuery(opt.label);
                  setOpen(false);
                }}
              >
                <div className="font-medium">{opt.label}</div>
                {opt.description ? (
                  <div className="text-xs text-muted-foreground">{opt.description}</div>
                ) : null}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
