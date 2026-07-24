"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Mail, ExternalLink } from "lucide-react";
import { Avatar } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import type { AgendaTeamMember } from "@/components/agenda/agenda-calendar.types";
import { TaskAssigneePicker } from "@/components/agenda/TaskAssigneePicker";
import { TareaDueChips, type DueValue } from "./TareaDueChips";
import type { TareaItem } from "./types";

const NOTES_MAX = 5000;

/** Textarea que crece con el contenido (sin manija nativa de resize). */
function AutoTextarea({ className, value, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return <textarea ref={ref} value={value} className={cn("resize-none", className)} {...rest} />;
}

const FIELD = "w-full rounded-2xl border border-ds-border-default bg-ds-surface-1 px-3 py-2 text-ds-text-1 opai-glass-soft placeholder:text-ds-text-4 focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-70";

export function TareaDetailFields({
  task,
  canEdit,
  title,
  notes,
  assigneeIds,
  users,
  onTitle,
  onNotes,
  onAssignees,
  onDue,
}: {
  task: TareaItem;
  canEdit: boolean;
  title: string;
  notes: string;
  assigneeIds: string[];
  users: AgendaTeamMember[];
  onTitle: (v: string) => void;
  onNotes: (v: string) => void;
  onAssignees: (ids: string[]) => void;
  onDue: (next: DueValue) => void;
}) {
  const names = assigneeIds.map((id) => users.find((u) => u.id === id)?.name).filter((n): n is string => Boolean(n));

  return (
    <div className="space-y-4 py-2">
      <AutoTextarea
        value={title}
        onChange={(e) => onTitle(e.target.value)}
        readOnly={!canEdit}
        rows={1}
        aria-label="Título de la tarea"
        placeholder="Título de la tarea"
        className={cn(FIELD, "text-[15px] font-medium")}
      />

      <div className="space-y-1.5">
        <label className="px-1 text-[12px] font-medium text-ds-text-4">Detalles</label>
        <AutoTextarea
          value={notes}
          onChange={(e) => onNotes(e.target.value)}
          readOnly={!canEdit}
          maxLength={NOTES_MAX}
          aria-label="Detalles de la tarea"
          placeholder="Agrega contexto: qué hay que hacer, dónde, con quién, condiciones de cierre…"
          className={cn(FIELD, "min-h-[74px] text-[13px]")}
        />
      </div>

      {task.emailThreadId && (
        <div className="space-y-1.5">
          <span className="px-1 text-[12px] font-medium text-ds-text-4">Origen</span>
          <Link
            href={`/crm/correos?thread=${task.emailThreadId}`}
            className="opai-glass-soft flex min-h-[44px] items-center gap-2 rounded-2xl px-3 text-[13px] text-ds-text-1 hover:text-primary"
          >
            <Mail className="h-4 w-4 shrink-0 text-ds-text-4" />
            <span className="min-w-0 flex-1 truncate">Ver correo de origen</span>
            <ExternalLink className="h-4 w-4 shrink-0 text-ds-text-4" />
          </Link>
        </div>
      )}

      {canEdit && (
        <div className="space-y-1.5">
          <span className="px-1 text-[12px] font-medium text-ds-text-4">Vencimiento</span>
          <TareaDueChips value={{ dueAt: task.dueAt, allDay: task.allDay }} onChange={onDue} />
        </div>
      )}

      <div className="space-y-1.5">
        <span className="px-1 text-[12px] font-medium text-ds-text-4">Responsables</span>
        {canEdit ? (
          <TaskAssigneePicker users={users} value={assigneeIds} onChange={onAssignees} />
        ) : names.length ? (
          <div className="flex flex-wrap gap-1.5">
            {names.map((name, i) => (
              <span key={i} className="opai-glass-soft inline-flex min-h-[36px] items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5 text-[13px] text-ds-text-1">
                <Avatar name={name} size="sm" variant="brand" />
                {name}
              </span>
            ))}
          </div>
        ) : (
          <p className="px-1 text-[13px] text-ds-text-4">Sin responsables</p>
        )}
      </div>
    </div>
  );
}
