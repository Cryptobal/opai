"use client";

import { useEffect, useState } from "react";
import { CheckSquare, ListTodo, Plus, Sparkles, Square } from "lucide-react";
import { toast } from "sonner";

type Task = { id: string; title: string; status: string; dueAt: string | null };

function fmtDue(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "short" }) : "";
}

/**
 * Tareas del correo: convierte un hilo en acción con dueño (quien la crea) y
 * fecha. La tarea hereda la asociación (cuenta/negocio/contacto) del hilo y, con
 * fecha, dispara el recordatorio por Slack del cron existente.
 */
export function CorreoTasksPanel({ threadId, subject }: { threadId: string; subject: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState<"add" | "sug" | null>(null);

  useEffect(() => {
    fetch(`/api/crm/correos/${threadId}/tasks`)
      .then((r) => r.json())
      .then((d) => setTasks(d.tasks ?? []))
      .catch(() => undefined);
  }, [threadId]);

  async function add() {
    const t = title.trim() || `Seguimiento: ${subject}`;
    setBusy("add");
    try {
      const d = await fetch(`/api/crm/correos/${threadId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t, dueAt: due || undefined }),
      }).then((r) => r.json());
      if (d.task) {
        setTasks((p) => [d.task, ...p]);
        setTitle("");
        setDue("");
        toast.success("Tarea agendada");
      } else {
        toast.error(d.error || "No se pudo crear la tarea");
      }
    } finally {
      setBusy(null);
    }
  }

  async function suggest() {
    setBusy("sug");
    try {
      const d = await fetch(`/api/crm/correos/${threadId}/tasks/suggest`, { method: "POST" }).then((r) => r.json());
      if (d.title) setTitle(d.title);
    } finally {
      setBusy(null);
    }
  }

  async function toggle(task: Task) {
    const next = task.status === "done" ? "open" : "done";
    setTasks((p) => p.map((x) => (x.id === task.id ? { ...x, status: next } : x)));
    await fetch(`/api/crm/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    }).catch(() => undefined);
  }

  return (
    <div className="space-y-2 rounded-xl border border-ds-border-subtle bg-ds-surface-2 p-2.5">
      <div className="flex items-center gap-2">
        <ListTodo className="h-4 w-4 text-tint-violet-fg" />
        <p className="text-[13px] font-semibold text-ds-text-1">Tareas</p>
      </div>

      {tasks.length > 0 && (
        <ul className="space-y-1">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-center gap-2 text-[13px]">
              <button type="button" onClick={() => void toggle(t)} className="shrink-0 text-ds-text-3 ds-tap" aria-label="Completar">
                {t.status === "done" ? (
                  <CheckSquare className="h-4 w-4 text-status-ok-fg" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
              </button>
              <span className={`min-w-0 flex-1 truncate ${t.status === "done" ? "text-ds-text-4 line-through" : "text-ds-text-1"}`}>
                {t.title}
              </span>
              {t.dueAt && <span className="shrink-0 text-[12px] text-ds-text-4">{fmtDue(t.dueAt)}</span>}
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nueva tarea (o Sugerir)…"
          className="h-9 min-w-0 flex-1 rounded-lg border border-ds-border-default bg-ds-surface-1 px-2 text-[13px] text-ds-text-1"
        />
        <button
          type="button"
          onClick={() => void suggest()}
          disabled={busy !== null}
          title="Sugerir el próximo paso con IA"
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-ds-border-default px-2 text-[12px] ds-tap disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" /> {busy === "sug" ? "…" : "Sugerir"}
        </button>
      </div>
      <div className="flex gap-2">
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="h-9 min-w-0 flex-1 rounded-lg border border-ds-border-default bg-ds-surface-1 px-2 text-[13px] text-ds-text-1"
        />
        <button
          type="button"
          onClick={() => void add()}
          disabled={busy !== null}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground ds-tap disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> {busy === "add" ? "Agendando…" : "Agendar"}
        </button>
      </div>
    </div>
  );
}
