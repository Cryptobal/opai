"use client";

/**
 * Checklist de un negocio (deal): lista tocable de pendientes con checkbox,
 * edición inline, vencimiento y borrado. Mobile-first (targets 44px). Consume
 * /api/crm/deals/[id]/tasks (GET/POST) y /api/crm/tasks/[id] (PATCH/DELETE).
 * Actualizaciones optimistas con rollback + toast en error.
 */

import { useCallback, useEffect, useState } from "react";
import { ListChecks, Trash2, Plus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/opai-ds/EmptyState";
import { Skeleton } from "@/components/opai-ds/Skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Task = { id: string; title: string; status: string; type: string; dueAt: string | null; createdAt: string };

const JSON_HEADERS = { "Content-Type": "application/json" };

export function DealChecklistSection({
  dealId,
  onCountChange,
}: {
  dealId: string;
  onCountChange?: (open: number) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const reportOpen = useCallback(
    (list: Task[]) => onCountChange?.(list.filter((t) => t.status !== "done").length),
    [onCountChange],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/crm/deals/${dealId}/tasks?status=all`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (!j?.success) return toast.error("No se pudo cargar el checklist");
        setTasks(j.data);
        reportOpen(j.data);
      })
      .catch(() => !cancelled && toast.error("No se pudo cargar el checklist"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [dealId, reportOpen]);

  async function toggle(task: Task) {
    const status = task.status === "done" ? "open" : "done";
    const snapshot = tasks;
    const next = tasks.map((t) => (t.id === task.id ? { ...t, status } : t));
    setTasks(next);
    reportOpen(next);
    try {
      const res = await fetch(`/api/crm/tasks/${task.id}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ status }) });
      if (!res.ok || !(await res.json())?.success) throw new Error();
    } catch {
      setTasks(snapshot);
      reportOpen(snapshot);
      toast.error("No se pudo actualizar el pendiente");
    }
  }

  async function saveEdit(id: string) {
    const title = editingText.trim();
    setEditingId(null);
    if (!title) return;
    const snapshot = tasks;
    setTasks((cur) => cur.map((t) => (t.id === id ? { ...t, title } : t)));
    try {
      const res = await fetch(`/api/crm/tasks/${id}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ title }) });
      if (!res.ok || !(await res.json())?.success) throw new Error();
    } catch {
      setTasks(snapshot);
      toast.error("No se pudo renombrar el pendiente");
    }
  }

  async function confirmDelete() {
    const id = deleteId;
    setDeleteId(null);
    if (!id) return;
    const snapshot = tasks;
    const next = tasks.filter((t) => t.id !== id);
    setTasks(next);
    reportOpen(next);
    try {
      const res = await fetch(`/api/crm/tasks/${id}`, { method: "DELETE" });
      if (!res.ok || !(await res.json())?.success) throw new Error();
    } catch {
      setTasks(snapshot);
      reportOpen(snapshot);
      toast.error("No se pudo eliminar el pendiente");
    }
  }

  async function addItem() {
    const title = newTitle.trim();
    if (!title || adding) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/crm/deals/${dealId}/tasks`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ title }) });
      const j = await res.json();
      if (!res.ok || !j?.success) throw new Error();
      setTasks((cur) => {
        const next = [...cur, j.data as Task];
        reportOpen(next);
        return next;
      });
      setNewTitle("");
    } catch {
      toast.error("No se pudo agregar el pendiente");
    } finally {
      setAdding(false);
    }
  }

  const done = tasks.filter((t) => t.status === "done").length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tasks.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="h-8 w-8" />}
          title="Sin pendientes"
          description="Crea ítems aquí o pídele al asistente que genere el checklist desde las bases."
          compact
        />
      ) : (
        <ul className="divide-y divide-ds-border-default rounded-ds-md border border-ds-border-default">
          {tasks.map((task) => (
            <ChecklistItem
              key={task.id}
              task={task}
              isEditing={editingId === task.id}
              editingText={editingText}
              onToggle={() => toggle(task)}
              onStartEdit={() => {
                setEditingId(task.id);
                setEditingText(task.title);
              }}
              onChangeEdit={setEditingText}
              onSaveEdit={() => saveEdit(task.id)}
              onCancelEdit={() => setEditingId(null)}
              onDelete={() => setDeleteId(task.id)}
            />
          ))}
        </ul>
      )}

      {tasks.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-ds-text-3">
            <span>{`${done} de ${tasks.length} completados`}</span>
            <span className="tabular-nums">{pct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-ds-sm bg-ds-surface-3">
            <div className="h-full rounded-ds-sm bg-status-ok-fg transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void addItem();
            }
          }}
          placeholder="Agregar ítem…"
          aria-label="Agregar ítem al checklist"
          className="flex-1"
        />
        <button
          type="button"
          onClick={() => void addItem()}
          disabled={!newTitle.trim() || adding}
          aria-label="Agregar ítem"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-ds-md border border-ds-border-default text-ds-text-2 transition-colors hover:bg-ds-surface-2 disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Eliminar pendiente"
        description="El pendiente será eliminado del checklist de este negocio."
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function ChecklistItem({
  task,
  isEditing,
  editingText,
  onToggle,
  onStartEdit,
  onChangeEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
}: {
  task: Task;
  isEditing: boolean;
  editingText: string;
  onToggle: () => void;
  onStartEdit: () => void;
  onChangeEdit: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
}) {
  const isDone = task.status === "done";
  const due = task.dueAt ? new Date(task.dueAt) : null;
  const overdue = !!due && !isDone && due.getTime() < Date.now();
  const dueLabel = due ? due.toLocaleDateString("es-CL", { day: "2-digit", month: "short" }) : null;

  return (
    <li className="flex min-h-11 items-center gap-1 px-1">
      <button
        type="button"
        onClick={onToggle}
        aria-label={isDone ? "Marcar como pendiente" : "Marcar como completado"}
        className="flex h-11 w-11 shrink-0 items-center justify-center"
      >
        <Checkbox checked={isDone} className="pointer-events-none" />
      </button>

      {isEditing ? (
        <Input
          autoFocus
          value={editingText}
          onChange={(e) => onChangeEdit(e.target.value)}
          onBlur={onSaveEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSaveEdit();
            } else if (e.key === "Escape") {
              onCancelEdit();
            }
          }}
          aria-label="Editar pendiente"
          className="flex-1"
        />
      ) : (
        <button
          type="button"
          onClick={onStartEdit}
          className={cn(
            "flex-1 truncate py-2 text-left text-sm",
            isDone ? "text-ds-text-3 line-through" : "text-ds-text-1",
          )}
        >
          {task.title}
        </button>
      )}

      {dueLabel && !isEditing && (
        <span className={cn("shrink-0 px-1 text-xs tabular-nums", overdue ? "text-status-danger-fg" : "text-ds-text-3")}>
          {dueLabel}
        </span>
      )}

      <button
        type="button"
        onClick={onDelete}
        aria-label="Eliminar pendiente"
        className="flex h-11 w-11 shrink-0 items-center justify-center text-ds-text-3 transition-colors hover:text-status-danger-fg"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}
