"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/ui/confirm-service";
import { Spinner } from "@/components/opai-ds";
import { canDeleteTarea } from "@/lib/productividad-task-ownership";
import { TareaDetailSheet } from "@/components/tareas/TareaDetailSheet";
import type { TareaItem, TareaUpdateInput } from "@/components/tareas/types";
import type { AgendaTeamMember } from "../agenda-calendar.types";

type Props = {
  taskId: string;
  users: AgendaTeamMember[];
  currentUserId: string;
  userRole: string;
  onClose: () => void;
  onChanged: () => void;
};

function toTareaItem(raw: Record<string, unknown>): TareaItem {
  const assignees = Array.isArray(raw.assigneeIds)
    ? raw.assigneeIds.filter((x): x is string => typeof x === "string")
    : [];
  const priority =
    raw.priority === "high" || raw.priority === "medium" || raw.priority === "low"
      ? raw.priority
      : null;
  return {
    id: String(raw.id),
    title: String(raw.title ?? ""),
    notes: (raw.notes as string | null) ?? null,
    priority,
    status: String(raw.status ?? "open"),
    type: String(raw.type ?? "task"),
    dueAt: raw.dueAt ? new Date(raw.dueAt as string).toISOString() : null,
    allDay: raw.allDay === true,
    assignedTo: (raw.assignedTo as string | null) ?? null,
    completedBy: (raw.completedBy as string | null) ?? null,
    completedAt: raw.completedAt ? new Date(raw.completedAt as string).toISOString() : null,
    dealId: (raw.dealId as string | null) ?? null,
    accountId: (raw.accountId as string | null) ?? null,
    emailThreadId: (raw.emailThreadId as string | null) ?? null,
    quoteId: (raw.quoteId as string | null) ?? null,
    installationId: (raw.installationId as string | null) ?? null,
    emailThreadSubject: (raw.emailThreadSubject as string | null) ?? null,
    accountName: (raw.accountName as string | null) ?? null,
    dealTitle: (raw.dealTitle as string | null) ?? null,
    quoteLabel: (raw.quoteLabel as string | null) ?? null,
    installationName: (raw.installationName as string | null) ?? null,
    createdAt: raw.createdAt ? new Date(raw.createdAt as string).toISOString() : new Date().toISOString(),
    createdBy: (raw.createdBy as string | null) ?? null,
    assigneeIds: assignees,
  };
}

/** Carga una tarea por id y monta el modal canónico `TareaDetailSheet`. */
export function AgendaTaskDetail({
  taskId,
  users,
  currentUserId,
  userRole,
  onClose,
  onChanged,
}: Props) {
  const [task, setTask] = useState<TareaItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMissing(false);
    fetch(`/api/crm/tasks/${taskId}`)
      .then(async (r) => {
        if (r.status === 404 || r.status === 403) {
          if (!cancelled) {
            setMissing(true);
            setTask(null);
          }
          return;
        }
        const json = await r.json().catch(() => null);
        if (!cancelled && json?.success && json.data) {
          setTask(toTareaItem(json.data as Record<string, unknown>));
        } else if (!cancelled) {
          setMissing(true);
        }
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  useEffect(() => {
    if (missing) {
      toast.error("No se encontró la tarea");
      onClose();
    }
  }, [missing, onClose]);

  const onSave = useCallback(
    async (id: string, input: TareaUpdateInput): Promise<boolean> => {
      const {
        accountName: _a,
        dealTitle: _d,
        quoteLabel: _q,
        installationName: _i,
        ...apiInput
      } = input;
      const r = await fetch(`/api/crm/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiInput),
      }).catch(() => null);
      if (!r?.ok) {
        toast.error("No se pudo guardar la tarea");
        return false;
      }
      const json = await r.json().catch(() => null);
      if (json?.data) {
        setTask((current) =>
          current
            ? {
                ...current,
                ...toTareaItem({ ...current, ...(json.data as Record<string, unknown>) }),
              }
            : toTareaItem(json.data as Record<string, unknown>),
        );
      }
      toast.success("Tarea actualizada");
      onChanged();
      return true;
    },
    [onChanged],
  );

  const onToggle = useCallback(
    (t: TareaItem) => {
      const next = t.status === "done" ? "open" : "done";
      void fetch(`/api/crm/tasks/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      })
        .then(async (r) => {
          if (!r.ok) throw new Error();
          const json = await r.json().catch(() => null);
          if (json?.data) setTask(toTareaItem(json.data as Record<string, unknown>));
          else setTask({ ...t, status: next });
          toast.success(next === "done" ? "Tarea completada" : "Tarea reabierta");
          onChanged();
        })
        .catch(() => toast.error("No se pudo actualizar el estado"));
    },
    [onChanged],
  );

  const onDelete = useCallback(
    async (id: string) => {
      if (
        !(await confirmDialog({
          title: "Eliminar tarea",
          description: "Esta acción no se puede deshacer.",
          confirmLabel: "Eliminar",
          cancelLabel: "Cancelar",
          variant: "destructive",
        }))
      ) {
        return;
      }
      const r = await fetch(`/api/crm/tasks/${id}`, { method: "DELETE" }).catch(() => null);
      if (!r?.ok) {
        toast.error("No se pudo eliminar");
        return;
      }
      toast.success("Tarea eliminada");
      onChanged();
      onClose();
    },
    [onChanged, onClose],
  );

  if (loading) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
        <Spinner />
      </div>
    );
  }

  if (!task) return null;

  const nameById = new Map(users.map((u) => [u.id, u.name || u.email || u.id]));

  return (
    <TareaDetailSheet
      task={task}
      users={users}
      nameById={nameById}
      canEdit
      canDelete={canDeleteTarea(task, currentUserId, userRole)}
      onClose={onClose}
      onSave={onSave}
      onDelete={onDelete}
      onToggle={onToggle}
    />
  );
}
