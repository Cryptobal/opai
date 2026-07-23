"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgendaSourceKey } from "./agenda-desktop-prefs";
import type { GoogleAccountStatus } from "./useAgendaDesktopData";

const OPAI_SOURCES: Array<{ key: AgendaSourceKey; label: string; swatch: string }> = [
  { key: "cliente", label: "Visitas cliente", swatch: "bg-tint-violet-fg" },
  { key: "tecnica", label: "Visitas técnicas", swatch: "bg-status-ok-fg" },
  { key: "tareas", label: "Tareas", swatch: "bg-primary" },
  { key: "licitaciones", label: "Licitaciones", swatch: "bg-status-warn-fg" },
];

const CAL_CONNECT_HREF =
  "/api/integrations/google-calendar/oauth/start?return=/opai/agenda";

type Props = {
  hiddenSources: AgendaSourceKey[];
  onToggleSource: (key: AgendaSourceKey) => void;
  counts: Partial<Record<AgendaSourceKey, number>>;
  google: GoogleAccountStatus | null;
};

/** Toggles de "calendarios" del rail: fuentes OPAI + calendario Google. */
export function AgendaCalendarToggles({
  hiddenSources,
  onToggleSource,
  counts,
  google,
}: Props) {
  const hidden = new Set(hiddenSources);

  const row = (
    key: AgendaSourceKey,
    label: string,
    swatch: string,
    count: number | undefined,
  ) => {
    const active = !hidden.has(key);
    return (
      <button
        key={key}
        type="button"
        onClick={() => onToggleSource(key)}
        aria-pressed={active}
        className="flex h-8 w-full items-center gap-2 rounded-lg px-1.5 text-left hover:bg-ds-surface-2 ds-tap"
      >
        <span
          className={cn(
            "inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded",
            active ? swatch : "border border-ds-border-default",
          )}
        >
          {active && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[13px]",
            active ? "text-ds-text-2" : "text-ds-text-4 line-through decoration-ds-text-4/40",
          )}
        >
          {label}
        </span>
        {typeof count === "number" && count > 0 && (
          <span className="shrink-0 font-mono text-[12px] text-ds-text-4">{count}</span>
        )}
      </button>
    );
  };

  return (
    <div className="space-y-3">
      <div className="space-y-0.5">
        <p className="px-1.5 pb-1 text-[12px] font-medium uppercase tracking-wide text-ds-text-4">
          Calendarios OPAI
        </p>
        {OPAI_SOURCES.map((s) => row(s.key, s.label, s.swatch, counts[s.key]))}
      </div>

      <div className="space-y-0.5">
        <p className="px-1.5 pb-1 text-[12px] font-medium uppercase tracking-wide text-ds-text-4">
          Google
        </p>
        {google?.connected ? (
          row("google", google.googleEmail ?? "Google Calendar", "bg-ds-text-4", counts.google)
        ) : (
          <a
            href={CAL_CONNECT_HREF}
            className="flex h-8 items-center rounded-lg px-1.5 text-[13px] text-primary underline-offset-2 hover:underline ds-tap"
          >
            Conectar Google Calendar
          </a>
        )}
      </div>
    </div>
  );
}
