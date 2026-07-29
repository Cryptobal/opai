"use client";

import { useCallback, useRef, useState, type KeyboardEvent } from "react";
import { ListFilter, Search, X } from "lucide-react";
import {
  useIslandSearchOpenListener,
  useModuleSurface,
} from "@/components/opai-ds";
import { chipsFromQuery, removeChipFromQuery } from "@/lib/search-tokens";
import { cn } from "@/lib/utils";
import { TopbarSearchOperators } from "./TopbarSearchOperators";

const MAX_SEARCH_LENGTH = 300;

/** Búsqueda permanente en la zona central del topbar (módulos sin tabs N3). */
export function TopbarSearchField() {
  const { search } = useModuleSurface();
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [opsOpen, setOpsOpen] = useState(false);
  const focusInput = useCallback(() => inputRef.current?.focus(), []);
  useIslandSearchOpenListener(focusInput);

  if (!search) return null;

  const chips = chipsFromQuery(search.value);
  const operators = search.operators ?? [];
  const hasValue = search.value.length > 0;

  function insertOp(token: string) {
    const next = search!.value.trim()
      ? `${search!.value.trim()} ${token}`
      : token;
    search!.onChange(next.slice(0, MAX_SEARCH_LENGTH));
    inputRef.current?.focus();
  }

  function clear() {
    search!.onChange("");
    search!.onExit?.();
    inputRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpsOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      inputRef.current?.blur();
    }
  }

  return (
    <div className="relative flex h-full min-w-0 flex-1 items-center">
      <div
        className={cn(
          "relative flex h-9 w-full max-w-[640px] min-w-0 items-center gap-1.5 px-1",
          focused && "text-ds-text-1",
        )}
      >
        <Search
          className="pointer-events-none h-[15px] w-[15px] shrink-0 text-ds-text-4"
          aria-hidden
        />
        {chips.length > 0 && (
          <div className="flex shrink-0 max-w-[45%] items-center gap-1 overflow-x-auto scrollbar-none">
            {chips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() =>
                  search.onChange(removeChipFromQuery(search.value, chip.token))
                }
                className="inline-flex h-6 shrink-0 items-center gap-0.5 rounded-full border border-ds-border-default bg-ds-surface-1 px-1.5 text-[12px] text-ds-text-2 ds-tap hover:bg-ds-surface-3"
                title={`Quitar ${chip.label}`}
              >
                <span className="max-w-[7rem] truncate font-mono">
                  {chip.label}
                </span>
                <X className="h-3 w-3 text-ds-text-4" aria-hidden />
              </button>
            ))}
          </div>
        )}
        <input
          ref={inputRef}
          id="module-search-input"
          className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-ds-text-1 outline-none placeholder:text-ds-text-4"
          placeholder={search.placeholder}
          value={search.value}
          maxLength={MAX_SEARCH_LENGTH}
          autoComplete="off"
          onChange={(e) => search.onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
        />
        {!focused && !hasValue && (
          <kbd
            className="pointer-events-none hidden shrink-0 rounded border border-ds-border-subtle bg-ds-surface-1 px-1.5 py-0.5 font-mono text-[12px] text-ds-text-4 sm:inline"
            aria-hidden
          >
            /
          </kbd>
        )}
        {hasValue && (
          <button
            type="button"
            onClick={clear}
            aria-label="Limpiar búsqueda"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ds-text-3 ds-tap hover:bg-ds-surface-3 hover:text-ds-text-1"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {operators.length > 0 && (
          <button
            type="button"
            aria-label="Filtros de búsqueda"
            aria-expanded={opsOpen}
            aria-haspopup="listbox"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setOpsOpen((v) => !v)}
            className={cn(
              "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ds-text-3 ds-tap hover:bg-ds-surface-3 hover:text-ds-text-1",
              opsOpen && "bg-ds-surface-3 text-primary",
            )}
          >
            <ListFilter className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <TopbarSearchOperators
        open={opsOpen}
        onClose={() => setOpsOpen(false)}
        operators={operators}
        onInsert={insertOp}
      />
    </div>
  );
}
