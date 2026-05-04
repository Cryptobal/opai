"use client";

import { Bell, Loader2, Mail, Monitor, Save, Search, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PrefsSearchBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  saving: boolean;
  dirtyCount: number;
  onSave: () => void;
}

export function PrefsSearchBar({
  query,
  onQueryChange,
  saving,
  dirtyCount,
  onSave,
}: PrefsSearchBarProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-3 sticky top-2 z-10 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input
          placeholder="Buscar tipo de notificación..."
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          className="h-9"
        />
        <Button
          onClick={onSave}
          disabled={saving || dirtyCount === 0}
          size="sm"
          className="gap-1.5 shrink-0"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          {dirtyCount === 0 ? "Guardar" : `Guardar (${dirtyCount})`}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Bell className="h-3 w-3" /> Campana
        </span>
        <span className="inline-flex items-center gap-1">
          <Mail className="h-3 w-3" /> Email
        </span>
        <span className="inline-flex items-center gap-1">
          <Monitor className="h-3 w-3" /> Push escritorio
        </span>
        <span className="inline-flex items-center gap-1">
          <Smartphone className="h-3 w-3" /> Push móvil
        </span>
      </div>
    </div>
  );
}
