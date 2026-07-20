"use client";

import { useEffect, useState } from "react";

export const TYPE_FILTERS = ["todos", "tecnica", "cliente", "supervision", "otra", "licitacion"] as const;
export type TypeFilter = (typeof TYPE_FILTERS)[number];

type Props = {
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
        {TYPE_FILTERS.map((t) => (
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
