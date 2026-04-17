"use client";

/**
 * TokenPickerPopover — Popover buscable para insertar tokens/placeholders
 * en el editor. Reutiliza TOKEN_MODULES del registry y filtra por query.
 */

import { useState, useMemo } from "react";
import type { Editor } from "@tiptap/react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TOKEN_MODULES } from "@/lib/docs/token-registry";

interface Props {
  editor: Editor | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor?: React.ReactNode;
  filterModules?: string[];
}

export function TokenPickerPopover({
  editor,
  open,
  onOpenChange,
  anchor,
  filterModules,
}: Props) {
  const [query, setQuery] = useState("");

  const filteredModules = useMemo(() => {
    const base = filterModules
      ? TOKEN_MODULES.filter((m) => filterModules.includes(m.key))
      : TOKEN_MODULES;
    if (!query.trim()) return base;
    const q = query.toLowerCase().trim();
    return base
      .map((mod) => ({
        ...mod,
        tokens: mod.tokens.filter(
          (tok) =>
            tok.key.toLowerCase().includes(q) ||
            tok.label.toLowerCase().includes(q)
        ),
      }))
      .filter((mod) => mod.tokens.length > 0);
  }, [query, filterModules]);

  const insertToken = (moduleKey: string, tokenKey: string, label: string) => {
    if (!editor) return;
    const signerMatch = /^signature\.signer_(\d+)$/.exec(tokenKey);
    const signerOrder = signerMatch ? parseInt(signerMatch[1], 10) : null;
    editor
      .chain()
      .focus()
      .insertContent({
        type: "contractToken",
        attrs: {
          module: moduleKey,
          tokenKey,
          label,
          ...(signerOrder != null && { signerOrder }),
        },
      })
      .insertContent(" ")
      .run();
    onOpenChange(false);
    setQuery("");
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{anchor ?? <span className="hidden" />}</PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="start">
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar token..."
              className="h-8 pl-8 text-sm"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto p-1">
          {filteredModules.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">
              No hay tokens que coincidan
            </p>
          ) : (
            filteredModules.map((mod) => (
              <div key={mod.key} className="mb-2">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {mod.label}
                </div>
                {mod.tokens.map((tok) => (
                  <button
                    key={tok.key}
                    type="button"
                    onClick={() => insertToken(mod.key, tok.key, tok.label)}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent"
                  >
                    <span className="font-medium">{tok.label}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {tok.key}
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
