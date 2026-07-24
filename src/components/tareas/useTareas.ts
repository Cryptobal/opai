"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { AgendaTeamMember } from "@/components/agenda/agenda-calendar.types";
import { groupTasksByDue } from "@/modules/tareas/tareas.service";
import type { TareaItem, TareaCreateInput, TareaUpdateInput, TareaFilters } from "./types";

/** Aplica un patch parcial a una tarea (optimismo local). Resincroniza la
 *  denormalización `assignedTo` (= primer responsable) igual que el servidor. */
function applyTareaPatch(t: TareaItem, input: TareaUpdateInput): TareaItem {
  const next: TareaItem = { ...t };
  if (input.title !== undefined) next.title = input.title;
  if (input.notes !== undefined) next.notes = input.notes;
  if (input.dueAt !== undefined) next.dueAt = input.dueAt;
  if (input.allDay !== undefined) next.allDay = input.allDay;
  if (input.status !== undefined) next.status = input.status;
  if (input.assigneeIds !== undefined) {
    next.assigneeIds = input.assigneeIds;
    next.assignedTo = input.assigneeIds[0] ?? null;
  }
  return next;
}

/** Datos + acciones de /opai/tareas (GET/POST/PATCH/DELETE /api/crm/tasks). */
export function useTareas() {
  const [tasks, setTasks] = useState<TareaItem[]>([]);
  const [users, setUsers] = useState<AgendaTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<TareaFilters>({ status: "open", assigneeId: "", q: "" });
  // Snapshot vivo para revertir el optimismo sin volver a pedir al servidor.
  const tasksRef = useRef<TareaItem[]>(tasks);
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.status !== "all") params.set("status", filters.status);
    if (filters.assigneeId) params.set("assigneeId", filters.assigneeId);
    if (filters.q.trim()) params.set("q", filters.q.trim());
    params.set("limit", "200");
    const res = await fetch(`/api/crm/tasks?${params.toString()}`).catch(() => null);
    const json = res?.ok ? await res.json() : null;
    setTasks(Array.isArray(json?.data) ? json.data : []);
    setLoading(false);
  }, [filters.status, filters.assigneeId, filters.q]);

  useEffect(() => {
    void load();
  }, [load]);

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

  /**
   * Edición parcial optimista. Aplica el patch local de inmediato, guarda el
   * snapshot previo y revierte si el PATCH falla. Recarga cuando el cambio
   * afecta el agrupamiento/filtro (dueAt / status).
   */
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
    if (input.dueAt !== undefined || input.status !== undefined) void load();
    return true;
  }, [load]);

  const toggleDone = useCallback(async (task: TareaItem) => {
    const next = task.status === "done" ? "open" : "done";
    // Optimista: quita/actualiza de inmediato.
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
    // Si el filtro es "open", la tarea completada desaparece al recargar.
    if (filters.status !== "all") void load();
  }, [load, filters.status]);

  const remove = useCallback(async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    const res = await fetch(`/api/crm/tasks/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      toast.error("No se pudo eliminar la tarea");
      void load();
      return;
    }
    toast.success("Tarea eliminada");
  }, [load]);

  const groups = useMemo(() => groupTasksByDue(tasks), [tasks]);
  const nameById = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users]);

  return { tasks, groups, users, nameById, loading, filters, setFilters, create, update, toggleDone, remove, reload: load };
}
