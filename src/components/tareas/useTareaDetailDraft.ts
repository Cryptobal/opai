"use client";

import { useEffect, useState } from "react";
import type { DueValue } from "./TareaDatePopover";
import {
  crmLinksFromTask,
  EMPTY_CRM_LINK_DRAFT,
  type TareaCrmLinkDraft,
  type TareaItem,
  type TareaPriority,
  type TareaUpdateInput,
} from "./types";

const sameIds = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

function linksDirty(a: TareaCrmLinkDraft, task: TareaItem): boolean {
  return (
    (a.accountId ?? null) !== (task.accountId ?? null) ||
    (a.dealId ?? null) !== (task.dealId ?? null) ||
    (a.quoteId ?? null) !== (task.quoteId ?? null) ||
    (a.installationId ?? null) !== (task.installationId ?? null)
  );
}

/** Draft local del detalle (sheet/panel) + dirty + buildPatch. */
export function useTareaDetailDraft(task: TareaItem | null) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState<TareaPriority>(null);
  const [due, setDue] = useState<DueValue>({ dueAt: null, allDay: true });
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [crmLinks, setCrmLinks] = useState<TareaCrmLinkDraft>(EMPTY_CRM_LINK_DRAFT);

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setNotes(task.notes ?? "");
    setPriority(task.priority ?? null);
    setDue({ dueAt: task.dueAt, allDay: task.allDay });
    setAssigneeIds(task.assigneeIds);
    setCrmLinks(crmLinksFromTask(task));
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const dueDirty = task
    ? due.dueAt !== task.dueAt || due.allDay !== task.allDay
    : false;

  const dirty = Boolean(
    task && (
      title.trim() !== task.title ||
      (notes.trim() || null) !== (task.notes ?? null) ||
      (priority ?? null) !== (task.priority ?? null) ||
      dueDirty ||
      !sameIds(assigneeIds, task.assigneeIds) ||
      linksDirty(crmLinks, task)
    ),
  );

  const buildPatch = (): TareaUpdateInput | null => {
    if (!task) return null;
    if (!title.trim()) return null;
    const input: TareaUpdateInput = {};
    if (title.trim() !== task.title) input.title = title.trim();
    const nextNotes = notes.trim() ? notes.trim() : null;
    if (nextNotes !== (task.notes ?? null)) input.notes = nextNotes;
    if ((priority ?? null) !== (task.priority ?? null)) input.priority = priority;
    if (dueDirty) { input.dueAt = due.dueAt; input.allDay = due.allDay; }
    if (assigneeIds.length && !sameIds(assigneeIds, task.assigneeIds)) input.assigneeIds = assigneeIds;
    if (linksDirty(crmLinks, task)) {
      input.accountId = crmLinks.accountId;
      input.dealId = crmLinks.dealId;
      input.quoteId = crmLinks.quoteId;
      input.installationId = crmLinks.installationId;
      input.accountName = crmLinks.accountName;
      input.dealTitle = crmLinks.dealTitle;
      input.quoteLabel = crmLinks.quoteLabel;
      input.installationName = crmLinks.installationName;
    }
    return input;
  };

  return {
    title, setTitle, notes, setNotes, priority, setPriority,
    due, setDue, assigneeIds, setAssigneeIds,
    crmLinks, setCrmLinks, dirty, buildPatch,
  };
}
