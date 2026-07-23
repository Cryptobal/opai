"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { AgendaTeamMember } from "@/components/agenda/agenda-calendar.types";
import { groupTasksByDue } from "@/modules/tareas/tareas.service";
import type { TareaItem, TareaCreateInput, TareaFilters } from "./types";

/** Datos + acciones de /opai/tareas (GET/POST/PATCH/DELETE /api/crm/tasks). */
export function useTareas() {
  const [tasks, setTasks] = useState<TareaItem[]>([]);
  const [users, setUsers] = useState<AgendaTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<TareaFilters>({ status: "open", assigneeId: "", q: "" });

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

  return { tasks, groups, users, nameById, loading, filters, setFilters, create, toggleDone, remove, reload: load };
}
