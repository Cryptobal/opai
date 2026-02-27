"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Settings2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  searchConfig,
  type ConfigSearchResult,
} from "@/lib/configuracion/search-index";

export function ConfigSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ConfigSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Search on query change
  useEffect(() => {
    const r = searchConfig(query);
    setResults(r);
    setSelectedIndex(0);
  }, [query]);

  // Global keyboard shortcut ⌘K / Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const navigate = useCallback(
    (result: ConfigSearchResult) => {
      setOpen(false);
      setQuery("");
      router.push(result.href);
    },
    [router],
  );

  // Keyboard navigation in results
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open || results.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        navigate(results[selectedIndex]);
      }
    },
    [open, results, selectedIndex, navigate],
  );

  // Group results by type
  const sectionResults = results.filter((r) => r.type === "section");
  const settingResults = results.filter((r) => r.type === "setting");
  const hasResults = results.length > 0;
  const showDropdown = open && query.length >= 2;

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value.length >= 2) setOpen(true);
          }}
          onFocus={() => {
            if (query.length >= 2) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Buscar configuración... (ej: pipeline, feriados, QR, firma)"
          className="w-full rounded-lg border border-border bg-card/70 py-2.5 pl-9 pr-20 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          {query && (
            <button
              onClick={() => {
                setQuery("");
                setOpen(false);
                inputRef.current?.focus();
              }}
              className="p-1 rounded-md hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute z-50 mt-1.5 w-full rounded-lg border border-border bg-card shadow-lg overflow-hidden">
          {!hasResults ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No se encontraron resultados para &quot;{query}&quot;
            </div>
          ) : (
            <div className="max-h-[360px] overflow-y-auto py-1">
              {sectionResults.length > 0 && (
                <div>
                  <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Secciones
                  </p>
                  {sectionResults.map((result, i) => {
                    const globalIndex = i;
                    return (
                      <button
                        key={`section-${result.sectionId}`}
                        onClick={() => navigate(result)}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                        className={cn(
                          "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
                          selectedIndex === globalIndex
                            ? "bg-accent/60"
                            : "hover:bg-accent/40",
                        )}
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <Settings2 className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {result.label}
                          </p>
                          {result.description && (
                            <p className="text-xs text-muted-foreground truncate">
                              {result.description}
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {result.group}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {settingResults.length > 0 && (
                <div>
                  {sectionResults.length > 0 && (
                    <div className="mx-3 border-t border-border" />
                  )}
                  <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Configuraciones específicas
                  </p>
                  {settingResults.map((result, i) => {
                    const globalIndex = sectionResults.length + i;
                    return (
                      <button
                        key={`setting-${result.sectionId}-${result.tab}-${result.label}`}
                        onClick={() => navigate(result)}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                        className={cn(
                          "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
                          selectedIndex === globalIndex
                            ? "bg-accent/60"
                            : "hover:bg-accent/40",
                        )}
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                          <ArrowRight className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {result.label}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {result.sectionLabel}
                            {result.tab ? ` → ${result.tab}` : ""}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {result.group}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
