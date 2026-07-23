"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Plus } from "lucide-react";
import { Avatar } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import type { AgendaTeamMember } from "./agenda-calendar.types";

/**
 * Multi-select de responsables con búsqueda, avatares y chips removibles.
 * Estado vacío = "Yo (por defecto)" (el creador queda como responsable). Tokens
 * DS v3. Reutiliza el tipo `AgendaTeamMember` (de /api/crm/users).
 */
export function TaskAssigneePicker({
  users,
  value,
  onChange,
  className,
}: {
  users: AgendaTeamMember[];
  value: string[];
  onChange: (ids: string[]) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const byId = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const selected = value.map((id) => byId.get(id)).filter((u): u is AgendaTeamMember => Boolean(u));

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users
      .filter((u) => !value.includes(u.id))
      .filter((u) => !q || u.name.toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q))
      .slice(0, 8);
  }, [users, value, query]);

  const add = (id: string) => {
    onChange([...value, id]);
    setQuery("");
  };
  const remove = (id: string) => onChange(value.filter((v) => v !== id));

  return (
    <div ref={ref} className={cn("relative", className)}>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-ds-border-default bg-ds-surface-1 p-1.5">
        {selected.length === 0 && (
          <span className="px-1.5 text-[12px] text-ds-text-4">Yo (por defecto)</span>
        )}
        {selected.map((u) => (
          <span
            key={u.id}
            className="flex items-center gap-1 rounded-full bg-ds-surface-2 py-0.5 pl-0.5 pr-1.5 text-[12px] text-ds-text-1"
          >
            <Avatar name={u.name} size="sm" variant="brand" />
            <span className="max-w-[120px] truncate">{u.name}</span>
            <button
              type="button"
              onClick={() => remove(u.id)}
              aria-label={`Quitar ${u.name}`}
              className="flex h-5 w-5 items-center justify-center rounded-full text-ds-text-4 hover:bg-ds-surface-3 hover:text-ds-text-1"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Agregar responsable"
          className="flex h-7 min-h-[28px] items-center gap-1 rounded-full px-2 text-[12px] text-ds-text-4 hover:bg-ds-surface-2 hover:text-ds-text-1"
        >
          <Plus className="h-3.5 w-3.5" /> Agregar
        </button>
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-ds-border-default bg-ds-surface-1 p-1.5 shadow-ds-lg">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre…"
            aria-label="Buscar responsable"
            autoFocus
            className="mb-1 h-9 w-full rounded-lg border border-ds-border-default bg-ds-surface-2 px-2.5 text-[13px] text-ds-text-1 placeholder:text-ds-text-4"
          />
          <div className="max-h-56 overflow-y-auto">
            {suggestions.length === 0 ? (
              <div className="px-2 py-3 text-center text-[12px] text-ds-text-4">Sin coincidencias</div>
            ) : (
              suggestions.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => add(u.id)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-ds-text-1 hover:bg-ds-surface-2"
                >
                  <Avatar name={u.name} size="sm" variant="brand" />
                  <span className="min-w-0 flex-1 truncate">{u.name}</span>
                  {u.email && <span className="truncate text-[12px] text-ds-text-4">{u.email}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
