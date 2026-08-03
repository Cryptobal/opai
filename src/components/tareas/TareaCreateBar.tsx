"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgendaTeamMember } from "@/components/agenda/agenda-calendar.types";
import { TaskAssigneePicker } from "@/components/agenda/TaskAssigneePicker";
import { TareaDueChips, type DueValue } from "./TareaDueChips";
import { TareaPriorityChips } from "./TareaPriorityChips";
import { TareaCrmLinkFields } from "./TareaCrmLinkFields";
import {
  EMPTY_CRM_LINK_DRAFT,
  type TareaCreateInput,
  type TareaCrmLinkDraft,
  type TareaPriority,
} from "./types";

const INPUT =
  "w-full rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] text-ds-text-1 opai-glass-soft placeholder:text-ds-text-4";

/** Creación inline: una línea colapsada → expande con due/prioridad/responsables/CRM. */
export function TareaCreateBar({
  users,
  onCreate,
  onDone,
}: {
  users: AgendaTeamMember[];
  onCreate: (input: TareaCreateInput) => Promise<boolean>;
  onDone?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TareaPriority>(null);
  const [due, setDue] = useState<DueValue>({ dueAt: null, allDay: true });
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [crmLinks, setCrmLinks] = useState<TareaCrmLinkDraft>(EMPTY_CRM_LINK_DRAFT);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setTitle("");
    setPriority(null);
    setDue({ dueAt: null, allDay: true });
    setAssigneeIds([]);
    setCrmLinks(EMPTY_CRM_LINK_DRAFT);
    setExpanded(false);
  };

  const submit = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    const ok = await onCreate({
      title: title.trim(),
      priority,
      dueAt: due.dueAt,
      allDay: due.allDay,
      assigneeIds,
      accountId: crmLinks.accountId,
      dealId: crmLinks.dealId,
      quoteId: crmLinks.quoteId,
      installationId: crmLinks.installationId,
    });
    setSaving(false);
    if (ok) {
      reset();
      onDone?.();
    }
  };

  useEffect(() => {
    if (!expanded) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        if (!title.trim()) reset();
        else setExpanded(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!title.trim()) reset();
        else setExpanded(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [expanded, title]);

  return (
    <div
      ref={rootRef}
      className="space-y-2 rounded-2xl border border-ds-border-default bg-ds-surface-2 p-3 opai-glass-soft-m"
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onFocus={() => setExpanded(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder="Nueva tarea…"
        aria-label="Título de la tarea"
        className={cn(INPUT, "h-10")}
      />
      {expanded && (
        <>
          <TareaDueChips value={due} onChange={setDue} />
          <TareaPriorityChips value={priority} onChange={setPriority} />
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-[180px] flex-1">
              <TaskAssigneePicker users={users} value={assigneeIds} onChange={setAssigneeIds} />
            </div>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!title.trim() || saving}
              className="flex h-10 min-h-[44px] items-center gap-1.5 rounded-xl bg-primary px-4 text-[13px] font-medium text-primary-foreground disabled:opacity-50 sm:min-h-0"
            >
              <Plus className="h-4 w-4" /> Agregar
            </button>
          </div>
          <TareaCrmLinkFields value={crmLinks} canEdit onChange={setCrmLinks} />
        </>
      )}
    </div>
  );
}
