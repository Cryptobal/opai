"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Search,
  Loader2,
  Users,
  Building2,
  Contact,
  TrendingUp,
  MapPin,
  FileText,
  ShieldUser,
  File,
} from "lucide-react";
import { cn } from "@/lib/utils";

type SearchResult = {
  id: string;
  type:
    | "lead"
    | "account"
    | "contact"
    | "deal"
    | "quote"
    | "installation"
    | "guardia"
    | "document";
  title: string;
  subtitle: string;
  href: string;
};

const TYPE_CONFIG: Record<
  string,
  { label: string; groupLabel: string; icon: typeof Users; color: string; bgColor: string }
> = {
  lead: {
    label: "Lead",
    groupLabel: "Leads",
    icon: Users,
    color: "text-emerald-400",
    bgColor: "bg-emerald-400/10",
  },
  account: {
    label: "Cuenta",
    groupLabel: "Cuentas",
    icon: Building2,
    color: "text-blue-400",
    bgColor: "bg-blue-400/10",
  },
  contact: {
    label: "Contacto",
    groupLabel: "Contactos",
    icon: Contact,
    color: "text-sky-400",
    bgColor: "bg-sky-400/10",
  },
  deal: {
    label: "Negocio",
    groupLabel: "Negocios",
    icon: TrendingUp,
    color: "text-purple-400",
    bgColor: "bg-purple-400/10",
  },
  quote: {
    label: "Cotización",
    groupLabel: "Cotizaciones",
    icon: FileText,
    color: "text-amber-400",
    bgColor: "bg-amber-400/10",
  },
  installation: {
    label: "Instalación",
    groupLabel: "Instalaciones",
    icon: MapPin,
    color: "text-teal-400",
    bgColor: "bg-teal-400/10",
  },
  guardia: {
    label: "Guardia",
    groupLabel: "Guardias",
    icon: ShieldUser,
    color: "text-sky-400",
    bgColor: "bg-sky-400/10",
  },
  document: {
    label: "Documento",
    groupLabel: "Documentos",
    icon: File,
    color: "text-orange-400",
    bgColor: "bg-orange-400/10",
  },
};

interface GlobalSearchProps {
  className?: string;
  /** Listen to Cmd+K / Ctrl+K to focus the input */
  listenToCommandK?: boolean;
  /** Show the keyboard shortcut hint inside the input */
  showShortcutHint?: boolean;
  /** Compact placeholder for topbar usage */
  compact?: boolean;
  /** Called after the user selects a result and navigation starts */
  onNavigate?: () => void;
}

export function GlobalSearch({
  className,
  listenToCommandK = false,
  showShortcutHint = false,
  compact = false,
  onNavigate,
}: GlobalSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Cmd+K / Ctrl+K keyboard shortcut to focus search
  useEffect(() => {
    if (!listenToCommandK) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [listenToCommandK]);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/search/global?q=${encodeURIComponent(q)}`);
      const text = await res.text();
      let data: { success?: boolean; data?: SearchResult[] };
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        return;
      }
      if (data.success) {
        setResults(data.data ?? []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (value: string) => {
    setQuery(value);
    setActiveIndex(-1);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(() => search(value.trim()), 300);
  };

  const selectResult = (result: SearchResult) => {
    setQuery("");
    setResults([]);
    setOpen(false);
    onNavigate?.();
    router.push(result.href);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      selectResult(results[activeIndex]);
    }
  };

  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.type]) acc[r.type] = [];
    acc[r.type].push(r);
    return acc;
  }, {});

  const showDropdown = open && query.trim().length >= 2;

  // Posición del dropdown (para portal)
  const [dropdownRect, setDropdownRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!showDropdown || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setDropdownRect({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }, [showDropdown, results.length, loading]);

  const dropdownContent =
    showDropdown &&
    typeof document !== "undefined" &&
    dropdownRect && (
      <div
        ref={dropdownRef}
        className="fixed z-[9999] rounded-lg border border-border bg-card shadow-xl max-h-[400px] overflow-y-auto"
        style={{
          top: dropdownRect.top,
          left: dropdownRect.left,
          width: Math.max(dropdownRect.width, 360),
        }}
      >
        {results.length === 0 && !loading && (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            Sin resultados para &ldquo;{query}&rdquo;
          </div>
        )}

        {results.length === 0 && loading && (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
            Buscando...
          </div>
        )}

        {Object.entries(grouped).map(([type, items]) => {
          const config = TYPE_CONFIG[type];
          if (!config) return null;
          return (
            <div key={type}>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30 sticky top-0">
                {config.groupLabel}
              </div>
              {items.map((result) => {
                const Icon = config.icon;
                const globalIdx = results.indexOf(result);
                return (
                  <button
                    key={`${result.type}-${result.id}`}
                    type="button"
                    onClick={() => selectResult(result)}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                      globalIdx === activeIndex
                        ? "bg-accent text-foreground"
                        : "hover:bg-accent/50"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        config.bgColor
                      )}
                    >
                      <Icon className={cn("h-4 w-4", config.color)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{result.title}</p>
                      {result.subtitle && (
                        <p className="text-xs text-muted-foreground truncate">
                          {result.subtitle}
                        </p>
                      )}
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                        config.bgColor,
                        config.color
                      )}
                    >
                      {config.label}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    );

  return (
    <div ref={containerRef} className={cn("relative z-10", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => query.trim().length >= 2 && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={compact ? "Buscar..." : "Buscar en CRM, operaciones, documentos..."}
          className={cn(
            "w-full rounded-lg border border-border bg-background pl-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring",
            compact ? "h-8 pr-14" : "h-9 pr-3"
          )}
        />
        {showShortcutHint && !loading && !query && (
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none hidden sm:inline-flex h-5 select-none items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            <span className="text-xs">⌘</span>K
          </kbd>
        )}
        {loading && (
          <Loader2 className={cn(
            "absolute top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground",
            compact ? "right-2" : "right-3"
          )} />
        )}
      </div>

      {dropdownContent && createPortal(dropdownContent, document.body)}
    </div>
  );
}
