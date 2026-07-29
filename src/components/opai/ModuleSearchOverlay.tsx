"use client";

import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import type { IslandSearch } from "@/components/opai-ds";
import { chipsFromQuery, removeChipFromQuery } from "@/lib/search-tokens";
import { cn } from "@/lib/utils";
import { ModuleSearchOperators } from "./ModuleSearchOperators";

const MAX_SEARCH_LENGTH = 300;

type Props = {
  open: boolean;
  onClose: () => void;
  search: IslandSearch;
  /** Elemento al que devolver el foco al cerrar (botón lupa). */
  returnFocusRef?: React.RefObject<HTMLElement | null>;
};

export function ModuleSearchOverlay({
  open,
  onClose,
  search,
  returnFocusRef,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const chips = chipsFromQuery(search.value);
  const operators = search.operators ?? [];

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    return () => {
      const el = returnFocusRef?.current;
      const focusable =
        el?.matches?.("button, [href], input")
          ? el
          : el?.querySelector?.<HTMLElement>("button, [href], input");
      focusable?.focus();
    };
  }, [open, returnFocusRef]);

  if (!open || typeof document === "undefined") return null;

  function insertOp(token: string) {
    const next = search.value.trim()
      ? `${search.value.trim()} ${token}`
      : token;
    search.onChange(next.slice(0, MAX_SEARCH_LENGTH));
    inputRef.current?.focus();
  }

  function clearAndClose() {
    search.onChange("");
    search.onExit?.();
    onClose();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      onClose();
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] motion-reduce:animate-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        aria-label="Cerrar búsqueda"
        className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in duration-200 motion-reduce:animate-none"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative mx-auto mt-14 w-full max-w-[720px] rounded-2xl border border-ds-border-default bg-ds-surface-1 p-3 shadow-ds-lg",
          "animate-in slide-in-from-top-4 duration-200 motion-reduce:animate-none",
        )}
      >
        <p id={titleId} className="sr-only">
          Buscar en el módulo
        </p>
        <div className="relative flex items-center gap-2">
          <Search
            className="pointer-events-none absolute left-3 h-4 w-4 text-ds-text-4"
            aria-hidden
          />
          <input
            ref={inputRef}
            id="module-search-input"
            className="h-11 w-full rounded-xl bg-ds-surface-2 pl-9 pr-10 text-[13px] text-ds-text-1 outline-none placeholder:text-ds-text-4 sm:h-10"
            placeholder={search.placeholder}
            value={search.value}
            maxLength={MAX_SEARCH_LENGTH}
            autoComplete="off"
            onChange={(e) => search.onChange(e.target.value)}
            onKeyDown={onKeyDown}
          />
          {search.value.length > 0 && (
            <button
              type="button"
              onClick={clearAndClose}
              aria-label="Limpiar y cerrar búsqueda"
              className="absolute right-1.5 inline-flex h-9 w-9 items-center justify-center rounded-full text-ds-text-3 ds-tap hover:bg-ds-surface-3 hover:text-ds-text-1"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {chips.length > 0 && (
          <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
            {chips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() =>
                  search.onChange(
                    removeChipFromQuery(search.value, chip.token),
                  )
                }
                className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full border border-ds-border-default bg-ds-surface-2 px-2.5 text-[12px] text-ds-text-2 ds-tap hover:bg-ds-surface-3 sm:h-8"
                title={`Quitar ${chip.label}`}
              >
                <span className="max-w-[12rem] truncate font-mono">
                  {chip.label}
                </span>
                <X className="h-3.5 w-3.5 text-ds-text-4" aria-hidden />
              </button>
            ))}
          </div>
        )}

        <ModuleSearchOperators operators={operators} onInsert={insertOp} />
      </div>
    </div>,
    document.body,
  );
}
