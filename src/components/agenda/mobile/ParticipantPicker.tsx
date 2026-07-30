"use client";

import { useState } from "react";
import { Check, Plus, Search } from "lucide-react";
import { Avatar } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import type { AgendaTeamMember } from "../agenda-calendar.types";
import { hhmmChile } from "./agenda-mobile-utils";
import type { Availability } from "./useEventComposer";

type Props = {
  open: boolean;
  users: AgendaTeamMember[];
  selectedIds: string[];
  availability: Availability | null;
  onToggle: (userId: string) => void;
  onApplySuggestion: (isoStart: string) => void;
  onClose: () => void;
};

/** Selector de participantes fullscreen (spec §8) con disponibilidad inline. */
export function ParticipantPicker({
  open,
  users,
  selectedIds,
  availability,
  onToggle,
  onApplySuggestion,
  onClose,
}: Props) {
  const [query, setQuery] = useState("");
  if (!open) return null;

  const availByUser = new Map(availability?.users.map((u) => [u.userId, u]) ?? []);
  const q = query.trim().toLowerCase();
  const list = q ? users.filter((u) => u.name.toLowerCase().includes(q)) : users;

  return (
    <div className="opai-glass-strong fixed inset-0 z-[60] flex flex-col rounded-none lg:hidden">
      <header className="flex shrink-0 items-center justify-between px-4 pb-2 pt-3">
        <button type="button" onClick={onClose} className="h-11 rounded-xl px-2 text-ds-body text-ds-text-3 ds-tap">
          Cerrar
        </button>
        <p className="text-[14px] font-semibold text-ds-text-1">Participantes</p>
        <button type="button" onClick={onClose} className="h-11 rounded-xl px-2 text-ds-body font-semibold text-primary ds-tap">
          Listo
        </button>
      </header>

      <div className="px-4 pb-2">
        <div className="flex h-11 items-center gap-2 rounded-xl border border-ds-border-default bg-ds-surface-1 px-3">
          <Search className="h-4 w-4 text-ds-text-4" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar en el equipo…"
            className="w-full bg-transparent text-ds-body outline-none placeholder:text-ds-text-4"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 pb-6">
        {list.map((user) => {
          const selected = selectedIds.includes(user.id);
          const avail = availByUser.get(user.id);
          const conflict = avail?.busy[0] ?? null;
          return (
            <button
              key={user.id}
              type="button"
              onClick={() => onToggle(user.id)}
              className="opai-glass-soft flex w-full items-center gap-2.5 rounded-[16px] px-3 py-2 text-left ds-tap"
            >
              <Avatar name={user.name} size="md" className="h-9 w-9" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-ds-body font-medium text-ds-text-1">{user.name}</p>
                {avail ? (
                  conflict ? (
                    <p className="truncate text-[12px] text-status-danger-fg">
                      ⛔ Ocupado {hhmmChile(conflict.start)}–{hhmmChile(conflict.end)}
                      {conflict.title ? ` · ${conflict.title}` : ""}
                    </p>
                  ) : avail.hasGoogle ? (
                    <p className="text-[12px] text-status-ok-fg">✓ Libre</p>
                  ) : (
                    <p className="text-[12px] text-ds-text-4">sin Google — recibirá aviso OPAI</p>
                  )
                ) : (
                  <p className="text-[12px] text-ds-text-4">
                    {selected ? "Seleccionado" : "Toca para invitar"}
                  </p>
                )}
              </div>
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                  selected ? "bg-primary text-primary-foreground" : "border border-ds-border-default text-ds-text-3",
                )}
              >
                {selected ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              </span>
            </button>
          );
        })}

        {availability && availability.suggestions.length > 0 && (
          <section className="pt-3">
            <p className="mb-1.5 text-[12px] font-medium uppercase tracking-wide text-ds-text-4">
              Horarios donde todos están libres
            </p>
            <div className="flex flex-wrap gap-1.5">
              {availability.suggestions.map((s) => (
                <button
                  key={s.start}
                  type="button"
                  onClick={() => {
                    onApplySuggestion(s.start);
                    onClose();
                  }}
                  className="opai-glass-soft h-9 rounded-full px-3 font-mono text-[12px] text-ds-text-1 ds-tap"
                >
                  {new Date(s.start).toLocaleDateString("es-CL", {
                    weekday: "short",
                    day: "numeric",
                    timeZone: "America/Santiago",
                  })}{" "}
                  {hhmmChile(s.start)}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
