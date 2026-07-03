"use client";

import { Bell, Loader2, Mail, Monitor, Save, Search, Slack, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PrefsSearchBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  saving: boolean;
  dirtyCount: number;
  onSave: () => void;
  /** Tenant con workspace Slack ACTIVO → se muestra la leyenda Slack. */
  showSlack?: boolean;
  /** El usuario tiene vínculo → sin CTA de vinculación. */
  slackLinked?: boolean;
}

export function PrefsSearchBar({
  query,
  onQueryChange,
  saving,
  dirtyCount,
  onSave,
  showSlack = false,
  slackLinked = false,
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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
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
        {showSlack && (
          <span className="inline-flex items-center gap-1">
            <Slack className="h-3 w-3" /> Slack{" "}
            {slackLinked ? (
              "(DM del bot)"
            ) : (
              <span className="text-status-warn-fg">· vincula tu Slack (DM al bot OPAI)</span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
