"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgendaTeamMember } from "@/components/agenda/agenda-calendar.types";
import { TaskAssigneePicker } from "@/components/agenda/TaskAssigneePicker";
import { TareaDueChips, type DueValue } from "./TareaDueChips";
import type { TareaCreateInput } from "./types";

const INPUT =
  "w-full rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-ds-body text-ds-text-1 opai-glass-soft placeholder:text-ds-text-4";

/** Creación inline de tareas (título + detalles + vencimiento sin nativos + responsables). */
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
  const [notes, setNotes] = useState("");
  const [due, setDue] = useState<DueValue>({ dueAt: null, allDay: true });
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    const ok = await onCreate({
      title: title.trim(),
      notes: notes.trim() ? notes.trim() : null,
      dueAt: due.dueAt,
      allDay: due.allDay,
      assigneeIds,
    });
    setSaving(false);
    if (ok) {
      setTitle("");
      setNotes("");
      setDue({ dueAt: null, allDay: true });
      setAssigneeIds([]);
      onDone?.();
    }
  };

  return (
    <div className="space-y-2 rounded-2xl border border-ds-border-default bg-ds-surface-2 p-3 opai-glass-soft-m">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
        placeholder="Nueva tarea…"
        aria-label="Título de la tarea"
        className={cn(INPUT, "h-10")}
      />
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        maxLength={5000}
        rows={2}
        placeholder="Detalles (opcional)"
        aria-label="Detalles de la tarea"
        className={cn(INPUT, "resize-none py-2")}
      />
      <TareaDueChips value={due} onChange={setDue} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[180px] flex-1">
          <TaskAssigneePicker users={users} value={assigneeIds} onChange={setAssigneeIds} />
        </div>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!title.trim() || saving}
          className="flex h-10 min-h-[44px] items-center gap-1.5 rounded-xl bg-primary px-4 text-ds-body font-medium text-primary-foreground disabled:opacity-50 sm:min-h-0"
        >
          <Plus className="h-4 w-4" /> Agregar
        </button>
      </div>
    </div>
  );
}
