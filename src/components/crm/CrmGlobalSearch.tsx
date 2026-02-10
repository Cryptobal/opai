"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, Users, Building2, Contact, TrendingUp, MapPin, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

type SearchResult = {
  id: string;
  type: "lead" | "account" | "contact" | "deal" | "quote" | "installation";
  title: string;
  subtitle: string;
  href: string;
};

const TYPE_CONFIG: Record<
  string,
  { label: string; groupLabel: string; icon: typeof Users; color: string; bgColor: string }
> = {
  lead: { label: "Lead", groupLabel: "Leads", icon: Users, color: "text-emerald-400", bgColor: "bg-emerald-400/10" },
  account: { label: "Cuenta", groupLabel: "Cuentas", icon: Building2, color: "text-blue-400", bgColor: "bg-blue-400/10" },
  contact: { label: "Contacto", groupLabel: "Contactos", icon: Contact, color: "text-sky-400", bgColor: "bg-sky-400/10" },
  deal: { label: "Negocio", groupLabel: "Negocios", icon: TrendingUp, color: "text-purple-400", bgColor: "bg-purple-400/10" },
  quote: { label: "Cotización", groupLabel: "Cotizaciones", icon: FileText, color: "text-amber-400", bgColor: "bg-amber-400/10" },
  installation: { label: "Instalación", groupLabel: "Instalaciones", icon: MapPin, color: "text-teal-400", bgColor: "bg-teal-400/10" },
};

export function CrmGlobalSearch({ className }: { className?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.success) {
        setResults(data.data);
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
    router.push(result.href);
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Keyboard navigation
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

  // Group results by type
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.type]) acc[r.type] = [];
    acc[r.type].push(r);
    return acc;
  }, {});

  const showDropdown = open && query.trim().length >= 2;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => query.trim().length >= 2 && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Buscar en CRM..."
          className="w-full h-9 rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-border bg-card shadow-xl max-h-[400px] overflow-y-auto">
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
                      key={result.id}
                      type="button"
                      onClick={() => selectResult(result)}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                        globalIdx === activeIndex
                          ? "bg-accent text-foreground"
                          : "hover:bg-accent/50"
                      )}
                    >
                      <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", config.bgColor)}>
                        <Icon className={cn("h-4 w-4", config.color)} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{result.title}</p>
                        {result.subtitle && (
                          <p className="text-xs text-muted-foreground truncate">{result.subtitle}</p>
                        )}
                      </div>
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", config.bgColor, config.color)}>
                        {config.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
