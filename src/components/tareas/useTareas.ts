"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/ui/confirm-service";
import type { AgendaTeamMember } from "@/components/agenda/agenda-calendar.types";
import { ymdInChile } from "@/lib/dates-cl";
import {
  bucketForDueYmd,
  computeBoundaries,
  isOpenTaskStatus,
} from "@/modules/tareas/tareas.service";
import { groupTasksBy } from "@/modules/tareas/tareas-group";
import type {
  TareaItem,
  TareaCreateInput,
  TareaUpdateInput,
  TareaFilters,
  TareaKpis,
  TareaVista,
} from "./types";

/** Aplica un patch parcial a una tarea (optimismo local). */
function applyTareaPatch(t: TareaItem, input: TareaUpdateInput): TareaItem {
  const next: TareaItem = { ...t };
  if (input.title !== undefined) next.title = input.title;
  if (input.notes !== undefined) next.notes = input.notes;
  if (input.priority !== undefined) next.priority = input.priority;
  if (input.dueAt !== undefined) next.dueAt = input.dueAt;
  if (input.allDay !== undefined) next.allDay = input.allDay;
  if (input.status !== undefined) next.status = input.status;
  if (input.assigneeIds !== undefined) {
    next.assigneeIds = input.assigneeIds;
    next.assignedTo = input.assigneeIds[0] ?? null;
  }
  return next;
}

function normalizeTask(raw: TareaItem): TareaItem {
  return {
    ...raw,
    priority: (raw.priority as TareaItem["priority"]) ?? null,
    emailThreadSubject: raw.emailThreadSubject ?? null,
    accountName: raw.accountName ?? null,
    dealTitle: raw.dealTitle ?? null,
  };
}

/** Datos + acciones de /opai/tareas (GET/POST/PATCH/DELETE /api/crm/tasks). */
export function useTareas() {
  const [tasks, setTasks] = useState<TareaItem[]>([]);
  const [users, setUsers] = useState<AgendaTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<TareaVista>("fecha");
  const [filters, setFilters] = useState<TareaFilters>({ status: "open", assigneeId: "", q: "" });
  const tasksRef = useRef<TareaItem[]>(tasks);
  const filtersRef = useRef<TareaFilters>(filters);
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);
  useEffect(() => { filtersRef.current = filters; }, [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.status !== "all") params.set("status", filters.status);
    if (filters.assigneeId) params.set("assigneeId", filters.assigneeId);
    if (filters.q.trim()) params.set("q", filters.q.trim());
    params.set("limit", "200");
    const res = await fetch(`/api/crm/tasks?${params.toString()}`).catch(() => null);
    const json = res?.ok ? await res.json() : null;
    const rows: TareaItem[] = Array.isArray(json?.data) ? json.data : [];
    setTasks(rows.map(normalizeTask));
    setLoading(false);
  }, [filters.status, filters.assigneeId, filters.q]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    fetch("/api/crm/users")
      .then((r) => r.json())
      .then((json) => setUsers(json?.data?.users ?? []))
      .catch(() => setUsers([]));
  }, []);

  const create = useCallback(async (input: TareaCreateInput): Promise<boolean> => {
    const res = await fetch("/api/crm/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title,
        notes: input.notes ?? undefined,
        priority: input.priority ?? undefined,
        dueAt: input.dueAt ?? undefined,
        allDay: input.allDay,
        assigneeIds: input.assigneeIds.length ? input.assigneeIds : undefined,
      }),
    }).catch(() => null);
    if (!res?.ok) {
      toast.error("No se pudo crear la tarea");
      return false;
    }
    toast.success("Tarea creada");
    void load();
    return true;
  }, [load]);

  const update = useCallback(async (id: string, input: TareaUpdateInput): Promise<boolean> => {
    const snapshot = tasksRef.current;
    setTasks((prev) => prev.map((t) => (t.id === id ? applyTareaPatch(t, input) : t)));
    const res = await fetch(`/api/crm/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).catch(() => null);
    if (!res?.ok) {
      setTasks(snapshot);
      toast.error("No se pudo guardar la tarea");
      return false;
    }
    const f = filtersRef.current;
    const affectsView =
      input.dueAt !== undefined ||
      input.status !== undefined ||
      input.priority !== undefined ||
      (input.title !== undefined && f.q.trim() !== "") ||
      (input.assigneeIds !== undefined && f.assigneeId !== "");
    if (affectsView) void load();
    return true;
  }, [load]);

  const toggleDone = useCallback(async (task: TareaItem) => {
    const next = task.status === "done" ? "open" : "done";
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)),
    );
    const res = await fetch(`/api/crm/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    }).catch(() => null);
    if (!res?.ok) {
      toast.error("No se pudo actualizar la tarea");
      void load();
      return;
    }
    if (filters.status !== "all") void load();
  }, [load, filters.status]);

  const remove = useCallback(async (id: string): Promise<boolean> => {
    const ok = await confirmDialog({
      title: "Eliminar tarea",
      description: "Esta acción no se puede deshacer. ¿Eliminar la tarea?",
      confirmLabel: "Eliminar",
      variant: "destructive",
    });
    if (!ok) return false;
    const snapshot = tasksRef.current;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    const res = await fetch(`/api/crm/tasks/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      setTasks(snapshot);
      toast.error("No se pudo eliminar la tarea");
      return false;
    }
    toast.success("Tarea eliminada");
    return true;
  }, []);

  const nameById = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users]);
  const assigneeNames = useMemo(
    () => Object.fromEntries(users.map((u) => [u.id, u.name])),
    [users],
  );

  const groups = useMemo(
    () => groupTasksBy(view, tasks, { assigneeNames }),
    [view, tasks, assigneeNames],
  );

  const groupsFecha = useMemo(
    () => groupTasksBy("fecha", tasks, { assigneeNames }),
    [tasks, assigneeNames],
  );

  const kpis: TareaKpis = useMemo(() => {
    const b = computeBoundaries();
    let vencidas = 0;
    let hoy = 0;
    let semana = 0;
    for (const t of tasks) {
      if (!isOpenTaskStatus(t.status)) continue;
      const ymd = t.dueAt ? ymdInChile(new Date(t.dueAt)) : null;
      const bucket = bucketForDueYmd(ymd, b);
      if (bucket === "vencidas") vencidas += 1;
      else if (bucket === "hoy") hoy += 1;
      else if (bucket === "manana" || bucket === "semana") semana += 1;
    }
    return { vencidas, hoy, semana };
  }, [tasks]);

  return {
    tasks, groups, groupsFecha, kpis, view, setView, users, nameById, loading,
    filters, setFilters, create, update, toggleDone, remove, reload: load,
  };
}
