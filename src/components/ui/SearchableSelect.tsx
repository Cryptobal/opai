"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

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
  icon?: React.ReactNode;
};

function isTouchLikeDevice() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
}

/**
 * Hook que detecta el viewport mobile (<md = 768px). Usa matchMedia con
 * listener para mantener sincronía con resize. SSR-safe (default false).
 */
function useIsMobileViewport(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 767.98px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isMobile;
}

interface SearchableSelectProps {
  value: string;
  options: SearchableOption[];
  placeholder: string;
  emptyText?: string;
  disabled?: boolean;
  triggerClassName?: string;
  /** Si true, el dropdown se renderiza en portal para no cortarse en contenedores con overflow */
  dropdownInPortal?: boolean;
  onChange: (id: string) => void;
  /** Callback cuando el usuario escribe en el campo de búsqueda */
  onInputChange?: (query: string) => void;
}

export function SearchableSelect({
  value,
  options,
  placeholder,
  emptyText = "Sin resultados",
  disabled,
  triggerClassName,
  dropdownInPortal = false,
  onChange,
  onInputChange,
}: SearchableSelectProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [portalRect, setPortalRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const portalRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const isMobile = useIsMobileViewport();

  const updatePortalRect = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setPortalRect({ top: rect.bottom + 6, left: rect.left, width: rect.width });
  }, []);

  useLayoutEffect(() => {
    if (!open || !dropdownInPortal) return;
    updatePortalRect();
    const onScrollOrResize = () => updatePortalRect();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, dropdownInPortal, updatePortalRect]);

  const focusTrigger = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    try {
      trigger.focus({ preventScroll: true });
    } catch {
      trigger.focus();
    }
  }, []);

  const selected = useMemo(
    () => options.find((opt) => opt.id === value) ?? null,
    [options, value],
  );

  useEffect(() => {
    if (!open) {
      setQuery("");
      setHighlightIdx(-1);
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        if (isTouchLikeDevice()) return;
        searchRef.current?.focus();
      });
    }
  }, [open]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      const insideTrigger = boxRef.current?.contains(target);
      const insidePortal = portalRef.current?.contains(target);
      if (!insideTrigger && !insidePortal) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const filtered = useMemo(() => {
    const q = normalizeText(query);
    const ordered = [...options].sort((a, b) =>
      a.label.localeCompare(b.label, "es"),
    );
    if (!q) return ordered.slice(0, 100);

    const startsWith: SearchableOption[] = [];
    const includes: SearchableOption[] = [];
    for (const opt of ordered) {
      const search = normalizeText(
        opt.searchText ?? `${opt.label} ${opt.description ?? ""}`,
      );
      if (search.startsWith(q)) startsWith.push(opt);
      else if (search.includes(q)) includes.push(opt);
    }
    return [...startsWith, ...includes].slice(0, 100);
  }, [options, query]);

  useEffect(() => {
    setHighlightIdx(-1);
  }, [filtered]);

  const scrollToIdx = useCallback((idx: number) => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll("[data-item]");
    items[idx]?.scrollIntoView({ block: "nearest" });
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault();
        if (!open) { setOpen(true); return; }
        const next = Math.min(highlightIdx + 1, filtered.length - 1);
        setHighlightIdx(next);
        scrollToIdx(next);
        break;
      }
      case "ArrowUp": {
        e.preventDefault();
        const prev = Math.max(highlightIdx - 1, 0);
        setHighlightIdx(prev);
        scrollToIdx(prev);
        break;
      }
      case "Enter": {
        e.preventDefault();
        if (!open) { setOpen(true); return; }
        if (highlightIdx >= 0 && filtered[highlightIdx]) {
          onChange(filtered[highlightIdx].id);
          setOpen(false);
          focusTrigger();
        }
        break;
      }
      case "Escape":
        e.preventDefault();
        setOpen(false);
        focusTrigger();
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  function highlightMatch(text: string) {
    if (!query) return text;
    const q = normalizeText(query);
    const normalizedText = normalizeText(text);
    const idx = normalizedText.indexOf(q);
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <span className="text-primary font-semibold">
          {text.slice(idx, idx + q.length)}
        </span>
        {text.slice(idx + q.length)}
      </>
    );
  }

  return (
    <div ref={boxRef} className="relative w-full min-w-0">
      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        className={cn(
          "group flex h-9 w-full items-center gap-2 rounded-lg border bg-background px-3 text-sm transition-all duration-200",
          "focus-visible:outline-none",
          open
            ? "border-primary/50 ring-2 ring-primary/20 shadow-sm shadow-primary/5"
            : "border-input hover:border-muted-foreground/30 hover:bg-accent/30",
          disabled && "cursor-not-allowed opacity-50",
          triggerClassName,
        )}
      >
        {selected ? (
          <span className="flex-1 min-w-0 truncate text-left font-medium text-foreground">
            {selected.label}
          </span>
        ) : (
          <span className="flex-1 min-w-0 truncate text-left text-muted-foreground">
            {placeholder}
          </span>
        )}
        {value && !disabled ? (
          <span
            role="button"
            tabIndex={-1}
            className="shrink-0 rounded-full p-0.5 text-muted-foreground/50 hover:text-foreground hover:bg-accent transition-all"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
          >
            <X className="h-3 w-3" />
          </span>
        ) : null}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform duration-200",
            open && "rotate-180 text-primary/70",
          )}
        />
      </button>

      {/* Dropdown (desktop: popover anclado | mobile: bottom sheet vía portal) */}
      {open && !disabled && (() => {
        const searchInput = (
          <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground/50" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Buscar..."
              value={query}
              className="flex-1 min-w-0 bg-transparent text-sm sm:text-sm outline-none placeholder:text-muted-foreground/50"
              style={isMobile ? { fontSize: 16 } : undefined}
              onChange={(e) => {
                setQuery(e.target.value);
                onInputChange?.(e.target.value);
              }}
              onKeyDown={handleKeyDown}
            />
            {query && (
              <span className="shrink-0 rounded-md bg-muted/50 px-1.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                {filtered.length}
              </span>
            )}
          </div>
        );

        const optionsList = (
          <div
            ref={listRef}
            className={cn(
              "overflow-auto overscroll-contain p-1",
              isMobile ? "flex-1" : "max-h-[min(18rem,65vh)]",
            )}
          >
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1.5 px-3 py-8 text-muted-foreground">
                <Search className="h-5 w-5 opacity-40" />
                <span className="text-sm">{emptyText}</span>
                {query && (
                  <span className="text-sm opacity-60">
                    Prueba con otro término
                  </span>
                )}
              </div>
            ) : (
              filtered.map((opt, i) => {
                const isSelected = opt.id === value;
                const isHighlighted = i === highlightIdx;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    data-item
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg text-left text-sm transition-colors duration-75",
                      isMobile ? "px-3 py-3" : "px-2.5 py-2",
                      isHighlighted && "bg-accent text-accent-foreground",
                      !isHighlighted && "hover:bg-accent/50",
                      isSelected && !isHighlighted && "bg-primary/5",
                    )}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setHighlightIdx(i)}
                    onClick={() => {
                      onChange(opt.id);
                      setOpen(false);
                      if (!isTouchLikeDevice()) focusTrigger();
                    }}
                  >
                    {isSelected && (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10">
                        <Check className="h-3 w-3 text-primary" />
                      </span>
                    )}
                    {opt.icon && !isSelected && (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground/60">
                        {opt.icon}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className={cn(
                        "truncate",
                        isSelected ? "font-semibold text-primary" : "font-normal",
                      )}>
                        {highlightMatch(opt.label)}
                      </div>
                      {opt.description && (
                        <div className="truncate text-sm text-muted-foreground/70 mt-0.5">
                          {highlightMatch(opt.description)}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        );

        const counterFooter = filtered.length > 0 && options.length > 5 && (
          <div className="border-t border-border/40 px-3 py-1.5">
            <span className="text-xs text-muted-foreground/50">
              {filtered.length} de {options.length} opciones
            </span>
          </div>
        );

        // Mobile: bottom sheet en portal con backdrop. Search sticky arriba,
        // lista flex-1 scrollable. Cancel en footer para cerrar sin elegir.
        if (isMobile && typeof document !== "undefined") {
          return createPortal(
            <>
              <div
                aria-hidden
                className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-in fade-in-0 duration-150"
                onClick={() => setOpen(false)}
              />
              <div
                role="dialog"
                aria-modal="true"
                ref={portalRef}
                className={cn(
                  "fixed inset-x-0 bottom-0 z-50 flex flex-col",
                  "bg-popover border-t border-border/80 rounded-t-2xl shadow-xl",
                  "animate-in slide-in-from-bottom duration-200",
                  "max-h-[85dvh]",
                )}
                style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
              >
                <div
                  aria-hidden
                  className="mx-auto mt-2 mb-1 h-1 w-9 rounded-full bg-muted-foreground/30"
                />
                {searchInput}
                {optionsList}
                {counterFooter}
                <div className="border-t border-border/60 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="w-full rounded-lg bg-muted py-2.5 text-sm font-medium text-foreground hover:bg-muted/80 active:bg-muted transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </>,
            document.body,
          );
        }

        // Desktop: popover anclado al trigger.
        const dropdownContent = (
          <div
            ref={dropdownInPortal ? portalRef : undefined}
            className={cn(
              "z-50 rounded-xl border border-border/80 bg-popover shadow-xl shadow-black/25 overflow-hidden",
              "animate-in fade-in-0 zoom-in-[0.98] slide-in-from-top-1 duration-150",
              dropdownInPortal && portalRect ? "fixed" : "absolute mt-1.5 w-full",
            )}
            style={
              dropdownInPortal && portalRect
                ? { top: portalRect.top, left: portalRect.left, minWidth: portalRect.width }
                : undefined
            }
          >
            {searchInput}
            {optionsList}
            {counterFooter}
          </div>
        );
        return dropdownInPortal && typeof document !== "undefined"
          ? createPortal(dropdownContent, document.body)
          : dropdownContent;
      })()}
    </div>
  );
}
