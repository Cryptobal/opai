"use client";

import { useEffect, useState } from "react";

export const TYPE_FILTERS = ["todos", "tecnica", "cliente", "supervision", "otra", "licitacion"] as const;
export type TypeFilter = (typeof TYPE_FILTERS)[number];

/** Vista principal: todo, solo reuniones/visitas, o solo tareas. */
export const VIEW_FILTERS = [
  ["todo", "Todo"],
  ["reuniones", "Reuniones"],
  ["tareas", "Tareas"],
] as const;
export type AgendaView = (typeof VIEW_FILTERS)[number][0];

type Props = {
  view: AgendaView;
  onViewChange: (v: AgendaView) => void;
  typeFilter: TypeFilter;
  onTypeChange: (t: TypeFilter) => void;
  assignedUserId: string;
  onAssignedChange: (id: string) => void;
  weekLabel: string;
  onPrevWeek: () => void;
  onToday: () => void;
  onNextWeek: () => void;
};

const navBtn = "h-10 rounded-xl border border-ds-border-default px-3 text-[13px] ds-tap sm:h-9";

export function AgendaFilters({
  view,
  onViewChange,
  typeFilter,
  onTypeChange,
  assignedUserId,
  onAssignedChange,
  weekLabel,
  onPrevWeek,
  onToday,
  onNextWeek,
}: Props) {
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    fetch("/api/crm/users")
      .then((r) => r.json())
      .then((j) => setUsers(j.data?.users ?? []))
      .catch(() => setUsers([]));
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={navBtn} onClick={onPrevWeek}>
        ← Semana
      </button>
      <button type="button" className={navBtn} onClick={onToday}>
        Hoy
      </button>
      <button type="button" className={navBtn} onClick={onNextWeek}>
        Semana →
      </button>
      <span className="text-[12px] text-ds-text-3">{weekLabel}</span>

      {/* Vista principal: segmentado estilo Notion (Todo / Reuniones / Tareas). */}
      <div className="flex items-center gap-0.5 rounded-xl bg-ds-surface-2 p-0.5">
        {VIEW_FILTERS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => onViewChange(key)}
            className={`h-9 rounded-[10px] px-3 text-[12px] font-medium ds-tap sm:h-8 ${
              view === key ? "bg-ds-surface-1 text-ds-text-1 shadow-sm" : "text-ds-text-3"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <select
          value={assignedUserId}
          onChange={(e) => onAssignedChange(e.target.value)}
          className="h-10 rounded-xl border border-ds-border-default bg-ds-surface-1 px-2 text-[12px] sm:h-9"
        >
          <option value="">Todos los responsables</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        {/* Chips de tipo: solo aplican a reuniones/visitas. */}
        {view !== "tareas" &&
          TYPE_FILTERS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onTypeChange(t)}
              className={`h-10 rounded-full px-3 text-[12px] ds-tap sm:h-9 ${
                typeFilter === t ? "bg-primary text-primary-foreground" : "bg-ds-surface-2 text-ds-text-2"
              }`}
            >
              {t}
            </button>
          ))}
      </div>
    </div>
  );
}
