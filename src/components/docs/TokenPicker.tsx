"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Building2,
  User,
  MapPin,
  Handshake,
  FileSpreadsheet,
  Settings,
  Search,
  ChevronRight,
  Plus,
} from "lucide-react";
import { TOKEN_MODULES, type TokenDefinition } from "@/lib/docs/token-registry";
import { Button } from "@/components/ui/button";

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Building2,
  User,
  MapPin,
  Handshake,
  FileSpreadsheet,
  Settings,
};

interface TokenPickerProps {
  onSelect: (token: {
    module: string;
    tokenKey: string;
    label: string;
  }) => void;
  filterModules?: string[];
}

export function TokenPicker({ onSelect, filterModules }: TokenPickerProps) {
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [bonosCatalog, setBonosCatalog] = useState<Array<{ id: string; code: string; name: string }>>([]);

  useEffect(() => {
    if (filterModules?.includes("guardia")) {
      fetch("/api/payroll/bonos?active=false")
        .then((r) => r.json())
        .then((json) => setBonosCatalog(json.data || []))
        .catch(() => setBonosCatalog([]));
    } else {
      setBonosCatalog([]);
    }
  }, [filterModules]);

  const modules = useMemo(() => {
    if (filterModules && filterModules.length > 0) {
      return TOKEN_MODULES.filter((m) => filterModules.includes(m.key));
    }
    return TOKEN_MODULES;
  }, [filterModules]);

  const filteredTokens = useMemo(() => {
    if (!selectedModule) return [];
    const mod = modules.find((m) => m.key === selectedModule);
    if (!mod) return [];
    let tokens = mod.tokens;
    if (selectedModule === "guardia" && bonosCatalog.length > 0) {
      const bonoTokens = bonosCatalog.map((b) => ({
        key: `guardia.bono_${b.code}`,
        label: b.name,
        path: `bono_${b.code}`,
        type: "currency" as const,
      }));
      tokens = [...tokens, ...bonoTokens];
    }
    if (!search) return tokens;
    const q = search.toLowerCase();
    return tokens.filter(
      (t) =>
        t.label.toLowerCase().includes(q) ||
        t.key.toLowerCase().includes(q)
    );
  }, [selectedModule, search, modules, bonosCatalog]);

  const allFiltered = useMemo(() => {
    if (!search || selectedModule) return null;
    const q = search.toLowerCase();
    const results: (TokenDefinition & { moduleKey: string; moduleLabel: string })[] = [];
    for (const mod of modules) {
      let tokens = mod.tokens;
      if (mod.key === "guardia" && bonosCatalog.length > 0) {
        tokens = [
          ...tokens,
          ...bonosCatalog.map((b) => ({
            key: `guardia.bono_${b.code}`,
            label: b.name,
            path: `bono_${b.code}`,
            type: "currency" as const,
          })),
        ];
      }
      for (const token of tokens) {
        if (
          token.label.toLowerCase().includes(q) ||
          token.key.toLowerCase().includes(q)
        ) {
          results.push({ ...token, moduleKey: mod.key, moduleLabel: mod.label });
        }
      }
    }
    return results;
  }, [search, selectedModule, modules, bonosCatalog]);

  return (
    <div className="w-80 max-h-96 overflow-hidden flex flex-col bg-card">
      {/* Search */}
      <div className="p-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar token..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            autoFocus
          />
        </div>
      </div>

      <div className="overflow-y-auto flex-1">
        {/* Global search results */}
        {allFiltered && allFiltered.length > 0 && (
          <div className="p-1">
            {allFiltered.map((token) => (
              <button
                key={token.key}
                type="button"
                onClick={() =>
                  onSelect({
                    module: token.moduleKey,
                    tokenKey: token.key,
                    label: token.label,
                  })
                }
                className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors flex items-center gap-2 text-foreground"
              >
                <Plus className="h-3.5 w-3.5 text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{token.label}</span>
                  <span className="text-xs text-muted-foreground ml-1.5">
                    {token.moduleLabel}
                  </span>
                  <span className="block text-[11px] text-muted-foreground font-mono mt-0.5" title="Para condicionales: {{#if token.key>0}}">
                    {token.key}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        {allFiltered && allFiltered.length === 0 && search && (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No se encontraron tokens
          </div>
        )}

        {/* Module list */}
        {!selectedModule && !search && (
          <div className="p-1">
            {modules.map((mod) => {
              const Icon = ICON_MAP[mod.icon] || Settings;
              return (
                <button
                  key={mod.key}
                  type="button"
                  onClick={() => setSelectedModule(mod.key)}
                  className="w-full text-left px-3 py-2.5 rounded-md hover:bg-accent transition-colors flex items-center gap-3 text-foreground"
                >
                  <div className="h-8 w-8 rounded-md bg-primary/15 flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{mod.label}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {mod.description}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              );
            })}
          </div>
        )}

        {/* Module tokens */}
        {selectedModule && (
          <div>
            <div className="px-3 py-2 border-b border-border space-y-1">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-xs"
                  onClick={() => {
                    setSelectedModule(null);
                    setSearch("");
                  }}
                >
                  ← Volver
                </Button>
                <span className="text-xs font-medium text-muted-foreground">
                  {modules.find((m) => m.key === selectedModule)?.label}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                El <span className="font-mono">key</span> debajo de cada token se usa en condicionales:{" "}
                <span className="font-mono text-primary">{"{{#if key>0}}"}</span>
              </p>
            </div>
            <div className="p-1">
              {filteredTokens.map((token) => (
                <button
                  key={token.key}
                  type="button"
                  onClick={() =>
                    onSelect({
                      module: selectedModule,
                      tokenKey: token.key,
                      label: token.label,
                    })
                  }
                  className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors flex flex-col gap-0.5 text-foreground"
                >
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/15 text-primary text-xs font-mono border border-primary/30 w-fit">
                    {`{{${token.label}}}`}
                  </span>
                  <span className="text-[11px] text-muted-foreground font-mono" title="Usa este key en condicionales: {{#if token.key>0}}">
                    {token.key}
                  </span>
                </button>
              ))}
              {filteredTokens.length === 0 && (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No se encontraron tokens
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
