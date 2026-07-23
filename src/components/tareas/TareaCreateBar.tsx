"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgendaTeamMember } from "@/components/agenda/agenda-calendar.types";
import { dateAtChileSlot } from "@/components/agenda/agenda-calendar-utils";
import { TaskTimePicker } from "@/components/agenda/TaskTimePicker";
import { TaskAssigneePicker } from "@/components/agenda/TaskAssigneePicker";
import type { TareaCreateInput } from "./types";

const INPUT =
  "h-10 rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] text-ds-text-1";

/** Fila de creación inline de tareas (título + fecha/hora 15' + responsables). */
export function TareaCreateBar({
  users,
  onCreate,
  onDone,
}: {
  users: AgendaTeamMember[];
  onCreate: (input: TareaCreateInput) => Promise<boolean>;
  onDone?: () => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    const allDay = !time;
    const [hh, mm] = (time || "09:00").split(":").map(Number);
    const dueAt = date ? dateAtChileSlot(date, hh * 60 + mm).toISOString() : null;
    const ok = await onCreate({ title: title.trim(), dueAt, allDay, assigneeIds });
    setSaving(false);
    if (ok) {
      setTitle("");
      setDate("");
      setTime("");
      setAssigneeIds([]);
      onDone?.();
    }
  };

  return (
    <div className="space-y-2 rounded-2xl border border-ds-border-default bg-ds-surface-2 p-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
        }}
        placeholder="Nueva tarea…"
        aria-label="Título de la tarea"
        className={cn(INPUT, "w-full")}
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Fecha de vencimiento (opcional)"
          className={cn(INPUT, "w-40")}
        />
        <TaskTimePicker value={time} onChange={setTime} />
        <div className="min-w-[180px] flex-1">
          <TaskAssigneePicker users={users} value={assigneeIds} onChange={setAssigneeIds} />
        </div>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!title.trim() || saving}
          className="flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-[13px] font-medium text-primary-foreground disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Agregar
        </button>
      </div>
    </div>
  );
}
